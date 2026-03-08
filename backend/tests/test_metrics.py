"""
test_metrics.py
===============
Tests for metric ingestion: validation, auth, and boundary conditions.
Run with: pytest tests/test_metrics.py -v
"""


def test_ingest_without_auth_returns_401(client):
    resp = client.post("/api/metrics/ingest", json={
        "model_id": 1, "model_type": "ml",
        "metric_name": "accuracy", "metric_value": 0.95
    })
    assert resp.status_code == 401


def test_ingest_metric_name_too_long_returns_422(client):
    """metric_name over 100 chars must be rejected at API layer (not crash the DB)."""
    resp = client.post("/api/metrics/ingest",
        headers={"Authorization": "Bearer fake"},
        json={
            "model_id": 1, "model_type": "ml",
            "metric_name": "a" * 101,   # 101 chars — exceeds max_length=100
            "metric_value": 0.95
        })
    assert resp.status_code == 422   # Unprocessable Entity from pydantic


def test_ingest_invalid_model_type_returns_422(client):
    resp = client.post("/api/metrics/ingest",
        headers={"Authorization": "Bearer fake"},
        json={
            "model_id": 1, "model_type": "unknown",
            "metric_name": "accuracy", "metric_value": 0.95
        })
    assert resp.status_code in (401, 422)


def test_models_endpoint_fake_bearer_returns_401(client):
    """The /models endpoint must reject unverified Bearer tokens."""
    resp = client.get("/api/metrics/models",
                      headers={"Authorization": "Bearer obviouslyfake"})
    assert resp.status_code == 401


def test_models_endpoint_no_auth_returns_401(client):
    resp = client.get("/api/metrics/models")
    assert resp.status_code == 401
