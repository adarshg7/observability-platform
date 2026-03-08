"""
conftest.py
===========
Shared pytest fixtures for all tests.
Uses an in-memory SQLite DB so tests never touch the real PostgreSQL database.
"""
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Override env vars BEFORE importing app to avoid config validation errors
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-chars!!")
os.environ.setdefault("APP_ENV", "testing")
os.environ.setdefault("ADMIN_EMAIL", "admin@test.com")
os.environ.setdefault("ADMIN_PASSWORD", "TestAdmin@123!")

from app.database import Base, get_db
from app.main import app

# ── In-memory SQLite engine for tests ─────────────────────────────────
TEST_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function", autouse=True)
def setup_db():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="function")
def client(setup_db):
    """FastAPI TestClient with DB override wired in."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
