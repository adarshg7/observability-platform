from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
import hashlib

from app.database import get_db
from app.api.routes.auth import require_auth
from app.schemas.auth import UserResponse
from app.schemas.metrics import MLMetricResponse, LLMMetricResponse
from app.services.metrics_services import (
    get_ml_metrics_summary, get_llm_metrics_summary,
    seed_ml_readings, seed_llm_readings,
)
from app.models.ml_model import MLModel
from app.models.llm_model import LLMModel
from app.models.metric_reading import MetricReading
from datetime import datetime, timezone
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/metrics", tags=["Metrics"])


# ── Auth helper ───────────────────────────────────────────────────────
from app.schemas.auth import Role
def _is_admin(user: UserResponse) -> bool:
    return user.role == Role.admin   # direct enum comparison — never fragile string repr


# ── API-key or JWT authenticated model listing (for simulator/pipelines)
@router.get("/models")
def list_available_models(request: Request, db: Session = Depends(get_db)):
    """
    List all active ML and LLM models.
    Authenticates via API key (X-API-Key / Authorization: ApiKey)
    OR via Bearer JWT token.
    Used by external pipelines to discover model IDs.
    """
    from app.models.api_key import APIKey

    auth_header = request.headers.get("Authorization", "")
    x_api_key   = request.headers.get("X-API-Key", "")
    raw_key = None
    if auth_header.startswith("ApiKey "):
        raw_key = auth_header[len("ApiKey "):]
    elif x_api_key:
        raw_key = x_api_key

    authed = False
    if raw_key:
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        key = db.query(APIKey).filter(APIKey.key_hash == key_hash, APIKey.is_active == True).first()
        authed = key is not None
    elif auth_header.startswith("Bearer "):
        # C3 FIX: Actually validate the JWT token — never trust the string alone
        from app.services.auth_service import get_current_user
        token = auth_header[len("Bearer "):].strip()
        jwt_user = get_current_user(token, db)
        authed = jwt_user is not None

    if not authed:
        raise HTTPException(status_code=401, detail="Provide X-API-Key or Bearer token")

    ml_models  = db.query(MLModel).filter(MLModel.is_active == True).order_by(MLModel.id).all()
    llm_models = db.query(LLMModel).filter(LLMModel.is_active == True).order_by(LLMModel.id).all()

    return {
        "ml": [
            {"id": m.id, "name": m.name, "model_type": m.model_type, "created_by": m.created_by}
            for m in ml_models
        ],
        "llm": [
            {"id": m.id, "name": m.name, "provider": m.provider, "created_by": m.created_by}
            for m in llm_models
        ],
    }



# ── ML metrics ────────────────────────────────────────────────────────

@router.get("/ml", response_model=MLMetricResponse)
def get_ml_metrics(
    current_user: Annotated[UserResponse, Depends(require_auth)],
    db:           Session = Depends(get_db),
):
    return get_ml_metrics_summary(db, str(current_user.id), _is_admin(current_user))


# ── LLM metrics ───────────────────────────────────────────────────────

@router.get("/llm", response_model=LLMMetricResponse)
def get_llm_metrics(
    current_user: Annotated[UserResponse, Depends(require_auth)],
    db:           Session = Depends(get_db),
):
    return get_llm_metrics_summary(db, str(current_user.id), _is_admin(current_user))


# ── Metric ingestion endpoint ─────────────────────────────────────────
# External ML pipelines POST here to store real readings.

class IngestPayload(BaseModel):
    model_id:     int
    model_type:   str   # "ml" or "llm"
    # H3 FIX: Strict name pattern + 100-char limit prevents DB DoS via huge payloads
    metric_name:  str   = Field(
        ...,
        min_length=1,
        max_length=100,
        pattern=r'^[a-z][a-z0-9_]{0,99}$',
        description="Lowercase alphanumeric + underscores, e.g. 'accuracy', 'latency_ms'"
    )
    metric_value: float = Field(..., ge=-1e12, le=1e12)   # sane numeric range
    recorded_at:  str | None = None   # ISO8601; defaults to now


def _resolve_ingest_auth(
    request: Request,
    db:      Session,
) -> str:
    """
    Returns the actor identity string (email or key name).
    Accepts two auth schemes:
      1. Authorization: Bearer <JWT>   (regular user)
      2. Authorization: ApiKey <raw>   (API key)
      3. X-API-Key: <raw>              (API key, alternative header)
    """
    import hashlib
    from app.models.api_key import APIKey
    from datetime import datetime, timezone

    auth_header = request.headers.get("Authorization", "")
    x_api_key   = request.headers.get("X-API-Key", "")

    raw_key = None
    if auth_header.startswith("ApiKey "):
        raw_key = auth_header[len("ApiKey "):]
    elif x_api_key:
        raw_key = x_api_key

    if raw_key:
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        key = db.query(APIKey).filter(
            APIKey.key_hash == key_hash,
            APIKey.is_active == True,
        ).first()
        if not key:
            raise HTTPException(status_code=401, detail="Invalid or revoked API key")
        # Update last_used
        key.last_used = datetime.now(timezone.utc)
        db.commit()
        # S7: Write audit log for API key usage
        try:
            from app.services.audit import log_action
            log_action(db, key.owner_id, key.owner_email, "apikey.ingest",
                       detail=f"API key '{key.name}' used for metric ingest")
        except Exception:
            pass
        return f"apikey:{key.name}"

    # Fall back to JWT
    if auth_header.startswith("Bearer "):
        from app.api.routes.auth import require_auth
        # Can't call Depends directly here — let the outer route handle JWT
        return "__jwt__"

    raise HTTPException(status_code=401, detail="Authentication required (Bearer JWT or ApiKey)")


@router.post("/ingest", status_code=201)
def ingest_metric(
    body:    IngestPayload,
    request: Request,
    db:      Session = Depends(get_db),
):
    """
    Ingest a single metric reading.
    Auth: JWT Bearer token  OR  ApiKey / X-API-Key header.
    """
    actor = _resolve_ingest_auth(request, db)

    # If JWT fallback — validate the token manually
    if actor == "__jwt__":
        from app.api.routes.auth import require_auth
        from app.services.auth_service import get_current_user
        token = request.headers.get("Authorization", "")[len("Bearer "):].strip()
        user  = get_current_user(token, db)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid JWT token")
        actor = user.email

    if body.model_type not in ("ml", "llm"):
        raise HTTPException(status_code=400, detail="model_type must be 'ml' or 'llm'")

    if body.model_type == "ml":
        model = db.query(MLModel).filter(MLModel.id == body.model_id).first()
    else:
        model = db.query(LLMModel).filter(LLMModel.id == body.model_id).first()

    if not model:
        raise HTTPException(status_code=404, detail=f"{body.model_type.upper()} model {body.model_id} not found")

    ts = datetime.now(timezone.utc)
    if body.recorded_at:
        try:
            ts = datetime.fromisoformat(body.recorded_at).replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid recorded_at format — use ISO8601")

    reading = MetricReading(
        model_id=body.model_id,
        model_type=body.model_type,
        metric_name=body.metric_name,
        metric_value=body.metric_value,
        recorded_at=ts,
    )
    db.add(reading)
    db.commit()

    # SC3: Only check thresholds for the specific model being ingested
    # (30s background sweep still handles models with no active ingestion)
    try:
        import asyncio
        from app.services.alert_service import _check_thresholds, manager
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(_check_thresholds(
                model_id=body.model_id, model_type=body.model_type
            ))
            # Notify all open browser tabs that new data arrived → charts re-fetch immediately
            asyncio.ensure_future(manager.broadcast({
                "type":       "metric_updated",
                "model_id":   body.model_id,
                "model_type": body.model_type,
            }))
    except Exception:
        pass

    return {"message": "Metric stored", "id": reading.id, "actor": actor}


# ── Seed readings endpoint (admin only) ───────────────────────────────
# Useful when a model is added and you want to backfill 24h of demo data.

@router.post("/seed/{model_type}/{model_id}", status_code=201)
def seed_model_readings(
    model_type:   str,
    model_id:     int,
    current_user: Annotated[UserResponse, Depends(require_auth)],
    db:           Session = Depends(get_db),
):
    """Seed 24h of demo readings for a specific model (admin only)."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin only")

    if model_type == "ml":
        model = db.query(MLModel).filter(MLModel.id == model_id).first()
        if not model:
            raise HTTPException(status_code=404, detail="ML model not found")
        seed_ml_readings(db, model)
    elif model_type == "llm":
        model = db.query(LLMModel).filter(LLMModel.id == model_id).first()
        if not model:
            raise HTTPException(status_code=404, detail="LLM model not found")
        seed_llm_readings(db, model)
    else:
        raise HTTPException(status_code=400, detail="model_type must be 'ml' or 'llm'")

    return {"message": f"Seeded 24h of readings for {model_type} model {model_id}"}


# ── Per-model chart data ─────────────────────────────────────────────
# Returns time-series chart data for a single model (last 24h, ~30min buckets)

@router.get("/ml/{model_id}/chart")
def get_ml_model_chart(
    model_id:     int,
    current_user: Annotated[UserResponse, Depends(require_auth)],
    db:           Session = Depends(get_db),
    hours:        int = 24,
):
    """Return chart-ready time-series for a specific ML model."""
    model = db.query(MLModel).filter(MLModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="ML model not found")

    since = datetime.now(timezone.utc) - __import__('datetime').timedelta(hours=max(1, min(hours, 168)))
    rows = (
        db.query(MetricReading)
        .filter(
            MetricReading.model_id   == model_id,
            MetricReading.model_type == "ml",
            MetricReading.recorded_at >= since,
        )
        .order_by(MetricReading.recorded_at.asc())
        .all()
    )

    # Group by 30-min bucket and average values
    from collections import defaultdict
    buckets: dict = defaultdict(lambda: defaultdict(list))
    for r in rows:
        # round down to 30-min bucket
        ts = r.recorded_at.replace(second=0, microsecond=0)
        bucket_min = (ts.minute // 30) * 30
        bucket = ts.replace(minute=bucket_min)
        buckets[bucket][r.metric_name].append(r.metric_value)

    chart = []
    for ts in sorted(buckets.keys()):
        vals = buckets[ts]
        point = {
            "timestamp":   ts.isoformat(),
            "accuracy":    round(sum(vals.get("accuracy",   [0])) / max(1, len(vals.get("accuracy",   [1]))), 4),
            "drift_score": round(sum(vals.get("drift_score",[0])) / max(1, len(vals.get("drift_score",[1]))), 4),
            "latency_ms":  round(sum(vals.get("latency_ms", [0])) / max(1, len(vals.get("latency_ms", [1]))), 1),
        }
        chart.append(point)

    return {
        "model_id":   model.id,
        "model_name": model.name,
        "model_type": model.model_type,
        "chart_data": chart,
        "data_points": len(rows),
    }


@router.get("/llm/{model_id}/chart")
def get_llm_model_chart(
    model_id:     int,
    current_user: Annotated[UserResponse, Depends(require_auth)],
    db:           Session = Depends(get_db),
    hours:        int = 24,
):
    """Return chart-ready time-series for a specific LLM model."""
    model = db.query(LLMModel).filter(LLMModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="LLM model not found")

    since = datetime.now(timezone.utc) - __import__('datetime').timedelta(hours=max(1, min(hours, 168)))
    rows = (
        db.query(MetricReading)
        .filter(
            MetricReading.model_id   == model_id,
            MetricReading.model_type == "llm",
            MetricReading.recorded_at >= since,
        )
        .order_by(MetricReading.recorded_at.asc())
        .all()
    )

    from collections import defaultdict
    buckets: dict = defaultdict(lambda: defaultdict(list))
    for r in rows:
        ts = r.recorded_at.replace(second=0, microsecond=0)
        bucket_min = (ts.minute // 30) * 30
        bucket = ts.replace(minute=bucket_min)
        buckets[bucket][r.metric_name].append(r.metric_value)

    chart = []
    for ts in sorted(buckets.keys()):
        vals = buckets[ts]
        point = {
            "timestamp":        ts.isoformat(),
            "quality_score":    round(sum(vals.get("quality_score",   [0])) / max(1, len(vals.get("quality_score",   [1]))), 4),
            "latency_ms":       round(sum(vals.get("latency_ms",      [0])) / max(1, len(vals.get("latency_ms",      [1]))), 1),
            "tokens_per_second":round(sum(vals.get("tokens_per_second",[0])) / max(1, len(vals.get("tokens_per_second",[1]))), 1),
        }
        chart.append(point)

    return {
        "model_id":   model.id,
        "model_name": model.name,
        "provider":   model.provider,
        "chart_data": chart,
        "data_points": len(rows),
    }