"""Tests for GET /api/products/top-selling-by-category (Phase 3A)."""
import os
from collections import Counter
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://meal-fit-goals.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@dietcafe.com"
ADMIN_PASS = "admin123"
REQUIRED_FIELDS = ["name", "category", "sales_count", "image_url", "cost_per_100g"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_requires_auth():
    r = requests.get(f"{BASE_URL}/api/products/top-selling-by-category", timeout=15)
    assert r.status_code in (401, 403)


def test_returns_list(admin_token):
    r = requests.get(
        f"{BASE_URL}/api/products/top-selling-by-category",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_at_most_5_per_category(admin_token):
    r = requests.get(
        f"{BASE_URL}/api/products/top-selling-by-category",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    data = r.json()
    cats = Counter(p["category"] for p in data)
    assert max(cats.values()) <= 5, f"Some category exceeded 5: {cats}"


def test_required_fields_present(admin_token):
    r = requests.get(
        f"{BASE_URL}/api/products/top-selling-by-category",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    data = r.json()
    for p in data:
        for f in REQUIRED_FIELDS:
            assert f in p, f"Missing field {f} in product {p.get('name')}"


def test_sorted_by_sales_then_rating(admin_token):
    """Within each category, items should be ordered by sales_count desc (rating fallback)."""
    r = requests.get(
        f"{BASE_URL}/api/products/top-selling-by-category",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    data = r.json()
    groups = {}
    for p in data:
        groups.setdefault(p["category"], []).append(p)
    for cat, items in groups.items():
        sales = [i.get("sales_count", 0) for i in items]
        assert sales == sorted(sales, reverse=True), f"{cat} not sorted by sales desc: {sales}"
