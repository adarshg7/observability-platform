"""
main.py — Application entry point
Industry-grade production setup:
  - Lifespan context manager (startup + graceful shutdown)
  - Structured JSON logging
  - Request ID correlation header
  - Body size limit middleware
  - Restricted CORS
  - Environment-gated API docs
  - Real DB + Redis health check
"""
import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.api.routes import metrics, auth, alerts, users, admin
from app.models.allowed_domain import AllowedDomain   # noqa: F401
from app.models.ml_model import MLModel               # noqa: F401
from app.models.llm_model import LLMModel             # noqa: F401
from app.models.user_access import UserModelAccess    # noqa: F401
from app.models.metric_reading import MetricReading   # noqa: F401
from app.models.user_setting import UserSetting       # noqa: F401
from app.models.audit_log import AuditLog             # noqa: F401
from app.models.api_key import APIKey                 # noqa: F401
from app.models.alert import Alert                    # noqa: F401

# ── #9: Structured JSON logging — required for Datadog / ELK / CloudWatch ─────
class _JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({
            "ts":     self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level":  record.levelname,
            "logger": record.name,
            "msg":    record.getMessage(),
            "file":   f"{record.filename}:{record.lineno}",
        }, ensure_ascii=False)

_handler = logging.StreamHandler()
_handler.setFormatter(_JSONFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler], force=True)
logger = logging.getLogger(__name__)


# ── #8: Body size limit middleware — prevents RAM-exhaustion DoS ───────────────
_MAX_BODY_BYTES = 4 * 1024 * 1024   # 4 MB

class _BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > _MAX_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": f"Request body too large. Maximum size is {_MAX_BODY_BYTES // (1024*1024)}MB."},
            )
        return await call_next(request)


# ── Background task handles (for graceful shutdown) ───────────────────────────
_bg_tasks: list[asyncio.Task] = []


# ── #14: Lifespan context manager (replaces deprecated @on_event) ─────────────
@asynccontextmanager
async def lifespan(application: FastAPI):
    # ── STARTUP ───────────────────────────────────────────────────────────────
    logger.info("Starting up ObserveML platform")
    Base.metadata.create_all(bind=engine)

    from app.services.auth_service import seed_admin
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()

    from app.services.alert_service import init_redis, manager, threshold_checker, data_retention_job
    await init_redis()
    await manager.start()
    _bg_tasks.append(asyncio.create_task(threshold_checker(),    name="threshold_checker"))
    _bg_tasks.append(asyncio.create_task(data_retention_job(),  name="data_retention_job"))
    logger.info("All background tasks started")

    yield  # ── Application runs here ──────────────────────────────────────────

    # ── #11: GRACEFUL SHUTDOWN ────────────────────────────────────────────────
    logger.info("Shutting down — cancelling background tasks")
    for task in _bg_tasks:
        if not task.done():
            task.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
    logger.info("Shutdown complete")


# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

# ── #10: OpenAPI docs hidden in production ────────────────────────────────────
_is_prod = settings.APP_ENV.lower() == "production"
_docs_url    = None if _is_prod else "/docs"
_redoc_url   = None if _is_prod else "/redoc"
_openapi_url = None if _is_prod else "/openapi.json"

app = FastAPI(
    title="Unified ML/LLM Observability Platform",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── #8: Body size limit ───────────────────────────────────────────────────────
app.add_middleware(_BodySizeLimitMiddleware)

# ── #7: Explicit CORS — no wildcards on methods or headers ───────────────────
_allowed_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    # Explicit list — removes TRACE (XST attack vector) and wildcard headers
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


# ── #15: Request ID middleware — attach correlation ID to every request/response
@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    return response


# ── Security headers middleware ───────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"]    = "nosniff"
    response.headers["X-Frame-Options"]           = "DENY"
    response.headers["X-XSS-Protection"]          = "1; mode=block"
    response.headers["Referrer-Policy"]           = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"]        = "camera=(), microphone=(), geolocation=()"
    _api_base    = os.getenv("APP_BASE_URL", "localhost:8000")
    _csp_connect = f"'self' ws://{_api_base} wss://{_api_base}"
    response.headers["Content-Security-Policy"] = (
        f"default-src 'self'; "
        f"script-src 'self' 'unsafe-inline'; "
        f"style-src 'self' 'unsafe-inline'; "
        f"connect-src {_csp_connect}"
    )
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.include_router(metrics.router)
app.include_router(auth.router)
app.include_router(alerts.router)
app.include_router(users.router)
app.include_router(admin.router)


# ── #3: Real health check — returns 503 if DB is down ────────────────────────
@app.get("/health", include_in_schema=not _is_prod)
def health_check(db=None):
    from sqlalchemy import text
    from app.database import SessionLocal
    from app.services.alert_service import _redis_client

    db_ok    = False
    redis_ok = _redis_client is not None

    try:
        _db = SessionLocal()
        _db.execute(text("SELECT 1"))
        _db.close()
        db_ok = True
    except Exception as e:
        logger.error("Health check — DB unreachable: %s", e)

    status_code = 200 if db_ok else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status":  "healthy" if db_ok else "degraded",
            "db":      db_ok,
            "redis":   redis_ok,
            "version": "1.0.0",
        },
    )
