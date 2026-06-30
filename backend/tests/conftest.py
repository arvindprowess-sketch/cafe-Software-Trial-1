import pytest
import requests
import os

BASE_URL = "https://meal-fit-goals.preview.emergentagent.com"

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def admin_token(api_client):
    """Get a super-admin token for authenticated requests.

    Auth V2 retired the fixed admin@dietcafe.com/admin123 credentials — the
    bootstrap super-admin gets a random one-time password. Supply real creds via
    SMOKE_ADMIN_CODE + SMOKE_ADMIN_PASSWORD env vars to exercise admin paths;
    without them the fixture returns None and admin-only tests skip cleanly."""
    code = os.environ.get("SMOKE_ADMIN_CODE")
    password = os.environ.get("SMOKE_ADMIN_PASSWORD")
    if not code or not password:
        return None
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "code": code,
        "password": password,
    })
    if response.status_code == 200:
        return response.json()["token"]
    return None

@pytest.fixture
def customer_token(api_client):
    """Create and get customer token"""
    import uuid
    email = f"TEST_customer_{uuid.uuid4().hex[:8]}@test.com"
    response = api_client.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": "test123",
        "name": "Test Customer",
        "role": "customer"
    })
    if response.status_code == 200:
        return response.json()["token"]
    return None
