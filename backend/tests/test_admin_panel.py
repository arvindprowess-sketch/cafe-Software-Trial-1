"""
Test Admin Panel Overhaul - Dashboard stats, Staff PIN reset, Categories CRUD, Products filtering
Tests for Diet Cafe Admin panel features.
"""
import pytest
import requests
import os
from datetime import datetime, timezone

BASE_URL = "https://meal-fit-goals.preview.emergentagent.com"

# Admin credentials — Auth V2: code+password supplied via env (no fixed creds).
ADMIN_CODE = os.environ.get("SMOKE_ADMIN_CODE")
ADMIN_PASSWORD = os.environ.get("SMOKE_ADMIN_PASSWORD")


class TestAdminAuthentication:
    """Admin login via code/password (Auth V2)."""

    def test_admin_login_success(self):
        """Super-admin can sign in with code+password."""
        if not ADMIN_CODE or not ADMIN_PASSWORD:
            pytest.skip("Set SMOKE_ADMIN_CODE + SMOKE_ADMIN_PASSWORD")
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "code": ADMIN_CODE,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert data["user"]["role"] == "super_admin", "User role is not super_admin"
        print(f"✅ Admin login successful: {data['user']['name']}")


@pytest.fixture(scope="module")
def admin_token():
    """Get a super-admin token for authenticated requests (Auth V2)."""
    if not ADMIN_CODE or not ADMIN_PASSWORD:
        pytest.skip("Set SMOKE_ADMIN_CODE + SMOKE_ADMIN_PASSWORD")
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "code": ADMIN_CODE,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.text}")
    return response.json()["token"]


@pytest.fixture
def admin_headers(admin_token):
    """Headers with admin auth token"""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}"
    }


class TestAdminDashboardStats:
    """Tests for GET /api/admin/dashboard-stats"""
    
    def test_dashboard_stats_returns_all_fields(self, admin_headers):
        """Dashboard stats returns products, categories, today_orders, revenue, pending_orders, low_stock_alerts"""
        response = requests.get(f"{BASE_URL}/api/admin/dashboard-stats", headers=admin_headers)
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        data = response.json()
        
        # Verify all required fields exist
        required_fields = ["products", "categories", "today_orders", "revenue", "pending_orders", "low_stock_alerts"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        # Verify types
        assert isinstance(data["products"], int), "products should be int"
        assert isinstance(data["categories"], int), "categories should be int"
        assert isinstance(data["today_orders"], int), "today_orders should be int"
        assert isinstance(data["revenue"], (int, float)), "revenue should be numeric"
        assert isinstance(data["pending_orders"], int), "pending_orders should be int"
        assert isinstance(data["low_stock_alerts"], list), "low_stock_alerts should be list"
        
        print(f"✅ Dashboard stats: {data['products']} products, {data['categories']} categories, ₹{data['revenue']} revenue")
    
    def test_dashboard_stats_requires_auth(self):
        """Dashboard stats requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/dashboard-stats")
        assert response.status_code == 403, "Should require auth"


class TestAdminStaffAccounts:
    """Tests for GET /api/admin/staff-accounts and PUT /api/admin/staff/{id}/reset-password"""
    
    def test_staff_accounts_returns_kitchen_cashier(self, admin_headers):
        """Staff accounts returns kitchen and cashier users"""
        response = requests.get(f"{BASE_URL}/api/admin/staff-accounts", headers=admin_headers)
        assert response.status_code == 200, f"Staff accounts failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Staff accounts should be a list"
        
        # Check that staff have expected roles
        roles = {s.get("role") for s in data}
        print(f"✅ Staff accounts: {len(data)} staff, roles: {roles}")
        
        # Should have kitchen and/or cashier
        if len(data) > 0:
            assert any(r in roles for r in ["kitchen", "cashier"]), "Should have kitchen or cashier roles"
    
    def test_staff_accounts_requires_auth(self):
        """Staff accounts requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/staff-accounts")
        assert response.status_code == 403, "Should require auth"
    
    def test_reset_password_success(self, admin_headers):
        """Admin can reset a staff member's password (Auth V2)."""
        # First get staff list
        staff_response = requests.get(f"{BASE_URL}/api/admin/staff-accounts", headers=admin_headers)
        if staff_response.status_code != 200:
            pytest.skip("Could not get staff list")

        staff = staff_response.json()
        if len(staff) == 0:
            pytest.skip("No staff accounts to test password reset")

        staff_id = staff[0]["id"]

        # Reset password to a test value (>= 8 chars)
        response = requests.put(
            f"{BASE_URL}/api/admin/staff/{staff_id}/reset-password",
            headers=admin_headers,
            json={"password": "newpassword1"}
        )
        assert response.status_code == 200, f"Password reset failed: {response.text}"
        print(f"✅ Password reset successful for staff {staff[0].get('name', staff_id)}")

    def test_reset_password_validation(self, admin_headers):
        """Password reset rejects passwords shorter than 8 chars."""
        staff_response = requests.get(f"{BASE_URL}/api/admin/staff-accounts", headers=admin_headers)
        if staff_response.status_code != 200 or len(staff_response.json()) == 0:
            pytest.skip("No staff accounts")

        staff_id = staff_response.json()[0]["id"]

        response = requests.put(
            f"{BASE_URL}/api/admin/staff/{staff_id}/reset-password",
            headers=admin_headers,
            json={"password": "short"}  # < 8 chars
        )
        assert response.status_code == 400, "Should reject short password"
        print("✅ Password validation rejects short password")


class TestCategoriesCRUD:
    """Tests for categories CRUD: GET /api/categories, GET /api/categories/all, POST, PUT"""
    
    def test_get_active_categories_public(self):
        """GET /api/categories returns only active categories (no auth required)"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200, f"Categories failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Categories should be a list"
        # All returned should be active
        for cat in data:
            assert cat.get("is_active") != False, f"Category {cat.get('name')} should be active"
        
        print(f"✅ GET /api/categories: {len(data)} active categories")
    
    def test_get_all_categories_admin(self, admin_headers):
        """GET /api/categories/all returns all categories including inactive (admin only)"""
        response = requests.get(f"{BASE_URL}/api/categories/all", headers=admin_headers)
        assert response.status_code == 200, f"Categories all failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Categories should be a list"
        print(f"✅ GET /api/categories/all: {len(data)} total categories")
    
    def test_get_all_categories_requires_admin(self):
        """GET /api/categories/all requires admin auth"""
        response = requests.get(f"{BASE_URL}/api/categories/all")
        assert response.status_code == 403, "Should require admin auth"
    
    def test_create_category_with_font_style(self, admin_headers):
        """POST /api/categories creates category with font_style field"""
        test_cat = {
            "name": f"TEST_Category_{datetime.now(timezone.utc).timestamp()}",
            "icon": "flame",
            "color": "#FF6B6B",
            "sort_order": 99,
            "font_style": "bold",
            "description": "Test category for admin panel"
        }
        
        response = requests.post(f"{BASE_URL}/api/categories", headers=admin_headers, json=test_cat)
        assert response.status_code == 200, f"Create category failed: {response.text}"
        data = response.json()
        
        assert data["name"] == test_cat["name"], "Name mismatch"
        assert data["font_style"] == "bold", "font_style not saved"
        assert data["icon"] == "flame", "icon not saved"
        assert data["color"] == "#FF6B6B", "color not saved"
        assert data.get("is_active") == True, "Should be active by default"
        
        # Cleanup - deactivate/delete the test category
        cat_id = data["id"]
        requests.delete(f"{BASE_URL}/api/categories/{cat_id}", headers=admin_headers)
        
        print(f"✅ Create category with font_style: {test_cat['name']}")
        return cat_id
    
    def test_update_category_is_active_toggle(self, admin_headers):
        """PUT /api/categories/{id} can toggle is_active"""
        # First create a test category
        test_cat = {
            "name": f"TEST_Toggle_{datetime.now(timezone.utc).timestamp()}",
            "icon": "leaf",
            "color": "#4CAF50",
            "font_style": "default"
        }
        create_response = requests.post(f"{BASE_URL}/api/categories", headers=admin_headers, json=test_cat)
        if create_response.status_code != 200:
            pytest.skip("Could not create test category")
        
        cat_id = create_response.json()["id"]
        
        try:
            # Deactivate
            response = requests.put(
                f"{BASE_URL}/api/categories/{cat_id}",
                headers=admin_headers,
                json={"is_active": False}
            )
            assert response.status_code == 200, f"Deactivate failed: {response.text}"
            assert response.json()["is_active"] == False, "is_active should be False"
            
            # Re-activate
            response = requests.put(
                f"{BASE_URL}/api/categories/{cat_id}",
                headers=admin_headers,
                json={"is_active": True}
            )
            assert response.status_code == 200, "Reactivate failed"
            assert response.json()["is_active"] == True, "is_active should be True"
            
            print(f"✅ Category is_active toggle works")
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/categories/{cat_id}", headers=admin_headers)


class TestProductsFiltering:
    """Tests for products filtering: inactive categories should hide products"""
    
    def test_products_endpoint_filters_inactive_categories(self, admin_headers):
        """GET /api/products filters out products whose category is inactive"""
        # Get all categories including inactive
        cats_response = requests.get(f"{BASE_URL}/api/categories/all", headers=admin_headers)
        if cats_response.status_code != 200:
            pytest.skip("Could not get categories")
        
        cats = cats_response.json()
        active_cat_names = {c["name"] for c in cats if c.get("is_active") != False}
        
        # Get public products
        products_response = requests.get(f"{BASE_URL}/api/products")
        assert products_response.status_code == 200, f"Products failed: {products_response.text}"
        products = products_response.json()
        
        # All products should have category in active categories (or empty category)
        for p in products:
            cat = p.get("category", "")
            if cat:
                assert cat in active_cat_names, f"Product {p['name']} has inactive category {cat}"
        
        print(f"✅ Products filtering: {len(products)} products, all in active categories")
    
    def test_products_all_requires_admin(self):
        """GET /api/products/all requires admin auth"""
        response = requests.get(f"{BASE_URL}/api/products/all")
        assert response.status_code == 403, "Should require admin auth"
    
    def test_products_all_returns_all(self, admin_headers):
        """GET /api/products/all returns all products for admin"""
        response = requests.get(f"{BASE_URL}/api/products/all", headers=admin_headers)
        assert response.status_code == 200, f"Products all failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Products should be a list"
        print(f"✅ GET /api/products/all: {len(data)} total products")


class TestStaffPINLoginRetired:
    """Auth V2: staff PIN login is retired (HTTP 410)."""

    def test_kitchen_pin_login_retired(self):
        response = requests.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "1234"})
        assert response.status_code == 410, f"Expected 410, got {response.status_code}"
        print("✅ Kitchen PIN login retired (410)")

    def test_cashier_pin_login_retired(self):
        response = requests.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "5678"})
        assert response.status_code == 410, f"Expected 410, got {response.status_code}"
        print("✅ Cashier PIN login retired (410)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
