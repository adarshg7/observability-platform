from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Boolean, DateTime, Index, Text
from app.database import Base


class Alert(Base):
    """
    Persists every threshold-triggered alert.
    Previously alerts were in-memory only — now they survive server restarts.
    """
    __tablename__ = "alerts"

    id:           Mapped[int]  = mapped_column(primary_key=True, autoincrement=True)
    alert_uid:    Mapped[str]  = mapped_column(String(80), unique=True, nullable=False)  # keep original string id
    severity:     Mapped[str]  = mapped_column(String(20), nullable=False)     # critical|warning|info
    model_name:   Mapped[str]  = mapped_column(String(200), nullable=False)
    model_type:   Mapped[str]  = mapped_column(String(30), nullable=False)     # ML Model | LLM Service
    message:      Mapped[str]  = mapped_column(Text, nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_alert_triggered_at", "triggered_at"),
        Index("ix_alert_severity", "severity"),
    )

    def to_dict(self) -> dict:
        return {
            "id":       self.alert_uid,
            "severity": self.severity,
            "model":    self.model_name,
            "type":     self.model_type,
            "msg":      self.message,
            "time":     self.triggered_at.isoformat(),
            "ack":      self.acknowledged,
        }

    def __repr__(self):
        return f"<Alert {self.severity} {self.model_name}: {self.message[:40]}>"
