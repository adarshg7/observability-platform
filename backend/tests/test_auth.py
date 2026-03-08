"""
test_auth.py
============
Tests for the authentication flow: register, login, lockout, token validation.
Run with: pytest tests/test_auth.py -v
"""
import pytest


# ── Registration ──────────────────────────────────────────────────────
def test_register_new_user_returns_pending(client):
    """New registrations must return 202 Accepted with 'pending' status."""
    resp = client.post("/api/auth/register", json={
        "name": "Test User", "email": "test@bank.com", "password": "Test@1234!"
    })
    assert resp.status_code == 202
    data = resp.json()
    assert data.get("status") == "pending"
    assert "token" not in data   # no token until approved


def test_register_duplicate_email_same_message(client):
    """Duplicate registration returns same message as new — no email enumeration."""
    payload = {"name": "A", "email": "dup@bank.com", "password": "Test@1234!"}
    client.post("/api/auth/register", json=payload)
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 202   # same response, not 409


# ── Login ─────────────────────────────────────────────────────────────
def test_login_pending_user_blocked(client):
    """Pending (unapproved) users must not receive a token on login."""
    client.post("/api/auth/register", json={
        "name": "Pending", "email": "pending@bank.com", "password": "Test@1234!"
    })
    resp = client.post("/api/auth/login", json={
        "email": "pending@bank.com", "password": "Test@1234!"
    })
    assert resp.status_code == 401
    assert "pending" in resp.json().get("detail", "").lower()


def test_login_invalid_credentials_generic_message(client):
    """Invalid login must return generic 'Invalid credentials', not user-not-found."""
    resp = client.post("/api/auth/login", json={
        "email": "ghost@bank.com", "password": "Wrong@999"
    })
    assert resp.status_code == 401
    assert "invalid credentials" in resp.json().get("detail", "").lower()


def test_login_rate_limit_lockout(client):
    """After 5 failed attempts, account must be locked."""
    # First get a real user (the seeded admin)
    for _ in range(6):
        client.post("/api/auth/login", json={
            "email": "admin@test.com", "password": "WrongPass!"
        })
    resp = client.post("/api/auth/login", json={
        "email": "admin@test.com", "password": "WrongPass!"
    })
    data = resp.json().get("detail", "")
    assert resp.status_code in (401, 429)
    # Should mention lockout or rate limit
    assert any(w in data.lower() for w in ["locked", "too many", "rate"])


# ── Token validation ──────────────────────────────────────────────────
def test_protected_route_without_token_returns_401(client):
    resp = client.get("/api/users/me/profile")
    assert resp.status_code == 401


def test_protected_route_with_fake_token_returns_401(client):
    resp = client.get("/api/users/me/profile",
                      headers={"Authorization": "Bearer totally.fake.jwt"})
    assert resp.status_code == 401
