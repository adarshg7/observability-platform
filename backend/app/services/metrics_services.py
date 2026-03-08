"""
metrics_service.py
==================
Two modes:
- If a model exists in ml_models/llm_models table → use DB data (real or seeded)
- If table is empty → fall back to the original hardcoded mock data
Access filtering:
- Admin: sees all models
- Viewer with no access records: sees all (open mode)
- Viewer with access records: sees only their allowed models
"""
import random
import math
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.schemas.metrics import (
    MLMetricPoint, MLMetricResponse, MLModelSummary,
    LLMMetricsPoint, LLMModelSummary, LLMMetricResponse,
)
from app.models.ml_model import MLModel
from app.models.llm_model import LLMModel
from app.models.metric_reading import MetricReading
from app.models.user_access import UserModelAccess


# ────────────────────────────────────────────────────────────────────────
# Helper generators (keep existing math so charts look smooth)
# ────────────────────────────────────────────────────────────────────────

def _ml_readings_for(i: int, base_acc: float, base_drift: float, base_lat: float):
    """Generate one hour of ML readings."""
    return {
        "accuracy":   round(min(0.99, max(0.70, base_acc  + math.sin(i*0.3)*0.02  + random.uniform(-0.005, 0.005))), 3),
        "drift_score":round(max(0.0,            base_drift + math.sin(i*0.2)*0.03  + random.uniform(0, 0.01)), 3),
        "latency_ms": round(max(10.0,            base_lat   + math.sin(i*0.4)*10  + random.uniform(0, 5)), 1),
    }

def _llm_readings_for(i: int, hour: int, base_lat: float, base_tps: float, base_qual: float):
    lf = 1.5 if 9 <= hour <= 17 else 0.7
    return {
        "latency_ms":        round(max(200, base_lat  + math.sin(i*0.5)*20*lf + random.uniform(0, 50)), 1),
        "tokens_per_second": round(max(5,   base_tps  + math.cos(i*0.3)*8*lf  + random.uniform(0, 3)), 1),
        "quality_score":     round(min(0.99, max(0.70, base_qual + math.sin(i*0.2)*0.04 + random.uniform(-0.01, 0.01))), 3),
    }


# ────────────────────────────────────────────────────────────────────────
# DB seeder — called after model is added, creates 24h of readings
# ────────────────────────────────────────────────────────────────────────

def seed_ml_readings(db: Session, model: MLModel):
    """Seed 24h of hourly readings for a newly added ML model."""
    # Deterministic-ish bases from model id so different models look different
    base_acc   = 0.85 + (model.id % 10) * 0.01
    base_drift = 0.05 + (model.id % 5)  * 0.02
    base_lat   = 40   + (model.id % 6)  * 10

    base_time = datetime.now(timezone.utc) - timedelta(hours=23)
    readings = []
    for i in range(24):
        ts   = base_time + timedelta(hours=i)
        vals = _ml_readings_for(i, base_acc, base_drift, base_lat)
        for metric_name, metric_value in vals.items():
            readings.append(MetricReading(
                model_id=model.id, model_type="ml",
                metric_name=metric_name, metric_value=metric_value,
                recorded_at=ts,
            ))
    db.add_all(readings)
    db.commit()


def seed_llm_readings(db: Session, model: LLMModel):
    """Seed 24h of hourly readings for a newly added LLM service."""
    base_lat  = 800  + (model.id % 5) * 200
    base_tps  = 40   + (model.id % 4) * 5
    base_qual = 0.88 + (model.id % 5) * 0.01

    base_time = datetime.now(timezone.utc) - timedelta(hours=23)
    readings = []
    for i in range(24):
        ts   = base_time + timedelta(hours=i)
        hour = ts.hour
        vals = _llm_readings_for(i, hour, base_lat, base_tps, base_qual)
        for metric_name, metric_value in vals.items():
            readings.append(MetricReading(
                model_id=model.id, model_type="llm",
                metric_name=metric_name, metric_value=metric_value,
                recorded_at=ts,
            ))
    db.add_all(readings)
    db.commit()


# ────────────────────────────────────────────────────────────────────────
# Access filter helpers
# ────────────────────────────────────────────────────────────────────────

def _allowed_model_ids(db: Session, user_id: str, model_type: str) -> list[int] | None:
    """
    Returns:
      - None  → show all (admin path or no restrictions set)
      - [...]  → only these model_ids
    """
    rows = db.query(UserModelAccess.model_id).filter(
        UserModelAccess.user_id    == user_id,
        UserModelAccess.model_type == model_type,
    ).all()
    if not rows:
        return None   # open — show everything
    return [r.model_id for r in rows]


# ────────────────────────────────────────────────────────────────────────
# ML metrics
# ────────────────────────────────────────────────────────────────────────

def _status_from_ml(accuracy: float, drift: float) -> str:
    if accuracy < 0.75 or drift > 0.25:   return "critical"
    if accuracy < 0.88 or drift > 0.15:   return "warning"
    return "healthy"

def _status_from_llm(latency: float, hallucination: float) -> str:
    if latency > 3000 or hallucination > 0.12:  return "critical"
    if latency > 1800 or hallucination > 0.08:  return "warning"
    return "healthy"


def get_ml_metrics_summary(db: Session, user_id: str, is_admin: bool) -> MLMetricResponse:
    registered = db.query(MLModel).filter(MLModel.is_active == True).all()

    if not registered:
        # Fallback: no models in registry yet → return legacy mock data
        return _legacy_ml_metrics()

    # Access filter
    if is_admin:
        allowed_ids = None
    else:
        allowed_ids = _allowed_model_ids(db, user_id, "ml")

    visible = [m for m in registered if allowed_ids is None or m.id in allowed_ids]

    # Build model summaries from latest readings
    model_summaries = []
    for m in visible:
        latest = db.query(MetricReading).filter(
            MetricReading.model_id   == m.id,
            MetricReading.model_type == "ml",
        ).order_by(MetricReading.recorded_at.desc()).limit(3).all()

        # Index latest readings by metric name
        vals = {r.metric_name: r.metric_value for r in latest}
        accuracy   = vals.get("accuracy",    0.90)
        drift      = vals.get("drift_score", 0.10)
        latency    = vals.get("latency_ms",  50.0)

        age_mins = 0
        if latest:
            delta = datetime.now(timezone.utc) - latest[0].recorded_at.replace(tzinfo=timezone.utc)
            age_mins = int(delta.total_seconds() / 60)

        model_summaries.append(MLModelSummary(
            model_id=str(m.id),
            model_name=m.name,
            model_version="v1.0",
            status=_status_from_ml(accuracy, drift),
            current_accuracy=accuracy,
            current_drift=drift,
            current_latency_ms=latency,
            last_updated=f"{age_mins} min ago" if age_mins < 60 else f"{age_mins//60}h ago",
        ))

    # Chart data: average across all visible models per hour
    chart_data = _ml_chart_from_db(db, [m.id for m in visible]) if visible else []

    return MLMetricResponse(
        models=model_summaries,
        chart_data=chart_data,
        total_models=len(model_summaries),
        healthy_count=sum(1 for m in model_summaries if m.status == "healthy"),
        warning_count=sum(1 for m in model_summaries if m.status == "warning"),
        critical_count=sum(1 for m in model_summaries if m.status == "critical"),
    )


def _ml_chart_from_db(db: Session, model_ids: list[int]) -> list[MLMetricPoint]:
    """Return 24h hourly chart by averaging readings across visible models."""
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    rows  = db.query(MetricReading).filter(
        MetricReading.model_id.in_(model_ids),
        MetricReading.model_type == "ml",
        MetricReading.recorded_at >= since,
    ).order_by(MetricReading.recorded_at).all()

    if not rows:
        return _legacy_ml_chart()

    # Bucket by 30-min intervals (same as per-model chart endpoint)
    # Key: full datetime for correct cross-midnight sorting; label: HH:MM for display
    buckets: dict = {}   # datetime_key → {label, metrics}
    for r in rows:
        ts_raw     = r.recorded_at.replace(tzinfo=timezone.utc)
        bucket_min = (ts_raw.minute // 30) * 30
        dt_key     = ts_raw.replace(minute=bucket_min, second=0, microsecond=0)
        label      = dt_key.strftime("%H:%M")
        if dt_key not in buckets:
            buckets[dt_key] = {"label": label, "accuracy": [], "drift_score": [], "latency_ms": []}
        if r.metric_name in buckets[dt_key]:
            buckets[dt_key][r.metric_name].append(r.metric_value)

    return [
        MLMetricPoint(
            timestamp=dt_key.isoformat(),
            accuracy=   round(sum(v["accuracy"])    / len(v["accuracy"])    if v["accuracy"]    else 0.9,  3),
            drift_score=round(sum(v["drift_score"])  / len(v["drift_score"]) if v["drift_score"] else 0.1,  3),
            latency_ms= round(sum(v["latency_ms"])   / len(v["latency_ms"])  if v["latency_ms"]  else 50.0, 1),
        )
        for dt_key, v in sorted(buckets.items())   # sorts by real datetime, not string
    ]


# ────────────────────────────────────────────────────────────────────────
# LLM metrics
# ────────────────────────────────────────────────────────────────────────

def get_llm_metrics_summary(db: Session, user_id: str, is_admin: bool) -> LLMMetricResponse:
    registered = db.query(LLMModel).filter(LLMModel.is_active == True).all()

    if not registered:
        return _legacy_llm_metrics()

    if is_admin:
        allowed_ids = None
    else:
        allowed_ids = _allowed_model_ids(db, user_id, "llm")

    visible = [m for m in registered if allowed_ids is None or m.id in allowed_ids]

    service_summaries = []
    for m in visible:
        # Get last 3 readings for current status
        latest = db.query(MetricReading).filter(
            MetricReading.model_id   == m.id,
            MetricReading.model_type == "llm",
        ).order_by(MetricReading.recorded_at.desc()).limit(3).all()

        vals    = {r.metric_name: r.metric_value for r in latest}
        latency = vals.get("latency_ms",        1000.0)
        tps     = vals.get("tokens_per_second",   45.0)
        quality = vals.get("quality_score",        0.90)
        hallucination = round(1.0 - quality, 3)

        age_mins = 0
        if latest:
            delta = datetime.now(timezone.utc) - latest[0].recorded_at.replace(tzinfo=timezone.utc)
            age_mins = int(delta.total_seconds() / 60)

        # ── Real computed stats from DB (no random mocks) ────────────────
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_readings = db.query(MetricReading).filter(
            MetricReading.model_id   == m.id,
            MetricReading.model_type == "llm",
            MetricReading.recorded_at >= today_start,
        ).all()

        # Count distinct request timestamps as proxy for request count
        req_reading = next((r for r in today_readings if r.metric_name == "request_count"), None)
        if req_reading:
            total_req_today = int(req_reading.metric_value)
        else:
            # Each ingest = 1 request; count readings / 3 metrics (lat, tps, quality)
            total_req_today = max(1, len(today_readings) // 3)

        # Cost = requests × avg_tokens_per_sec × rough cost factor
        # $0.002 per 1K tokens, avg response ~200 tokens
        cost_today = round(total_req_today * tps * 0.000002, 2)

        service_summaries.append(LLMModelSummary(
            service_id=str(m.id),
            service_name=m.name,
            model_version=m.provider,
            status=_status_from_llm(latency, hallucination),
            avg_latency_ms=latency,
            avg_tokens_per_sec=tps,
            hallucination_rate=hallucination,
            total_requests_today=total_req_today,
            cost_today_usd=cost_today,
            last_updated=f"{age_mins} min ago" if age_mins < 60 else f"{age_mins//60}h ago",
        ))

    chart_data = _llm_chart_from_db(db, [m.id for m in visible]) if visible else []

    total_req   = sum(s.total_requests_today for s in service_summaries)
    total_cost  = round(sum(s.cost_today_usd for s in service_summaries), 2)
    avg_hall    = round(sum(s.hallucination_rate for s in service_summaries) / max(len(service_summaries), 1), 3)

    return LLMMetricResponse(
        services=service_summaries,
        chart_data=chart_data,
        total_services=len(service_summaries),
        total_requests_today=total_req,
        total_cost_today_usd=total_cost,
        avg_hallucination_rate=avg_hall,
    )


def _llm_chart_from_db(db: Session, model_ids: list[int]) -> list[LLMMetricsPoint]:
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    rows  = db.query(MetricReading).filter(
        MetricReading.model_id.in_(model_ids),
        MetricReading.model_type == "llm",
        MetricReading.recorded_at >= since,
    ).order_by(MetricReading.recorded_at).all()

    if not rows:
        return _legacy_llm_chart()

    buckets: dict[str, dict] = {}
    for r in rows:
        ts = r.recorded_at.replace(tzinfo=timezone.utc).strftime("%H:%M")
        if ts not in buckets:
            buckets[ts] = {"latency_ms": [], "tokens_per_second": [], "quality_score": []}
        if r.metric_name in buckets[ts]:
            buckets[ts][r.metric_name].append(r.metric_value)

    return [
        LLMMetricsPoint(
            timestamp=ts,
            latency_ms=       round(sum(v["latency_ms"])        / max(len(v["latency_ms"]), 1),        1),
            tokens_per_second=round(sum(v["tokens_per_second"])  / max(len(v["tokens_per_second"]), 1), 1),
            quality_score=    round(sum(v["quality_score"])      / max(len(v["quality_score"]), 1),     3),
        )
        for ts, v in sorted(buckets.items())
    ]


# ────────────────────────────────────────────────────────────────────────
# Legacy fallback (used when no models are in the registry yet)
# ────────────────────────────────────────────────────────────────────────

def _legacy_ml_chart() -> list[MLMetricPoint]:
    data, base_time = [], datetime.now(timezone.utc) - timedelta(hours=23)
    for i in range(24):
        t = base_time + timedelta(hours=i)
        data.append(MLMetricPoint(
            timestamp=t.strftime("%H:%M"),
            accuracy=   round(min(0.99, max(0.70, 0.94 + math.sin(i*0.3)*0.02 + random.uniform(-0.005, 0.005))), 3),
            drift_score=round(0.08 + math.sin(i*0.2)*0.03 + random.uniform(0, 0.01), 2),
            latency_ms= round(45  + math.sin(i*0.4)*10  + random.uniform(0, 5), 1),
        ))
    return data

def _legacy_llm_chart() -> list[LLMMetricsPoint]:
    data, base_time = [], datetime.now(timezone.utc) - timedelta(hours=23)
    for i in range(24):
        t  = base_time + timedelta(hours=i)
        lf = 1.5 if 9 <= t.hour <= 17 else 0.7
        data.append(LLMMetricsPoint(
            timestamp=t.strftime("%H:%M"),
            latency_ms=       round(850 + math.sin(i*0.5)*20*lf + random.uniform(0, 50), 1),
            tokens_per_second=round(45  + math.cos(i*0.3)*8*lf  + random.uniform(0, 3),  1),
            quality_score=    round(min(0.99, max(0.70, 0.91 + math.sin(i*0.2)*0.04 + random.uniform(-0.01, 0.01))), 3),
        ))
    return data

def _legacy_ml_metrics() -> MLMetricResponse:
    models = [
        MLModelSummary(model_id="model_001", model_name="Credit Risk Classifier",  model_version="v2.3.1", status="healthy",  current_accuracy=0.943, current_drift=0.08, current_latency_ms=42.3,  last_updated="2 min ago"),
        MLModelSummary(model_id="model_002", model_name="Fraud Detection",          model_version="v1.8.0", status="warning",  current_accuracy=0.887, current_drift=0.19, current_latency_ms=67.1,  last_updated="5 min ago"),
        MLModelSummary(model_id="model_003", model_name="Loan Default Predictor",   model_version="v3.0.2", status="healthy",  current_accuracy=0.921, current_drift=0.06, current_latency_ms=38.9,  last_updated="1 min ago"),
        MLModelSummary(model_id="model_004", model_name="AML Transaction Scorer",   model_version="v1.2.0", status="critical", current_accuracy=0.731, current_drift=0.31, current_latency_ms=112.4, last_updated="12 min ago"),
    ]
    return MLMetricResponse(models=models, chart_data=_legacy_ml_chart(), total_models=4,
        healthy_count=2, warning_count=1, critical_count=1)

def _legacy_llm_metrics() -> LLMMetricResponse:
    services = [
        LLMModelSummary(service_id="llm_001", service_name="Customer Support Bot",        model_version="gpt-4-turbo",     status="healthy",  avg_latency_ms=923.4,  avg_tokens_per_sec=47.2, hallucination_rate=0.034, total_requests_today=14823, cost_today_usd=312.40, last_updated="1 min ago"),
        LLMModelSummary(service_id="llm_002", service_name="Loan Advisor Assistant",       model_version="gpt-4",           status="warning",  avg_latency_ms=1842.1, avg_tokens_per_sec=31.8, hallucination_rate=0.089, total_requests_today=6241,  cost_today_usd=198.75, last_updated="3 min ago"),
        LLMModelSummary(service_id="llm_003", service_name="Regulatory Doc Summarizer",   model_version="llama-3-70b",     status="healthy",  avg_latency_ms=1102.8, avg_tokens_per_sec=52.1, hallucination_rate=0.021, total_requests_today=3891,  cost_today_usd=44.20,  last_updated="2 min ago"),
        LLMModelSummary(service_id="llm_004", service_name="Transaction Explainer",       model_version="claude-3-sonnet", status="critical", avg_latency_ms=3210.5, avg_tokens_per_sec=18.3, hallucination_rate=0.142, total_requests_today=2109,  cost_today_usd=89.50,  last_updated="18 min ago"),
    ]
    return LLMMetricResponse(services=services, chart_data=_legacy_llm_chart(), total_services=4,
        total_requests_today=27064, total_cost_today_usd=644.85, avg_hallucination_rate=0.072)