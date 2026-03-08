from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, DateTime, UniqueConstraint
from app.database import Base


class UserModelAccess(Base):
    """
    Controls which user can see which model.
    model_type: "ml" or "llm"
    model_id:   id from ml_models or llm_models table
    WHY a separate table: this is a many-to-many relationship.
    One user can see many models; one model can be seen by many users.
    """
    __tablename__ = "user_model_access"
    __table_args__ = (
        UniqueConstraint("user_id", "model_id", "model_type", name="uq_user_model"),
    )

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id:    Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    model_id:   Mapped[int] = mapped_column(Integer, nullable=False)
    model_type: Mapped[str] = mapped_column(String(10), nullable=False)  # "ml" or "llm"
    granted_by: Mapped[str] = mapped_column(String(254), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )
