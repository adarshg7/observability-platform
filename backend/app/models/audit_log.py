from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, DateTime
from app.database import Base


class AuditLog(Base):
    """Immutable log of all admin and system actions."""
    __tablename__ = "audit_logs"

    id:          Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    actor_id:    Mapped[str] = mapped_column(String(36),  nullable=False, index=True)
    actor_email: Mapped[str] = mapped_column(String(254), nullable=False)
    action:      Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "user.remove"
    target:      Mapped[str] = mapped_column(String(200), nullable=True)   # e.g. "user:bob@bank.com"
    detail:      Mapped[str] = mapped_column(Text,        nullable=True)   # JSON or free text
    ip_address:  Mapped[str] = mapped_column(String(45),  nullable=True)
    created_at:  Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
