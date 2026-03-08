import logging
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.user import ProfileResponse
from app.schemas.auth import Role
from app.services.auth_service import (
    get_user_by_email, verify_password, hash_password
)
import uuid

logger = logging.getLogger(__name__)


def _to_profile(user: User) -> ProfileResponse:
    return ProfileResponse(
        id=uuid.UUID(user.id),
        name=user.name,
        email=user.email,
        role=Role(user.role),
        created_at=user.created_at.isoformat(),
    )


def get_profile(email: str, db: Session) -> Optional[ProfileResponse]:
    user = get_user_by_email(db, email)
    if not user:
        return None
    return _to_profile(user)


def update_name(
    email: str, new_name: str, db: Session
) -> Tuple[Optional[ProfileResponse], Optional[str]]:
    user = get_user_by_email(db, email)
    if not user:
        return None, "User not found"

    user.name = new_name.strip()
    db.commit()
    db.refresh(user)

    logger.info("Name updated: %s → %s", email, new_name)
    return _to_profile(user), None


def change_password(
    email: str, current_password: str, new_password: str, db: Session
) -> Tuple[bool, Optional[str]]:
    user = get_user_by_email(db, email)
    if not user:
        return False, "User not found"

    # Verify current password before allowing change
    # WHY: prevents someone who grabbed a session from changing the password
    if not verify_password(current_password, user.hashed_password):
        return False, "Current password is incorrect"

    if current_password == new_password:
        return False, "New password must be different from current password"

    user.hashed_password = hash_password(new_password)
    db.commit()

    logger.info("Password changed: %s", email)
    return True, None

