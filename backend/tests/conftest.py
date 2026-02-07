import pytest
import requests
import os

BASE_URL = "https://emergent-mobile-21.preview.emergentagent.com"

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def admin_token(api_client):
    """Get admin token for authenticated requests"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@dietcafe.com",
        "password": "admin123"
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
