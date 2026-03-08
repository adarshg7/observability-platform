import logging
import secrets
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.models.allowed_domain import AllowedDomain
from app.models.ml_model import MLModel
from app.models.llm_model import LLMModel
from app.models.user_access import UserModelAccess
from app.models.audit_log import AuditLog
from app.models.api_key import APIKey
from app.models.metric_reading import MetricReading
from app.api.routes.auth import require_admin
from app.schemas.auth import UserResponse
from app.services.metrics_services import seed_ml_readings, seed_llm_readings
from app.services.audit import log_action

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ═══════════════════════════════════════════════════════════════════════
# USERS
# ═══════════════════════════════════════════════════════════════════════

@router.get("/users")
def list_users(
    skip:  int          = Query(0,  ge=0),
    limit: int          = Query(50, ge=1, le=200),
    db:    Session      = Depends(get_db),
    admin: UserResponse = Depends(require_admin),
):
    """List all users with pagination (max 200 per page)."""
    total = db.query(func.count(User.id)).scalar()
    users = db.query(User).order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    return {
        "total": total,
        "skip":  skip,
        "limit": limit,
        "users": [
            {
                "id":              u.id,
                "name":            u.name,
                "email":           u.email,
                "role":            u.role,
                "is_active":       u.is_active,
                "failed_attempts": u.failed_attempts,
                "locked_until":    u.locked_until.isoformat() if u.locked_until else None,
                "created_at":      u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


@router.delete("/users/{user_id}", status_code=204)
def remove_user(
    user_id: str,
    request: Request,
    db:      Session      = Depends(get_db),
    admin:   UserResponse = Depends(require_admin),
):
    if str(user_id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    log_action(db, str(admin.id), admin.email, "user.remove",
               target=f"user:{user.email}", detail={"name": user.name},
               ip=request.client.host if request.client else None)
    db.delete(user)
    db.commit()


@router.put("/users/{user_id}/toggle")
def toggle_user(
    user_id: str,
    request: Request,
    db:      Session      = Depends(get_db),
    admin:   UserResponse = Depends(require_admin),
):
    if str(user_id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.commit()
    verb = "user.activate" if user.is_active else "user.deactivate"
    log_action(db, str(admin.id), admin.email, verb,
               target=f"user:{user.email}",
               ip=request.client.host if request.client else None)
    return {"id": user.id, "is_active": user.is_active, "action": verb}


# ═══════════════════════════════════════════════════════════════════════
# PENDING USER APPROVAL
# ═══════════════════════════════════════════════════════════════════════

@router.get("/users/pending")
def list_pending_users(
    db:    Session      = Depends(get_db),
    admin: UserResponse = Depends(require_admin),
):
    """Return users awaiting admin approval (is_approved=False)."""
    users = db.query(User).filter(User.is_approved == False).order_by(User.created_at.desc()).all()
    return [
        {
            "id":         u.id,
            "name":       u.name,
            "email":      u.email,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


class ApproveRejectIn(BaseModel):
    reason: str = ""


@router.post("/users/{user_id}/approve")
def approve_user(
    user_id: str,
    request: Request,
    db:      Session      = Depends(get_db),
    admin:   UserResponse = Depends(require_admin),
):
    """Approve a pending user — activates account and sends approval email."""
    from datetime import datetime, timezone as _tz
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_approved:
        raise HTTPException(status_code=400, detail="User is already approved")

    user.is_approved = True
    user.is_active   = True
    user.approved_at = datetime.now(_tz.utc)
    db.commit()

    log_action(db, str(admin.id), admin.email, "user.approve",
               target=f"user:{user.email}",
               ip=request.client.host if request.client else None)

    # Send approval email
    try:
        from app.services.email_service import send_approval_email
        send_approval_email(user.email, user.name)
    except Exception as e:
        logger.warning("Approval email failed for %s: %s", user.email, e)

    return {"id": user.id, "email": user.email, "message": "User approved and notified by email"}


@router.post("/users/{user_id}/reject")
def reject_user(
    user_id: str,
    body:    ApproveRejectIn,
    request: Request,
    db:      Session      = Depends(get_db),
    admin:   UserResponse = Depends(require_admin),
):
    """Reject and delete a pending user — sends rejection email first."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_approved:
        raise HTTPException(status_code=400, detail="Cannot reject an already-approved user")

    email, name = user.email, user.name

    log_action(db, str(admin.id), admin.email, "user.reject",
               target=f"user:{email}", detail={"reason": body.reason},
               ip=request.client.host if request.client else None)

    # Send rejection email BEFORE deleting the record
    try:
        from app.services.email_service import send_rejection_email
        send_rejection_email(email, name, body.reason)
    except Exception as e:
        logger.warning("Rejection email failed for %s: %s", email, e)

    db.delete(user)
    db.commit()
    return {"email": email, "message": "Registration rejected and user notified"}


# ═══════════════════════════════════════════════════════════════════════
# INVITE USER BY EMAIL
# ═══════════════════════════════════════════════════════════════════════

class InviteUserIn(BaseModel):
    email: str
    name:  str  = ""
    role:  str  = "viewer"


@router.post("/users/invite", status_code=201)
def invite_user(
    body:    InviteUserIn,
    request: Request,
    db:      Session      = Depends(get_db),
    admin:   UserResponse = Depends(require_admin),
):
    """
    Invite a new user by email.
    - Creates the account with a secure temporary password
    - Sends an invite email via SMTP (if configured in Settings)
    - Returns the temp password in the response so admin can share it manually
      if SMTP is not configured
    """
    from app.models.user import User
    from app.schemas.auth import Role
    # C4 FIX: Corrected import — function is hash_password, not get_password_hash
    from app.services.auth_service import hash_password
    import uuid

    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail=f"User '{email}' already exists")

    # Generate a secure temporary password
    import secrets as _secrets
    temp_password = _secrets.token_urlsafe(12)

    # Validate role
    try:
        role_enum = Role[body.role] if body.role in [r.value for r in Role] else Role.viewer
    except (KeyError, ValueError):
        role_enum = Role.viewer

    new_user = User(
        id=str(uuid.uuid4()),
        name=body.name or email.split("@")[0].title(),
        email=email,
        hashed_password=hash_password(temp_password),
        role=role_enum,
        is_active=True,
        is_approved=True,  # Admin-invited users skip the approval gate
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    log_action(db, str(admin.id), admin.email, "user.invite",
               target=f"user:{email}", detail={"role": body.role},
               ip=request.client.host if request.client else None)

    # Send invite email
    email_sent = False
    try:
        from app.services.email_service import send_invite_email
        email_sent = send_invite_email(
            to_email=email,
            to_name=new_user.name,
            invited_by=admin.email,
            temp_password=temp_password,
        )
    except Exception as e:
        logger.warning("Invite email failed: %s", e)

    return {
        "id":         new_user.id,
        "email":      new_user.email,
        "name":       new_user.name,
        "role":       new_user.role,
        "email_sent": email_sent,
        # H2 FIX: temp_password is NEVER returned in the API response.
        # If email is not configured, admin must use the server logs to retrieve it
        # or trigger a password-reset flow. Passwords in HTTP responses are logged by
        # every proxy and monitoring tool between client and server.
        "message": "User created and invite email sent" if email_sent
                   else "User created. Email not sent (configure SMTP in Settings). Check server logs for the temporary credential.",
    }


# ═══════════════════════════════════════════════════════════════════════
# DOMAINS
# ═══════════════════════════════════════════════════════════════════════

class DomainIn(BaseModel):
    domain: str


@router.get("/domains")
def list_domains(
    db:    Session      = Depends(get_db),
    admin: UserResponse = Depends(require_admin),
):
    domains = db.query(AllowedDomain).order_by(AllowedDomain.created_at).all()
    return [
        {"id": d.id, "domain": d.domain, "created_by": d.created_by,
         "created_at": d.created_at.isoformat()}
        for d in domains
    ]


@router.post("/domains", status_code=201)
def add_domain(
    body:  DomainIn,
    request: Request,
    db:    Session      = Depends(get_db),
    admin: UserResponse = Depends(require_admin),
):
    domain = body.domain.lower().strip().lstrip("@")
    if not domain or "." not in domain:
        raise HTTPException(status_code=400, detail="Invalid domain format (e.g. bank.com)")
    existing = db.query(AllowedDomain).filter(AllowedDomain.domain == domain).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"{domain} is already allowed")
    new_domain = AllowedDomain(domain=domain, created_by=admin.email)
    db.add(new_domain)
    db.commit()
    db.refresh(new_domain)
    log_action(db, str(admin.id), admin.email, "domain.add",
               target=f"domain:{domain}", ip=request.client.host if request.client else None)
    return {"id": new_domain.id, "domain": new_domain.domain}


@router.delete("/domains/{domain_id}", status_code=204)
def remove_domain(
    domain_id: int,
    request:   Request,
    db:        Session      = Depends(get_db),
    admin:     UserResponse = Depends(require_admin),
):
    domain = db.query(AllowedDomain).filter(AllowedDomain.id == domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")
    log_action(db, str(admin.id), admin.email, "domain.remove",
               target=f"domain:{domain.domain}", ip=request.client.host if request.client else None)
    db.delete(domain)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════
# ML MODEL REGISTRY
# ═══════════════════════════════════════════════════════════════════════

class ModelIn(BaseModel):
    name:        str
    description: str = ""
    model_type:  str = "classification"
    provider:    str = "openai"


@router.get("/models/ml")
def list_ml_models(
    db:    Session      = Depends(get_db),
    admin: UserResponse = Depends(require_admin),
):
    models = db.query(MLModel).order_by(MLModel.created_at.desc()).all()
    return [
        {"id": m.id, "name": m.name, "description": m.description,
         "model_type": m.model_type, "is_active": m.is_active,
         "created_by": m.created_by, "created_at": m.created_at.isoformat()}
        for m in models
    ]


@router.post("/models/ml", status_code=201)
def add_ml_model(
    body:    ModelIn,
    request: Request,
    db:      Session      = Depends(get_db),
    admin:   UserResponse = Depends(require_admin),
):
    if db.query(MLModel).filter(MLModel.name == body.name).first():
        raise HTTPException(status_code=409, detail=f"Model '{body.name}' already exists")
    model = MLModel(
        name=body.name, description=body.description,
        model_type=body.model_type, created_by=admin.email
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    seed_ml_readings(db, model)
    log_action(db, str(admin.id), admin.email, "model.ml.add",
               target=f"ml:{model.name}", detail={"type": body.model_type},
               ip=request.client.host if request.client else None)
    return {"id": model.id, "name": model.name}


@router.delete("/models/ml/{model_id}", status_code=204)
def remove_ml_model(
    model_id: int,
    request:  Request,
    db:       Session      = Depends(get_db),
    admin:    UserResponse = Depends(require_admin),
):
    model = db.query(MLModel).filter(MLModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="ML model not found")
    log_action(db, str(admin.id), admin.email, "model.ml.remove",
               target=f"ml:{model.name}", ip=request.client.host if request.client else None)
    db.query(UserModelAccess).filter(
        UserModelAccess.model_id == model_id,
        UserModelAccess.model_type == "ml"
    ).delete()
    db.delete(model)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════
# LLM SERVICE REGISTRY
# ═══════════════════════════════════════════════════════════════════════

@router.get("/models/llm")
def list_llm_models(
    db:    Session      = Depends(get_db),
    admin: UserResponse = Depends(require_admin),
):
    models = db.query(LLMModel).order_by(LLMModel.created_at.desc()).all()
    return [
        {"id": m.id, "name": m.name, "description": m.description,
         "provider": m.provider, "is_active": m.is_active,
         "created_by": m.created_by, "created_at": m.created_at.isoformat()}
        for m in models
    ]


@router.post("/models/llm", status_code=201)
def add_llm_model(
    body:    ModelIn,
    request: Request,
    db:      Session      = Depends(get_db),
    admin:   UserResponse = Depends(require_admin),
):
    if db.query(LLMModel).filter(LLMModel.name == body.name).first():
        raise HTTPException(status_code=409, detail=f"Service '{body.name}' already exists")
    model = LLMModel(
        name=body.name, description=body.description,
        provider=body.provider, created_by=admin.email
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    seed_llm_readings(db, model)
    log_action(db, str(admin.id), admin.email, "model.llm.add",
               target=f"llm:{model.name}", detail={"provider": body.provider},
               ip=request.client.host if request.client else None)
    return {"id": model.id, "name": model.name}


@router.delete("/models/llm/{model_id}", status_code=204)
def remove_llm_model(
    model_id: int,
    request:  Request,
    db:       Session      = Depends(get_db),
    admin:    UserResponse = Depends(require_admin),
):
    model = db.query(LLMModel).filter(LLMModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="LLM model not found")
    log_action(db, str(admin.id), admin.email, "model.llm.remove",
               target=f"llm:{model.name}", ip=request.client.host if request.client else None)
    db.query(UserModelAccess).filter(
        UserModelAccess.model_id == model_id,
        UserModelAccess.model_type == "llm"
    ).delete()
    db.delete(model)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════
# ACCESS CONTROL — assign viewer → model
# ═══════════════════════════════════════════════════════════════════════

class AccessIn(BaseModel):
    user_id:    str
    model_id:   int
    model_type: str   # "ml" or "llm"


@router.get("/access/{user_id}")
def get_user_access(
    user_id: str,
    db:      Session      = Depends(get_db),
    admin:   UserResponse = Depends(require_admin),
):
    rows = db.query(UserModelAccess).filter(UserModelAccess.user_id == user_id).all()
    return [
        {"id": r.id, "model_id": r.model_id, "model_type": r.model_type,
         "granted_by": r.granted_by, "granted_at": r.granted_at.isoformat()}
        for r in rows
    ]


@router.post("/access", status_code=201)
def grant_access(
    body:    AccessIn,
    request: Request,
    db:      Session      = Depends(get_db),
    admin:   UserResponse = Depends(require_admin),
):
    existing = db.query(UserModelAccess).filter(
        UserModelAccess.user_id    == body.user_id,
        UserModelAccess.model_id   == body.model_id,
        UserModelAccess.model_type == body.model_type,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Access already granted")
    access = UserModelAccess(
        user_id=body.user_id, model_id=body.model_id,
        model_type=body.model_type, granted_by=admin.email
    )
    db.add(access)
    db.commit()
    log_action(db, str(admin.id), admin.email, "access.grant",
               target=f"user:{body.user_id} → {body.model_type}:{body.model_id}",
               ip=request.client.host if request.client else None)
    return {"message": "Access granted"}


@router.delete("/access/{access_id}", status_code=204)
def revoke_access(
    access_id: int,
    request:   Request,
    db:        Session      = Depends(get_db),
    admin:     UserResponse = Depends(require_admin),
):
    row = db.query(UserModelAccess).filter(UserModelAccess.id == access_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Access record not found")
    log_action(db, str(admin.id), admin.email, "access.revoke",
               target=f"user:{row.user_id} → {row.model_type}:{row.model_id}",
               ip=request.client.host if request.client else None)
    db.delete(row)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════
# AUDIT LOG
# ═══════════════════════════════════════════════════════════════════════

@router.get("/audit")
def get_audit_log(
    limit: int = 100,
    db:    Session      = Depends(get_db),
    admin: UserResponse = Depends(require_admin),
):
    """Return the last N audit log entries (most recent first)."""
    rows = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(max(1, min(limit, 500)))
        .all()
    )
    return [
        {
            "id":          r.id,
            "actor_email": r.actor_email,
            "action":      r.action,
            "target":      r.target,
            "detail":      r.detail,
            "ip_address":  r.ip_address,
            "created_at":  r.created_at.isoformat(),
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════════════════════
# API KEY MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════

class APIKeyIn(BaseModel):
    name:        str
    description: str = ""


@router.get("/apikeys")
def list_api_keys(
    db:    Session      = Depends(get_db),
    admin: UserResponse = Depends(require_admin),
):
    """List all API keys (never exposes the raw secret)."""
    keys = db.query(APIKey).order_by(APIKey.created_at.desc()).all()
    return [
        {
            "id":          k.id,
            "name":        k.name,
            "key_prefix":  k.key_prefix,
            "owner_email": k.owner_email,
            "is_active":   k.is_active,
            "description": k.description,
            "last_used":   k.last_used.isoformat() if k.last_used else None,
            "created_at":  k.created_at.isoformat(),
        }
        for k in keys
    ]


@router.post("/apikeys", status_code=201)
def create_api_key(
    body:  APIKeyIn,
    db:    Session      = Depends(get_db),
    admin: UserResponse = Depends(require_admin),
):
    """
    Create a new API key.
    Returns the raw secret ONCE — it cannot be retrieved again.
    """
    raw_key    = f"obsv_{secrets.token_urlsafe(32)}"
    key_hash   = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:10]

    api_key = APIKey(
        name=body.name,
        description=body.description,
        key_prefix=key_prefix,
        key_hash=key_hash,
        owner_id=str(admin.id),
        owner_email=admin.email,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    logger.info("Admin %s created API key: %s", admin.email, body.name)

    return {
        "id":         api_key.id,
        "name":       api_key.name,
        "key_prefix": api_key.key_prefix,
        "raw_key":    raw_key,   # shown ONCE
        "message":    "Copy this key now — it will not be shown again",
    }


@router.delete("/apikeys/{key_id}", status_code=204)
def revoke_api_key(
    key_id: int,
    db:     Session      = Depends(get_db),
    admin:  UserResponse = Depends(require_admin),
):
    key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    db.delete(key)
    db.commit()
    logger.info("Admin %s revoked API key: %s", admin.email, key.name)


# ═══════════════════════════════════════════════════════════════════════
# REAL DASHBOARD STATS
# ═══════════════════════════════════════════════════════════════════════

@router.get("/stats")
def get_platform_stats(
    db:    Session      = Depends(get_db),
    admin: UserResponse = Depends(require_admin),
):
    """Real counts from the DB for admin dashboard top cards."""
    ml_count   = db.query(MLModel).filter(MLModel.is_active  == True).count()
    llm_count  = db.query(LLMModel).filter(LLMModel.is_active == True).count()
    user_count = db.query(User).count()
    reading_count = db.query(MetricReading).count()
    alert_access  = db.query(UserModelAccess).count()
    key_count  = db.query(APIKey).filter(APIKey.is_active == True).count()

    return {
        "ml_models":       ml_count,
        "llm_services":    llm_count,
        "total_users":     user_count,
        "metric_readings": reading_count,
        "access_grants":   alert_access,
        "active_api_keys": key_count,
    }

