from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean, DateTime, Text
from app.database import Base


class APIKey(Base):
    """
    API keys for external ML pipelines to push metrics via /api/metrics/ingest.
    The 'key_hash' stores a bcrypt hash — the raw key is shown once at creation.
    """
    __tablename__ = "api_keys"

    id:          Mapped[int]  = mapped_column(primary_key=True, autoincrement=True)
    name:        Mapped[str]  = mapped_column(String(100), nullable=False)         # human label
    key_prefix:  Mapped[str]  = mapped_column(String(10),  nullable=False)         # first 8 chars shown in list
    key_hash:    Mapped[str]  = mapped_column(String(200), nullable=False)         # bcrypt hash
    owner_id:    Mapped[str]  = mapped_column(String(36),  nullable=False, index=True)
    owner_email: Mapped[str]  = mapped_column(String(254), nullable=False)
    is_active:   Mapped[bool] = mapped_column(Boolean, default=True)
    last_used:   Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:  Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )
    description: Mapped[str]  = mapped_column(Text, nullable=True)
