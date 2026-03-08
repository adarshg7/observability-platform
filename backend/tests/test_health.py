"""
test_health.py
==============
Tests for the /health endpoint — must return real DB status.
Run with: pytest tests/test_health.py -v
"""


def test_health_returns_200_with_db_and_redis_keys(client):
    """Health check must return JSON with 'db', 'redis', 'status', 'version' keys."""
    resp = client.get("/health")
    assert resp.status_code in (200, 503)   # 200 if DB up, 503 if DB down
    data = resp.json()
    assert "db"      in data
    assert "redis"   in data
    assert "status"  in data
    assert "version" in data


def test_health_status_healthy_when_db_ok(client):
    """In the test environment (SQLite in-memory), DB should always be healthy."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"
    assert resp.json()["db"] is True


def test_body_size_limit_enforced(client):
    """Requests over 4MB must be rejected with HTTP 413."""
    large_body = "x" * (5 * 1024 * 1024)   # 5MB
    resp = client.post("/api/auth/login",
        content=large_body,
        headers={"Content-Type": "application/json",
                 "Content-Length": str(len(large_body))})
    assert resp.status_code == 413


def test_request_id_header_in_response(client):
    """Every response must contain an X-Request-ID header."""
    resp = client.get("/health")
    assert "x-request-id" in resp.headers


def test_request_id_is_echoed_back(client):
    """If client sends X-Request-ID, the same value must be returned."""
    resp = client.get("/health", headers={"X-Request-ID": "my-trace-id-123"})
    assert resp.headers.get("x-request-id") == "my-trace-id-123"
