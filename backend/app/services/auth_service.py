import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from jose import JWTError, jwt, ExpiredSignatureError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.schemas.auth import UserResponse, Role, TokenResponse
from app.models.user import User
from app.models.allowed_domain import AllowedDomain
from app.config import settings

logger = logging.getLogger(__name__)

ALGORITHM                   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Pre-baked bcrypt hash used only for constant-time dummy verification
# to prevent timing attacks when an email is not found in the DB.
_DUMMY_HASH = "$2b$12$eImiTXuWVxfM37uY4JANjQfzFekFMGFuMm1qVFk3S0LuAR4.gqLg6"

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES     = 15


# ── Password helpers ──────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT helpers ───────────────────────────────────────────────────────
def create_access_token(user: User) -> Tuple[str, int]:
    expire     = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    expires_in = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    payload = {
        "sub":   str(user.id),
        "email": user.email,
        "role":  user.role,
        "exp":   expire,
        "iat":   datetime.now(timezone.utc),
        "jti":   str(uuid.uuid4()),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
    return token, expires_in


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except ExpiredSignatureError:
        logger.info("Token expired")
        return None
    except JWTError as e:
        logger.warning("Invalid token: %s", e)
        return None


# ── DB query helpers ──────────────────────────────────────────────────
def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.lower().strip()).first()

def _is_locked(user: User) -> bool:
    if user.locked_until is None:
        return False
    # Ensure locked_until is timezone-aware before comparing.
    # If the DB stores a naive datetime, treat it as UTC.
    locked = user.locked_until
    if locked.tzinfo is None:
        locked = locked.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) < locked:
        return True
    user.locked_until    = None
    user.failed_attempts = 0
    return False

def _record_failed_attempt(db: Session, user: User) -> None:
    user.failed_attempts += 1
    if user.failed_attempts >= MAX_FAILED_ATTEMPTS:
        user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
        logger.warning("Account locked: %s", user.email)
    db.commit()

def _reset_failed_attempts(db: Session, user: User) -> None:
    user.failed_attempts = 0
    user.locked_until    = None
    db.commit()

def _user_to_response(user: User) -> UserResponse:
    return UserResponse(
        id=uuid.UUID(user.id),
        name=user.name,
        email=user.email,
        role=Role(user.role),
    )


# ── Seed default admin ────────────────────────────────────────────────
def seed_admin(db: Session) -> None:
    """
    Creates the default admin account if none exists.
    Credentials MUST be set via environment variables in production.
    ADMIN_EMAIL and ADMIN_PASSWORD are required — server refuses to
    proceed if they are missing in production.
    """
    import os
    admin_email    = os.getenv("ADMIN_EMAIL", "").strip()
    admin_password = os.getenv("ADMIN_PASSWORD", "").strip()

    if not admin_email or not admin_password:
        # Do not use hardcoded fallbacks — that exposes credentials in source code
        logger.warning(
            "ADMIN_EMAIL or ADMIN_PASSWORD not set in .env — skipping admin seed. "
            "Set these variables and restart to create the default admin account."
        )
        return

    if get_user_by_email(db, admin_email):
        return   # already exists — nothing to do

    admin = User(
        id=str(uuid.uuid4()),
        name="Platform Admin",
        email=admin_email,
        hashed_password=hash_password(admin_password),
        role=Role.admin.value,
        is_active=True,
        is_approved=True,
    )
    db.add(admin)
    db.commit()
    # SECURITY: log only email, NEVER the password
    logger.info("Default admin seeded: %s", admin_email)


# ── Auth operations ───────────────────────────────────────────────────
def login_user(
    email: str, password: str, db: Session
) -> Tuple[Optional[TokenResponse], Optional[UserResponse], Optional[str]]:

    email = email.lower().strip()
    user  = get_user_by_email(db, email)

    if not user:
        # Constant-time dummy check — prevents timing-based email enumeration
        pwd_context.verify("dummy", _DUMMY_HASH)
        return None, None, "Invalid credentials"

    if not user.is_active:
        # Distinguish between pending approval vs deliberately disabled
        if hasattr(user, 'is_approved') and not user.is_approved:
            return None, None, "Account pending admin approval — please wait for an approval email"
        return None, None, "Account disabled — contact administrator"

    if _is_locked(user):
        return None, None, "Account temporarily locked — too many failed attempts"

    if not verify_password(password, user.hashed_password):
        _record_failed_attempt(db, user)
        return None, None, "Invalid credentials"

    _reset_failed_attempts(db, user)
    token, expires_in = create_access_token(user)
    logger.info("Login: %s", email)
    return TokenResponse(access_token=token, expires_in=expires_in), _user_to_response(user), None


def register_user(
    name: str, email: str, password: str, db: Session
) -> Tuple[Optional[TokenResponse], Optional[UserResponse], Optional[str]]:

    email = email.lower().strip()

    # ── Email domain validation ───────────────────────────────────────
    domain = email.split("@")[-1]
    allowed = db.query(AllowedDomain).all()
    if allowed:
        allowed_domains = [d.domain.lower() for d in allowed]
        if domain not in allowed_domains:
            readable = ", ".join(allowed_domains)
            return None, None, f"Registration restricted to: {readable}"

    if get_user_by_email(db, email):
        # ── Prevent email enumeration — always same error message ─────
        return None, None, "Registration submitted — awaiting admin approval"

    new_user = User(
        id=str(uuid.uuid4()),
        name=name.strip(),
        email=email,
        hashed_password=hash_password(password),
        role=Role.viewer.value,
        is_active=False,      # Cannot log in until approved
        is_approved=False,    # Requires explicit admin approval
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    logger.info("Registration pending admin approval: %s", email)

    # ── Notify admin by email ─────────────────────────────────────────
    try:
        admin = db.query(User).filter(User.role == Role.admin.value).first()
        if admin:
            from app.services.email_service import send_registration_request_email
            send_registration_request_email(
                admin_email=admin.email,
                applicant_name=new_user.name,
                applicant_email=new_user.email,
                user_id=new_user.id,
            )
    except Exception as e:
        logger.warning("Could not send admin notification email: %s", e)

    # Return None token — registration is PENDING, not active
    return None, _user_to_response(new_user), "pending"



def get_current_user(token: str, db: Session) -> Optional[UserResponse]:
    payload = decode_access_token(token)
    if not payload:
        return None
    user = get_user_by_email(db, payload.get("email", ""))
    if not user or not user.is_active:
        return None
        
    # Reject token if issued before user revoked all sessions
    if user.revoked_before:
        iat = payload.get("iat")
        if iat is not None:
            iat_dt = datetime.fromtimestamp(iat, tz=timezone.utc)
            revoked = user.revoked_before
            if revoked.tzinfo is None:
                revoked = revoked.replace(tzinfo=timezone.utc)
            if iat_dt < revoked:
                logger.warning("Rejected revoked token for %s", user.email)
                return None
                
    return _user_to_response(user)