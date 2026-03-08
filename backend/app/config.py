import os
from dotenv import load_dotenv

# Load variables from .env file into os.environ
load_dotenv()

# ── Validate required env vars at startup — fail loudly ───────────────
_secret_key = os.getenv("SECRET_KEY")
if not _secret_key or len(_secret_key) < 32:
    raise ValueError(
        "SECRET_KEY environment variable must be at least 32 characters. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

# C1 FIX: No hardcoded DB credentials — require explicit DATABASE_URL in .env
_db_url = os.getenv("DATABASE_URL")
if not _db_url:
    raise ValueError(
        "DATABASE_URL environment variable is required. "
        "Example: DATABASE_URL=postgresql://user:pass@localhost:5432/observeml"
    )


class Settings:
    DATABASE_URL: str = _db_url
    REDIS_URL:    str = os.getenv("REDIS_URL", "")
    SECRET_KEY:   str = _secret_key
    APP_ENV:      str = os.getenv("APP_ENV", "development")


# Single instance — import this everywhere
settings = Settings()

