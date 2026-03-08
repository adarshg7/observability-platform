from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Float, DateTime, Index
from app.database import Base


class MetricReading(Base):
    """
    Stores time-series metric readings for ML and LLM models.
    model_type: "ml" or "llm"
    model_id:   references ml_models.id or llm_models.id
    """
    __tablename__ = "metric_readings"

    id:           Mapped[int]   = mapped_column(primary_key=True, autoincrement=True)
    model_id:     Mapped[int]   = mapped_column(Integer, nullable=False, index=True)
    model_type:   Mapped[str]   = mapped_column(String(10), nullable=False)   # "ml" or "llm"
    metric_name:  Mapped[str]   = mapped_column(String(100), nullable=False)   # aligned with IngestPayload max_length=100
    metric_value: Mapped[float] = mapped_column(Float, nullable=False)
    recorded_at:  Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    __table_args__ = (
        Index("ix_metric_model_time", "model_id", "model_type", "recorded_at"),
        # SC5: Additional index for cross-model type+time queries (dashboard aggregations)
        Index("ix_metric_type_time", "model_type", "recorded_at"),
    )

    def __repr__(self):
        return f"<MetricReading model={self.model_id} {self.metric_name}={self.metric_value}>"
