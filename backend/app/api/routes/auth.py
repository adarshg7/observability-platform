import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse, Role
from app.services.auth_service import login_user, register_user, get_current_user
from app.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# M1 FIX: Redis-backed rate limiter — works correctly across multiple uvicorn workers.
# In-memory dict only works for single-worker dev mode; under load balancing it's bypassed
# because each worker process has its own separate dict.
# With Redis, all workers share ONE counter so the limit is truly enforced.
_rate_limit_store: dict[str, list] = {}   # in-memory fallback (Redis unavailable)
RATE_LIMIT_ATTEMPTS = 5
RATE_LIMIT_WINDOW   = 60


async def _check_rate_limit_redis(key: str) -> bool:
    """
    Returns True if the request is allowed, False if it should be blocked.
    Uses Redis INCR + EXPIRE for atomic multi-process-safe counting.
    Falls back to in-memory if Redis is not available.
    """
    from app.services.alert_service import _redis_client
    if _redis_client:
        try:
            count = await _redis_client.incr(key)
            if count == 1:
                await _redis_client.expire(key, RATE_LIMIT_WINDOW)
            return count <= RATE_LIMIT_ATTEMPTS
        except Exception:
            pass  # Redis hiccup — fall through to in-memory fallback
    # In-memory fallback (single-worker only)
    from datetime import datetime, timezone
    now  = datetime.now(timezone.utc).timestamp()
    hits = [t for t in _rate_limit_store.get(key, []) if now - t < RATE_LIMIT_WINDOW]
    hits.append(now)
    _rate_limit_store[key] = hits
    return len(hits) <= RATE_LIMIT_ATTEMPTS


def _check_rate_limit(ip: str, endpoint: str) -> None:
    """Sync wrapper — uses asyncio to run the async Redis check."""
    import asyncio
    key = f"ratelimit:{ip}:{endpoint}"
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside a running event loop (FastAPI) — schedule as async task
            # Since this is a sync route, use run_coroutine_threadsafe
            import concurrent.futures
            future = asyncio.run_coroutine_threadsafe(_check_rate_limit_redis(key), loop)
            allowed = future.result(timeout=1.0)
        else:
            allowed = asyncio.run(_check_rate_limit_redis(key))
    except Exception:
        allowed = True  # Redis/loop error — don't block legitimate requests
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Try again in {RATE_LIMIT_WINDOW} seconds.",
            headers={"Retry-After": str(RATE_LIMIT_WINDOW)},
        )



# ── Auth dependencies ─────────────────────────────────────────────────
def require_auth(
    token: Annotated[str, Depends(oauth2_scheme)],
    db:    Annotated[Session, Depends(get_db)],
) -> UserResponse:
    user = get_current_user(token, db)
    if not user:
        raise HTTPException(
            status_code=401, detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_admin(
    current_user: Annotated[UserResponse, Depends(require_auth)]
) -> UserResponse:
    if current_user.role != Role.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ── Routes ────────────────────────────────────────────────────────────
@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Annotated[Session, Depends(get_db)]):
    _check_rate_limit(request.client.host, "login")
    token_resp, user, error = login_user(body.email, body.password, db)
    if not token_resp:
        if "locked" in (error or ""):
            raise HTTPException(status_code=423, detail=error)
        raise HTTPException(
            status_code=401, detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token_resp


@router.post("/register", status_code=202)
def register(body: RegisterRequest, request: Request, db: Annotated[Session, Depends(get_db)]):
    """
    Submit a registration request. Account is created in PENDING state.
    Admin must approve before the user can log in. A confirmation email is
    sent to the admin. User receives approval/rejection by email.
    """
    _check_rate_limit(request.client.host, "register")
    _token_resp, _user, error = register_user(body.name, body.email, body.password, db)

    # "pending" means registration was accepted and is awaiting admin approval
    if error == "pending":
        return {
            "status":  "pending",
            "message": "Registration submitted — your account is pending admin approval. You will receive an email once approved.",
        }

    # Any other error (duplicate, domain restriction etc.)
    if error:
        raise HTTPException(status_code=400, detail=error)

    # Should not reach here, but handle gracefully
    return {"status": "pending", "message": "Registration submitted — awaiting admin approval."}



@router.get("/me", response_model=UserResponse)
def me(current_user: Annotated[UserResponse, Depends(require_auth)]):
    return current_user


@router.post("/logout", status_code=204)
def logout(current_user: Annotated[UserResponse, Depends(require_auth)]):
    logger.info("Logout: %s", current_user.email)
    return None

@router.post("/logout-all", status_code=204)
def logout_all(current_user: Annotated[UserResponse, Depends(require_auth)], db: Annotated[Session, Depends(get_db)]):
    from app.services.auth_service import get_user_by_email
    user = get_user_by_email(db, current_user.email)
    if user:
        user.revoked_before = datetime.now(timezone.utc)
        db.commit()
        logger.info("Logout everywhere triggered for: %s", user.email)
    return None