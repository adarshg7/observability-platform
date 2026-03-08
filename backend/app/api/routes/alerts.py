import logging
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.alert_service import (
    manager,
    get_recent_alerts_from_db,
    acknowledge_in_db,
    acknowledge_all_in_db,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Alerts"])


@router.websocket("/ws/alerts")
async def websocket_alerts(ws: WebSocket):
    """
    WebSocket endpoint for live alerts.

    S1 FIX: JWT token is sent as the FIRST MESSAGE after connection — never in the URL.
    Expected first message: {"type": "auth", "token": "<jwt>"}
    This prevents the token from appearing in server/proxy/CDN access logs and browser history.

    Protocol:
    - On connect: client sends auth message, server sends initial_alerts (last 50 from DB)
    - new_alert / metric_updated: broadcast to all authenticated clients
    - acknowledge / acknowledge_all: persists to DB then broadcasts
    """
    # Accept the WS upgrade so we can send proper close frames
    await ws.accept()

    # ── S1: Read auth message — token is NEVER in the URL ─────────────
    try:
        auth_msg = await ws.receive_json()
    except Exception:
        await ws.close(code=4001, reason="Failed to receive auth message")
        return

    if not isinstance(auth_msg, dict) or auth_msg.get("type") != "auth":
        await ws.close(code=4001, reason="First message must be {type:'auth', token:'...'}")
        return

    token = auth_msg.get("token", "")
    if not token:
        await ws.close(code=4001, reason="Missing token in auth message")
        return

    # ── Validate JWT ───────────────────────────────────────────────────
    from app.database import SessionLocal
    from app.services.auth_service import get_current_user
    db = SessionLocal()
    try:
        user = get_current_user(token, db)
        if not user:
            await ws.close(code=4001, reason="Invalid or expired token")
            return
    finally:
        db.close()

    # ── Auth passed — register connection ──────────────────────────────
    manager.active.append(ws)
    logger.info("WebSocket authenticated: %s. Total: %d", user.email, len(manager.active))

    # Send persisted history (survives server restarts)
    try:
        history = get_recent_alerts_from_db(limit=50)
        await manager.send_to(ws, {"type": "initial_alerts", "alerts": history})
    except Exception as e:
        logger.warning("Failed to send initial alerts: %s", e)
        manager.disconnect(ws)
        return

    # ── Main message loop ──────────────────────────────────────────────
    try:
        while True:
            data = await ws.receive_json()
            action = data.get("action")

            if action == "acknowledge":
                alert_id = data.get("alert_id")
                acknowledge_in_db(alert_id)
                await manager.broadcast({
                    "type":     "alert_acknowledged",
                    "alert_id": alert_id,
                })

            elif action == "acknowledge_all":
                acknowledge_all_in_db()
                await manager.broadcast({"type": "all_acknowledged"})

    except WebSocketDisconnect:
        logger.info("Client disconnected cleanly")
    except Exception as e:
        logger.warning("WebSocket loop error: %s", e)
    finally:
        manager.disconnect(ws)


# ── REST: get alert history (paginated) ───────────────────────────────
@router.get("/api/alerts")
def get_alerts(limit: int = 50, offset: int = 0):
    """Return persisted alerts, newest first."""
    from app.database import SessionLocal
    from app.models.alert import Alert
    db = SessionLocal()
    try:
        total = db.query(Alert).count()
        rows  = (
            db.query(Alert)
            .order_by(Alert.triggered_at.desc())
            .offset(offset).limit(min(limit, 100))
            .all()
        )
        return {"total": total, "alerts": [r.to_dict() for r in rows]}
    finally:
        db.close()

