from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime
from app.database import Base


class AllowedDomain(Base):
    __tablename__ = "allowed_domains"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    domain:     Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    created_by: Mapped[str] = mapped_column(String(254), nullable=False)  # admin email
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self):
        return f"<AllowedDomain {self.domain}>"
