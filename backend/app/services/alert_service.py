"""
alert_service.py
================
Responsibilities:
1. ConnectionManager  — tracks WebSocket clients, broadcasts via Redis Pub/Sub (multi-worker safe)
2. threshold_checker  — every 30s AND on every ingest: checks DB, fires real alerts
3. Alerts are PERSISTED to DB (no more memory-only)
4. Broadcasts metric_updated events so charts can react instantly
5. SC2: Alert cooldowns stored in Redis (prevents duplicate alerts across workers)
"""
import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import WebSocket
from app.config import settings

logger = logging.getLogger(__name__)

# SC1: Module-level Redis client — initialized at app startup, NOT lazily on first WS connect
_redis_client = None


async def init_redis():
    """Called from main.py startup: initializes Redis once for the entire process (SC1)."""
    global _redis_client
    if not settings.REDIS_URL:
        logger.info("REDIS_URL not set — using in-memory WS broadcast (single-worker mode)")
        return
    try:
        import redis.asyncio as redis
        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        await client.ping()
        _redis_client = client
        logger.info("Redis connected for WS broadcast + alert cooldown (multi-worker safe)")
    except Exception as e:
        logger.warning("Redis unavailable, using in-memory fallback: %s", e)
        _redis_client = None


# ── Connection Manager ─────────────────────────────────────────────────────────
class ConnectionManager:
    """
    SC1: Uses the module-level _redis_client (set at startup) for Pub/Sub broadcasting.
    When Redis is available: all workers share a single broadcast channel.
    When Redis is absent: in-memory broadcast (single-worker only — dev mode).
    """
    def __init__(self):
        self.active: List[WebSocket] = []
        self._listen_task = None

    async def start(self):
        """Start Redis Pub/Sub listener if Redis is available (called at app startup)."""
        if _redis_client:
            try:
                pubsub = _redis_client.pubsub()
                await pubsub.subscribe("alerts:broadcast")
                self._listen_task = asyncio.create_task(self._listen_redis(pubsub))
                logger.info("Redis Pub/Sub listener started — broadcasts go to all workers")
            except Exception as e:
                logger.error("Failed to start Redis Pub/Sub listener: %s", e)

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        logger.info("WebSocket connected. Total: %d", len(self.active))

    async def _listen_redis(self, pubsub):
        """Relay Redis Pub/Sub messages to all locally connected WebSocket clients."""
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = message["data"]
                    for ws in list(self.active):
                        try:
                            await ws.send_text(data)
                        except Exception:
                            self.disconnect(ws)
        except Exception as e:
            logger.error("Redis listener crashed: %s", repr(e))

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        logger.info("WebSocket disconnected. Total: %d", len(self.active))

    async def broadcast(self, data: dict):
        message = json.dumps(data)
        if _redis_client:
            try:
                await _redis_client.publish("alerts:broadcast", message)
                return   # Pub/Sub relays to all workers automatically
            except Exception as e:
                logger.error("Redis publish error: %s", repr(e))
        # Fallback to local broadcast
        await self._local_broadcast(message)

    async def _local_broadcast(self, message: str):
        for ws in list(self.active):
            try:
                await ws.send_text(message)
            except Exception:
                self.disconnect(ws)

    async def send_to(self, ws: WebSocket, data: dict):
        try:
            await ws.send_text(json.dumps(data))
        except Exception:
            self.disconnect(ws)


# Single shared instance
manager = ConnectionManager()



# ── Helper: build alert dict from DB row ──────────────────────────────
def _alert_dict(alert) -> dict:
    return {
        "id":       alert.alert_uid,
        "severity": alert.severity,
        "model":    alert.model_name,
        "type":     alert.model_type,
        "msg":      alert.message,
        "time":     alert.triggered_at.isoformat(),
        "ack":      alert.acknowledged,
    }


# ── Helper: persist alert to DB and broadcast ─────────────────────────
async def _persist_and_broadcast(db, alert_dict: dict):
    """Save alert to DB and push to all connected WebSocket clients."""
    from app.models.alert import Alert
    rec = Alert(
        alert_uid=alert_dict["id"],
        severity=alert_dict["severity"],
        model_name=alert_dict["model"],
        model_type=alert_dict["type"],
        message=alert_dict["msg"],
        triggered_at=datetime.fromisoformat(alert_dict["time"]),
        acknowledged=False,
    )
    db.add(rec)
    db.commit()
    await manager.broadcast({"type": "new_alert", "alert": alert_dict})


# ── Helper: create alert dict ─────────────────────────────────────────
import random
def _mk_alert(severity: str, model: str, type_: str, msg: str) -> dict:
    import time
    return {
        "id":       f"alert_{int(time.time() * 1000)}_{random.randint(0, 9999)}",
        "severity": severity,
        "model":    model,
        "type":     type_,
        "msg":      msg,
        "time":     datetime.now(timezone.utc).isoformat(),
        "ack":      False,
    }


# ── Background task: real threshold checker every 30s ─────────────────
_DEFAULTS = {
    "driftThreshold":     0.15,
    "hallucinationLimit": 10.0,
    "accuracyFloor":      75.0,
    "mlLatencySLA":       200.0,
    "llmLatencySLA":      1800.0,
}

_COOLDOWN_SECONDS = 30


async def _can_alert_redis(key: tuple) -> bool:
    """
    SC2: Uses Redis SET NX EX for atomic multi-process-safe cooldown.
    Falls back to in-memory dict if Redis is unavailable.
    """
    lock_key = f"alert_cooldown:{key[0]}:{key[1]}"
    if _redis_client:
        try:
            result = await _redis_client.set(lock_key, "1", nx=True, ex=_COOLDOWN_SECONDS)
            return result is True  # True = key was newly set = alert is allowed
        except Exception as e:
            logger.warning("Redis cooldown check failed, using in-memory: %s", e)
    # In-memory fallback
    now = datetime.now(timezone.utc)
    last = _alerted_local.get(key)
    if last and (now - last).total_seconds() < _COOLDOWN_SECONDS:
        return False
    _alerted_local[key] = now
    return True


_alerted_local: dict[tuple, datetime] = {}  # in-memory fallback only


async def threshold_checker():
    logger.info("Threshold checker started")
    await asyncio.sleep(15)
    while True:
        try:
            await _check_thresholds()
        except Exception as e:
            logger.warning("Threshold check failed: %s", e)
        await asyncio.sleep(30)


async def _check_thresholds(model_id: Optional[int] = None, model_type: Optional[str] = None):
    """
    SC3: model_id+model_type narrow the check to a single model (called from ingest).
    When called without args (background 30s sweep) it checks all active models.
    SC2: All cooldowns use _can_alert_redis (Redis atomic, multi-process safe).
    Thresholds are read from the ADMIN user's settings (user_settings table).
    """
    from app.database import SessionLocal
    from app.models.metric_reading import MetricReading
    from app.models.ml_model import MLModel
    from app.models.llm_model import LLMModel
    from app.models.user_setting import UserSetting
    from app.models.user import User
    from app.schemas.auth import Role



    db = SessionLocal()
    try:
        # ── Load thresholds from admin's settings (not mixed from all users) ──
        admin = db.query(User).filter(User.role == Role.admin).first()
        thresholds = dict(_DEFAULTS)
        if admin:
            admin_settings = db.query(UserSetting).filter(
                UserSetting.user_id == str(admin.id),
                UserSetting.key.in_(list(_DEFAULTS.keys())),
            ).all()
            for s in admin_settings:
                try:
                    thresholds[s.key] = float(s.value)
                except ValueError:
                    pass

        drift_thresh = thresholds["driftThreshold"]
        hall_thresh  = thresholds["hallucinationLimit"] / 100.0
        acc_floor    = thresholds["accuracyFloor"] / 100.0
        ml_lat_sla   = thresholds["mlLatencySLA"]
        llm_lat_sla  = thresholds["llmLatencySLA"]

        # SC3: targeted or full sweep
        if model_type == "ml" and model_id is not None:
            ml_models  = db.query(MLModel).filter(MLModel.id == model_id, MLModel.is_active == True).all()
            llm_models: list = []
        elif model_type == "llm" and model_id is not None:
            ml_models  = []
            llm_models = db.query(LLMModel).filter(LLMModel.id == model_id, LLMModel.is_active == True).all()
        else:
            ml_models  = db.query(MLModel).filter(MLModel.is_active == True).all()
            llm_models = db.query(LLMModel).filter(LLMModel.is_active == True).all()

        fired_alerts = []  # collect for email dispatch

        # ── ML models ────────────────────────────────────────────────────────
        for model in ml_models:
            latest = db.query(MetricReading).filter(
                MetricReading.model_id   == model.id,
                MetricReading.model_type == "ml",
            ).order_by(MetricReading.recorded_at.desc()).limit(3).all()

            vals     = {r.metric_name: r.metric_value for r in latest}
            accuracy = vals.get("accuracy")
            drift    = vals.get("drift_score")
            latency  = vals.get("latency_ms")

            if accuracy is not None and accuracy < acc_floor:
                if await _can_alert_redis((model.id, "accuracy")):
                    a = _mk_alert("critical", model.name, "ML Model",
                                  f"Accuracy {round(accuracy*100,1)}% is below the {round(acc_floor*100)}% floor")
                    await _persist_and_broadcast(db, a)
                    fired_alerts.append(a)

            if drift is not None and drift > drift_thresh:
                if await _can_alert_redis((model.id, "drift_score")):
                    a = _mk_alert("warning", model.name, "ML Model",
                                  f"Data drift {drift:.3f} exceeds threshold {drift_thresh}")
                    await _persist_and_broadcast(db, a)
                    fired_alerts.append(a)

            if latency is not None and latency > ml_lat_sla:
                if await _can_alert_redis((model.id, "latency_ms")):
                    a = _mk_alert("warning", model.name, "ML Model",
                                  f"Latency {latency:.0f}ms exceeds SLA {ml_lat_sla:.0f}ms")
                    await _persist_and_broadcast(db, a)
                    fired_alerts.append(a)

        # ── LLM services ─────────────────────────────────────────────────────
        for model in llm_models:
            latest = db.query(MetricReading).filter(
                MetricReading.model_id   == model.id,
                MetricReading.model_type == "llm",
            ).order_by(MetricReading.recorded_at.desc()).limit(3).all()

            vals    = {r.metric_name: r.metric_value for r in latest}
            latency = vals.get("latency_ms")
            quality = vals.get("quality_score")

            if latency is not None and latency > llm_lat_sla:
                if await _can_alert_redis((model.id, "llm_latency")):
                    a = _mk_alert("warning", model.name, "LLM Service",
                                  f"Latency {latency:.0f}ms exceeds SLA {llm_lat_sla:.0f}ms")
                    await _persist_and_broadcast(db, a)
                    fired_alerts.append(a)

            if quality is not None:
                hallucination = round(1.0 - quality, 4)
                if hallucination > hall_thresh:
                    if await _can_alert_redis((model.id, "hallucination")):
                        pct = round(hallucination * 100, 1)
                        a = _mk_alert("critical", model.name, "LLM Service",
                                      f"Hallucination rate {pct}% exceeds {round(hall_thresh*100)}% limit")
                        await _persist_and_broadcast(db, a)
                        fired_alerts.append(a)

        # ── Send email for every fired alert (non-blocking) ──────────────────
        if fired_alerts:
            loop = asyncio.get_event_loop()
            from app.services.email_service import send_alert_email
            for alert_dict in fired_alerts:
                loop.run_in_executor(None, send_alert_email, alert_dict)

    finally:
        db.close()






async def data_retention_job():
    """
    SC7: Deletes metric readings older than 30 days in batches of 1000
    to avoid locking the table and causing write timeouts.
    """
    from app.database import SessionLocal
    from app.models.metric_reading import MetricReading
    logger.info("Data retention job started")
    while True:
        try:
            db = SessionLocal()
            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            total_deleted = 0
            while True:
                ids = db.query(MetricReading.id).filter(
                    MetricReading.recorded_at < cutoff
                ).limit(1000).all()
                if not ids:
                    break
                id_list = [r.id for r in ids]
                db.query(MetricReading).filter(
                    MetricReading.id.in_(id_list)
                ).delete(synchronize_session=False)
                db.commit()
                total_deleted += len(id_list)
                await asyncio.sleep(0.1)  # SC7: yield between batches, avoid lock storms
            if total_deleted > 0:
                logger.info("Purged %d old metric readings in batches", total_deleted)
        except Exception as e:
            logger.error("Data retention job failed: %s", repr(e))
        finally:
            db.close()
        # Run once every 24 hours
        await asyncio.sleep(86400)


# ── Load recent alerts from DB (for WS initial_alerts) ────────────────
def get_recent_alerts_from_db(limit: int = 50) -> list[dict]:
    from app.database import SessionLocal
    from app.models.alert import Alert
    db = SessionLocal()
    try:
        rows = (
            db.query(Alert)
            .order_by(Alert.triggered_at.desc())
            .limit(limit)
            .all()
        )
        return [r.to_dict() for r in rows]
    finally:
        db.close()


# ── Acknowledge all in DB ─────────────────────────────────────────────
def acknowledge_all_in_db():
    from app.database import SessionLocal
    from app.models.alert import Alert
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(Alert).filter(Alert.acknowledged == False).update({
            "acknowledged": True,
            "acknowledged_at": now,
        })
        db.commit()
    finally:
        db.close()


# ── Acknowledge single in DB ──────────────────────────────────────────
def acknowledge_in_db(alert_uid: str):
    from app.database import SessionLocal
    from app.models.alert import Alert
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(Alert).filter(Alert.alert_uid == alert_uid).update({
            "acknowledged": True,
            "acknowledged_at": now,
        })
        db.commit()
    finally:
        db.close()





