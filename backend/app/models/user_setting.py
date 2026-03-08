from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, UniqueConstraint
from app.database import Base


class UserSetting(Base):
    """Key-value settings per user (e.g. alert thresholds, preferences)."""
    __tablename__ = "user_settings"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_user_setting_key"),
    )

    id:      Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    key:     Mapped[str] = mapped_column(String(100), nullable=False)
    value:   Mapped[str] = mapped_column(Text, nullable=False)
