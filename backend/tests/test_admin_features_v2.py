"""
Test Admin Panel Features v2
- POST /api/upload/image accepts base64 image
- PUT /api/products/{id} accepts category_id and updates product's category
- PUT /api/products/{id} accepts fixed_price and available_servings for ready-made
- GET /api/products filters out products with inactive categories
- GET /api/admin/dashboard-stats includes low_stock_alerts array
"""
import pytest
import requests
import os
import uuid

BASE_URL = "https://mobile-menu-hub.preview.emergentagent.com"

@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def admin_token(api_client):
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@dietcafe.com",
        "password": "admin123"
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["token"]

class TestImageUpload:
    """Test POST /api/upload/image endpoint"""
    
    def test_upload_base64_image(self, api_client, admin_token):
        """POST /api/upload/image accepts base64 image and returns URL"""
        # Small 1x1 red PNG image in base64
        test_image_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
        
        api_client.headers["Authorization"] = f"Bearer {admin_token}"
        response = api_client.post(f"{BASE_URL}/api/upload/image", json={
            "image": test_image_base64
        })
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Response should contain 'url' field"
        assert "id" in data, "Response should contain 'id' field"
        print(f"✅ Image uploaded successfully, ID: {data['id']}")


class TestProductUpdate:
    """Test PUT /api/products/{id} with category_id, fixed_price, available_servings"""
    
    def test_update_product_category(self, api_client, admin_token):
        """PUT /api/products/{id} accepts category_id and updates the product's category name"""
        api_client.headers["Authorization"] = f"Bearer {admin_token}"
        
        # Get all products
        response = api_client.get(f"{BASE_URL}/api/products/all")
        assert response.status_code == 200
        products = response.json()
        assert len(products) > 0, "Need at least one product"
        
        # Get all categories
        response = api_client.get(f"{BASE_URL}/api/categories/all")
        assert response.status_code == 200
        categories = response.json()
        assert len(categories) > 0, "Need at least one category"
        
        # Pick a product and a different category
        product = products[0]
        original_category = product.get("category", "")
        
        # Find a different category
        new_category = None
        for cat in categories:
            if cat.get("name") != original_category and cat.get("is_active") != False:
                new_category = cat
                break
        
        if not new_category:
            pytest.skip("Need at least two categories to test category change")
        
        # Update product with new category_id
        response = api_client.put(f"{BASE_URL}/api/products/{product['id']}", json={
            "category_id": new_category["id"]
        })
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        updated = response.json()
        assert updated["category"] == new_category["name"], f"Category should be '{new_category['name']}', got '{updated.get('category')}'"
        print(f"✅ Product category changed from '{original_category}' to '{updated['category']}'")
        
        # Revert the change
        original_cat = next((c for c in categories if c.get("name") == original_category), None)
        if original_cat:
            api_client.put(f"{BASE_URL}/api/products/{product['id']}", json={
                "category_id": original_cat["id"]
            })
    
    def test_update_ready_made_fixed_price(self, api_client, admin_token):
        """PUT /api/products/{id} accepts fixed_price for ready-made meals"""
        api_client.headers["Authorization"] = f"Bearer {admin_token}"
        
        # Get all products and find a ready-made one
        response = api_client.get(f"{BASE_URL}/api/products/all")
        assert response.status_code == 200
        products = response.json()
        
        ready_made = next((p for p in products if p.get("product_type") == "ready_made"), None)
        if not ready_made:
            pytest.skip("No ready-made meal to test")
        
        original_price = ready_made.get("fixed_price", 200)
        new_price = original_price + 10
        
        # Update price
        response = api_client.put(f"{BASE_URL}/api/products/{ready_made['id']}", json={
            "fixed_price": new_price
        })
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        updated = response.json()
        assert updated.get("fixed_price") == new_price, f"fixed_price should be {new_price}"
        print(f"✅ Ready-made meal fixed_price updated from ₹{original_price} to ₹{new_price}")
        
        # Revert
        api_client.put(f"{BASE_URL}/api/products/{ready_made['id']}", json={
            "fixed_price": original_price
        })
    
    def test_update_ready_made_servings(self, api_client, admin_token):
        """PUT /api/products/{id} accepts available_servings for ready-made meals"""
        api_client.headers["Authorization"] = f"Bearer {admin_token}"
        
        # Get all products and find a ready-made one
        response = api_client.get(f"{BASE_URL}/api/products/all")
        assert response.status_code == 200
        products = response.json()
        
        ready_made = next((p for p in products if p.get("product_type") == "ready_made"), None)
        if not ready_made:
            pytest.skip("No ready-made meal to test")
        
        original_servings = ready_made.get("available_servings", 20)
        new_servings = original_servings + 5
        
        # Update servings
        response = api_client.put(f"{BASE_URL}/api/products/{ready_made['id']}", json={
            "available_servings": new_servings
        })
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        updated = response.json()
        assert updated.get("available_servings") == new_servings, f"available_servings should be {new_servings}"
        print(f"✅ Ready-made meal available_servings updated from {original_servings} to {new_servings}")
        
        # Revert
        api_client.put(f"{BASE_URL}/api/products/{ready_made['id']}", json={
            "available_servings": original_servings
        })
    
    def test_update_ready_made_editable_toggle(self, api_client, admin_token):
        """PUT /api/products/{id} accepts is_editable for ready-made meals"""
        api_client.headers["Authorization"] = f"Bearer {admin_token}"
        
        # Get all products and find a ready-made one
        response = api_client.get(f"{BASE_URL}/api/products/all")
        assert response.status_code == 200
        products = response.json()
        
        ready_made = next((p for p in products if p.get("product_type") == "ready_made"), None)
        if not ready_made:
            pytest.skip("No ready-made meal to test")
        
        original_editable = ready_made.get("is_editable", False)
        new_editable = not original_editable
        
        # Update editable toggle
        response = api_client.put(f"{BASE_URL}/api/products/{ready_made['id']}", json={
            "is_editable": new_editable
        })
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        updated = response.json()
        assert updated.get("is_editable") == new_editable, f"is_editable should be {new_editable}"
        print(f"✅ Ready-made meal is_editable toggled from {original_editable} to {new_editable}")
        
        # Revert
        api_client.put(f"{BASE_URL}/api/products/{ready_made['id']}", json={
            "is_editable": original_editable
        })


class TestInactiveCategories:
    """Test GET /api/products filters out products with inactive categories"""
    
    def test_products_filter_inactive_categories(self, api_client, admin_token):
        """GET /api/products (public) should not include products from inactive categories"""
        api_client.headers["Authorization"] = f"Bearer {admin_token}"
        
        # Get all categories
        response = api_client.get(f"{BASE_URL}/api/categories/all")
        assert response.status_code == 200
        categories = response.json()
        
        # Find an active category with products
        active_category = next((c for c in categories if c.get("is_active") != False), None)
        if not active_category:
            pytest.skip("No active category found")
        
        # Get public products (should filter by active categories)
        response = api_client.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        public_products = response.json()
        
        # Get all products (admin view)
        response = api_client.get(f"{BASE_URL}/api/products/all")
        assert response.status_code == 200
        all_products = response.json()
        
        # Check if there are inactive categories
        inactive_categories = [c["name"] for c in categories if c.get("is_active") == False]
        
        if inactive_categories:
            # Verify public endpoint doesn't show products from inactive categories
            for product in public_products:
                assert product.get("category") not in inactive_categories, \
                    f"Product '{product['name']}' from inactive category '{product.get('category')}' should not appear in public list"
            print(f"✅ Public products correctly exclude products from inactive categories: {inactive_categories}")
        else:
            print("✅ All categories are active, filter test passed by default")


class TestDashboardLowStock:
    """Test GET /api/admin/dashboard-stats includes low_stock_alerts"""
    
    def test_dashboard_has_low_stock_alerts(self, api_client, admin_token):
        """GET /api/admin/dashboard-stats includes low_stock_alerts array"""
        api_client.headers["Authorization"] = f"Bearer {admin_token}"
        
        response = api_client.get(f"{BASE_URL}/api/admin/dashboard-stats")
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        
        stats = response.json()
        assert "low_stock_alerts" in stats, "Dashboard should include 'low_stock_alerts' field"
        assert isinstance(stats["low_stock_alerts"], list), "low_stock_alerts should be a list"
        
        print(f"✅ Dashboard stats includes low_stock_alerts with {len(stats['low_stock_alerts'])} items")
        
        # Verify structure of low stock items
        for item in stats["low_stock_alerts"]:
            assert "id" in item, "Low stock item should have 'id'"
            assert "name" in item, "Low stock item should have 'name'"
            assert "available_qty_grams" in item, "Low stock item should have 'available_qty_grams'"
            assert item["available_qty_grams"] <= 500, f"Low stock items should have <= 500g, got {item['available_qty_grams']}"
            print(f"   - {item['name']}: {item['available_qty_grams']}g (LOW STOCK)")
    
    def test_egg_product_in_low_stock(self, api_client, admin_token):
        """Verify the Egg product with ~100g stock appears in low_stock_alerts"""
        api_client.headers["Authorization"] = f"Bearer {admin_token}"
        
        # First check if Egg product exists with low stock
        response = api_client.get(f"{BASE_URL}/api/products/all")
        assert response.status_code == 200
        products = response.json()
        
        egg_product = next((p for p in products if "egg" in p.get("name", "").lower() and p.get("product_type") != "ready_made"), None)
        
        if not egg_product:
            pytest.skip("No Egg product found")
        
        if egg_product.get("available_qty_grams", 1000) > 500:
            pytest.skip(f"Egg product has {egg_product.get('available_qty_grams')}g (not low stock)")
        
        # Now check dashboard
        response = api_client.get(f"{BASE_URL}/api/admin/dashboard-stats")
        assert response.status_code == 200
        stats = response.json()
        
        low_stock_names = [item["name"].lower() for item in stats.get("low_stock_alerts", [])]
        assert "egg" in low_stock_names or any("egg" in name for name in low_stock_names), \
            f"Egg product with {egg_product.get('available_qty_grams')}g should appear in low_stock_alerts"
        
        print(f"✅ Egg product with {egg_product.get('available_qty_grams')}g correctly appears in low_stock_alerts")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
