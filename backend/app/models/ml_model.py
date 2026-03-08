from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean, Text, DateTime
from app.database import Base


class MLModel(Base):
    __tablename__ = "ml_models"

    id:          Mapped[int]  = mapped_column(primary_key=True, autoincrement=True)
    name:        Mapped[str]  = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str]  = mapped_column(Text, nullable=True)
    model_type:  Mapped[str]  = mapped_column(String(50), default="classification")
    is_active:   Mapped[bool] = mapped_column(Boolean, default=True)
    created_by:  Mapped[str]  = mapped_column(String(254), nullable=False)
    created_at:  Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self):
        return f"<MLModel {self.name}>"
