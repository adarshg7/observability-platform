from typing import Annotated
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.schemas.auth import UserResponse
from app.schemas.user import ProfileUpdateRequest, PasswordChangeRequest, ProfileResponse
from app.services.user_service import get_profile, update_name, change_password
from app.api.routes.auth import require_auth
from app.database import get_db
from app.models.user_setting import UserSetting
from pydantic import BaseModel

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/me/profile", response_model=ProfileResponse)
def get_my_profile(
    current_user: Annotated[UserResponse, Depends(require_auth)],
    db:           Annotated[Session,      Depends(get_db)],
):
    profile = get_profile(current_user.email, db)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return profile


@router.put("/me/profile", response_model=ProfileResponse)
def update_my_profile(
    body:         ProfileUpdateRequest,
    current_user: Annotated[UserResponse, Depends(require_auth)],
    db:           Annotated[Session,      Depends(get_db)],
):
    profile, error = update_name(current_user.email, body.name, db)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return profile


@router.put("/me/password", status_code=204)
def update_my_password(
    body:         PasswordChangeRequest,
    current_user: Annotated[UserResponse, Depends(require_auth)],
    db:           Annotated[Session,      Depends(get_db)],
):
    success, error = change_password(
        current_user.email,
        body.current_password,
        body.new_password,
        db,
    )
    if not success:
        raise HTTPException(status_code=400, detail=error)
    return None


# ── User settings (key-value store) ──────────────────────────────────

class SettingsPayload(BaseModel):
    settings: dict[str, str]   # e.g. {"driftThreshold": "0.15", "accuracyFloor": "75"}


# H1 FIX: Keys that must NEVER be returned in any API response
# The SMTP password is stored (encrypted at rest recommendation) but must
# never flow back to any client in a response body.
_SENSITIVE_KEYS = frozenset({"smtpPassword"})

# H4 FIX: Explicit allowlist — only these keys can be written to user_settings.
# Rejects garbage, injection attempts, and DoS key flooding.
_ALLOWED_SETTINGS_KEYS = frozenset({
    "driftThreshold", "hallucinationLimit", "accuracyFloor",
    "mlLatencySLA", "llmLatencySLA", "refreshInterval",
    "emailEnabled", "emailFrom", "emailTo",
    "smtpHost", "smtpPort", "smtpUser", "smtpPassword", "smtpUseTls",
})


@router.get("/me/settings")
def get_settings(
    current_user: Annotated[UserResponse, Depends(require_auth)],
    db:           Annotated[Session,      Depends(get_db)],
):
    """Load all saved settings for the current user — sensitive values are stripped."""
    rows = db.query(UserSetting).filter(UserSetting.user_id == str(current_user.id)).all()
    return {
        r.key: "[protected]" if r.key in _SENSITIVE_KEYS else r.value
        for r in rows
    }


@router.put("/me/settings")
def save_settings(
    body:         SettingsPayload,
    current_user: Annotated[UserResponse, Depends(require_auth)],
    db:           Annotated[Session,      Depends(get_db)],
):
    """Upsert settings for the current user (allowlisted keys only)."""
    user_id = str(current_user.id)
    saved = 0
    rejected = []
    for key, value in body.settings.items():
        # H4 FIX: Reject keys not in the explicit allowlist
        if key not in _ALLOWED_SETTINGS_KEYS:
            rejected.append(key)
            continue
        # Enforce max value length to prevent DB bloat
        if len(str(value)) > 500:
            raise HTTPException(status_code=400, detail=f"Value for '{key}' is too long (max 500 chars)")
        existing = db.query(UserSetting).filter(
            UserSetting.user_id == user_id,
            UserSetting.key     == key,
        ).first()
        if existing:
            existing.value = value
        else:
            db.add(UserSetting(user_id=user_id, key=key, value=value))
        saved += 1
    db.commit()
    result = {"message": "Settings saved", "saved": saved}
    if rejected:
        result["rejected"] = rejected  # tell caller which keys were ignored
    return result
