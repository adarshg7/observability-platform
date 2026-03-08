"""
audit.py — helper function to write audit logs.
Import and call log_action() from any route handler.
"""
import json
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog


def log_action(
    db:          Session,
    actor_id:    str,
    actor_email: str,
    action:      str,
    target:      str | None = None,
    detail:      dict | str | None = None,
    ip:          str | None = None,
) -> AuditLog:
    """
    Write a single audit log entry.

    action format convention:  "resource.verb"
    Examples:
        "user.remove", "user.toggle", "domain.add", "model.ml.add",
        "access.grant", "access.revoke", "apikey.create", "apikey.revoke"
    """
    detail_str = None
    if isinstance(detail, dict):
        detail_str = json.dumps(detail)
    elif detail:
        detail_str = str(detail)

    entry = AuditLog(
        actor_id=str(actor_id),
        actor_email=actor_email,
        action=action,
        target=target,
        detail=detail_str,
        ip_address=ip,
    )
    db.add(entry)
    db.commit()
    return entry
