"""Backend API tests for Auth, Products, Orders, AI, and User endpoints"""
import pytest
import requests
import os
import uuid

BASE_URL = "https://diet-expo-mobile.preview.emergentagent.com"

class TestAuth:
    """Authentication endpoint tests"""

    def test_admin_login_success(self, api_client):
        """Test admin login with demo credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@dietcafe.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["role"] == "admin", "Role is not admin"
        assert data["user"]["email"] == "admin@dietcafe.com"
        print("✓ Admin login successful")

    def test_login_invalid_credentials(self, api_client):
        """Test login with invalid credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@dietcafe.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, "Should return 401 for invalid credentials"
        print("✓ Invalid login returns 401")

    def test_customer_register_and_verify(self, api_client):
        """Test customer registration and verify data persistence"""
        email = f"TEST_customer_{uuid.uuid4().hex[:8]}@test.com"
        register_response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": "test123",
            "name": "Test Customer",
            "role": "customer"
        })
        assert register_response.status_code == 200, f"Registration failed: {register_response.text}"
        data = register_response.json()
        assert "token" in data
        assert data["user"]["role"] == "customer"
        assert data["user"]["email"] == email
        token = data["token"]
        
        # Verify by logging in
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": "test123"
        })
        assert login_response.status_code == 200, "Login failed after registration"
        print(f"✓ Customer registration and login successful: {email}")

    def test_duplicate_email_registration(self, api_client):
        """Test registration with duplicate email"""
        response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": "admin@dietcafe.com",
            "password": "test123",
            "name": "Duplicate",
            "role": "customer"
        })
        assert response.status_code == 400, "Should return 400 for duplicate email"
        print("✓ Duplicate email registration blocked")

    def test_auth_me_endpoint(self, api_client, admin_token):
        """Test /auth/me endpoint"""
        if not admin_token:
            pytest.skip("Admin token not available")
        response = api_client.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "admin@dietcafe.com"
        assert data["role"] == "admin"
        print("✓ /auth/me endpoint working")


class TestProducts:
    """Product CRUD endpoint tests"""

    def test_list_products(self, api_client):
        """Test GET /products (public endpoint)"""
        response = api_client.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        products = response.json()
        assert isinstance(products, list)
        assert len(products) > 0, "No products found"
        # Verify product structure
        product = products[0]
        required_fields = ['id', 'name', 'cost_per_100g', 'category', 'calories_per_100g', 
                          'protein_per_100g', 'carbs_per_100g', 'fat_per_100g', 'is_active']
        for field in required_fields:
            assert field in product, f"Missing field: {field}"
        print(f"✓ Listed {len(products)} products")

    def test_create_product_and_verify(self, api_client, admin_token):
        """Test POST /products and verify persistence"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        product_data = {
            "name": f"TEST_Product_{uuid.uuid4().hex[:6]}",
            "cost_per_100g": 50,
            "available_qty_grams": 5000
        }
        
        # Create product
        create_response = api_client.post(f"{BASE_URL}/api/products", 
            json=product_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        created = create_response.json()
        assert created["name"] == product_data["name"]
        assert created["cost_per_100g"] == product_data["cost_per_100g"]
        assert "calories_per_100g" in created, "Nutrition not auto-detected"
        product_id = created["id"]
        
        # Verify by listing all products (admin endpoint)
        list_response = api_client.get(f"{BASE_URL}/api/products/all",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert list_response.status_code == 200
        all_products = list_response.json()
        found = any(p["id"] == product_id for p in all_products)
        assert found, "Product not found in list after creation"
        print(f"✓ Product created and verified: {product_data['name']}")

    def test_create_product_requires_admin(self, api_client, customer_token):
        """Test that only admins can create products"""
        if not customer_token:
            pytest.skip("Customer token not available")
        
        response = api_client.post(f"{BASE_URL}/api/products",
            json={"name": "Test", "cost_per_100g": 10},
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert response.status_code == 403, "Should return 403 for non-admin"
        print("✓ Product creation restricted to admin")

    def test_update_product(self, api_client, admin_token):
        """Test PUT /products/{id}"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        # Get first product
        list_response = api_client.get(f"{BASE_URL}/api/products")
        products = list_response.json()
        if not products:
            pytest.skip("No products available")
        
        product_id = products[0]["id"]
        new_price = 999
        
        update_response = api_client.put(f"{BASE_URL}/api/products/{product_id}",
            json={"cost_per_100g": new_price},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["cost_per_100g"] == new_price
        print(f"✓ Product updated: {product_id}")


class TestOrders:
    """Order endpoint tests"""

    def test_create_order_and_verify(self, api_client, customer_token):
        """Test POST /orders and verify order creation"""
        if not customer_token:
            pytest.skip("Customer token not available")
        
        # Get available products
        products_response = api_client.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        grams = 100
        factor = grams / 100
        
        order_data = {
            "order_type": "dine-in",
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "grams": grams,
                "price": factor * product["cost_per_100g"],
                "calories": factor * product["calories_per_100g"],
                "protein": factor * product["protein_per_100g"],
                "carbs": factor * product["carbs_per_100g"],
                "fat": factor * product["fat_per_100g"]
            }],
            "total_price": factor * product["cost_per_100g"],
            "total_calories": factor * product["calories_per_100g"],
            "total_protein": factor * product["protein_per_100g"],
            "total_carbs": factor * product["carbs_per_100g"],
            "total_fat": factor * product["fat_per_100g"],
            "fitness_goal": "maintenance"
        }
        
        # Create order
        create_response = api_client.post(f"{BASE_URL}/api/orders",
            json=order_data,
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert create_response.status_code == 200, f"Order creation failed: {create_response.text}"
        created_order = create_response.json()
        assert "id" in created_order
        assert created_order["status"] == "pending"
        order_id = created_order["id"]
        
        # Verify order in list
        list_response = api_client.get(f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert list_response.status_code == 200
        orders = list_response.json()
        found = any(o["id"] == order_id for o in orders)
        assert found, "Order not found in list after creation"
        print(f"✓ Order created and verified: {order_id}")

    def test_list_orders_customer(self, api_client, customer_token):
        """Test GET /orders (customer endpoint)"""
        if not customer_token:
            pytest.skip("Customer token not available")
        
        response = api_client.get(f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert response.status_code == 200
        orders = response.json()
        assert isinstance(orders, list)
        print(f"✓ Listed {len(orders)} customer orders")

    def test_kitchen_orders_admin_only(self, api_client, admin_token, customer_token):
        """Test GET /orders/kitchen (admin only)"""
        if not admin_token or not customer_token:
            pytest.skip("Tokens not available")
        
        # Admin should succeed
        admin_response = api_client.get(f"{BASE_URL}/api/orders/kitchen",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert admin_response.status_code == 200
        print(f"✓ Admin can access kitchen orders")
        
        # Customer should fail
        customer_response = api_client.get(f"{BASE_URL}/api/orders/kitchen",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert customer_response.status_code == 403
        print("✓ Customer blocked from kitchen orders")

    def test_update_order_status(self, api_client, admin_token):
        """Test PUT /orders/{id}/status"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        # Get kitchen orders
        kitchen_response = api_client.get(f"{BASE_URL}/api/orders/kitchen",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if kitchen_response.status_code != 200:
            pytest.skip("Cannot get kitchen orders")
        
        orders = kitchen_response.json()
        if not orders:
            pytest.skip("No pending orders")
        
        order_id = orders[0]["id"]
        
        # Update status
        update_response = api_client.put(
            f"{BASE_URL}/api/orders/{order_id}/status?status=preparing",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["status"] == "preparing"
        print(f"✓ Order status updated: {order_id} -> preparing")


class TestUserNutrition:
    """User goals and nutrition summary tests"""

    def test_nutrition_summary(self, api_client, customer_token):
        """Test GET /user/nutrition-summary"""
        if not customer_token:
            pytest.skip("Customer token not available")
        
        response = api_client.get(f"{BASE_URL}/api/user/nutrition-summary",
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "consumed" in data
        assert "goals" in data
        assert "date" in data
        print("✓ Nutrition summary endpoint working")

    def test_update_goals(self, api_client, customer_token):
        """Test PUT /user/goals"""
        if not customer_token:
            pytest.skip("Customer token not available")
        
        goals_data = {
            "fitness_goal": "fat_loss",
            "daily_calories": 1800,
            "daily_protein": 120,
            "daily_carbs": 150,
            "daily_fat": 50
        }
        
        response = api_client.put(f"{BASE_URL}/api/user/goals",
            json=goals_data,
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["fitness_goal"] == "fat_loss"
        assert data["daily_calories"] == 1800
        print("✓ User goals updated successfully")


class TestAI:
    """AI suggestion endpoint tests"""

    def test_ai_suggest_endpoint(self, api_client, customer_token):
        """Test POST /ai/suggest"""
        if not customer_token:
            pytest.skip("Customer token not available")
        
        suggest_data = {
            "goal": "fat_loss",
            "budget": 200,
            "selected_items": [],
            "current_nutrition": {
                "calories": 0,
                "protein": 0,
                "carbs": 0,
                "fat": 0,
                "price": 0
            }
        }
        
        response = api_client.post(f"{BASE_URL}/api/ai/suggest",
            json=suggest_data,
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        assert response.status_code == 200, f"AI suggest failed: {response.text}"
        data = response.json()
        assert "suggestions" in data or "summary" in data
        print("✓ AI suggest endpoint responding (may have suggestions or fallback message)")


class TestBanners:
    """Banner endpoint tests for Zomato-style UI"""

    def test_get_banners(self, api_client):
        """Test GET /banners endpoint (public)"""
        response = api_client.get(f"{BASE_URL}/api/banners")
        assert response.status_code == 200, f"Banners endpoint failed: {response.text}"
        banners = response.json()
        assert isinstance(banners, list), "Banners should be a list"
        assert len(banners) > 0, "Should have at least one banner"
        
        # Verify banner structure
        banner = banners[0]
        required_fields = ['id', 'title', 'subtitle', 'color']
        for field in required_fields:
            assert field in banner, f"Missing field in banner: {field}"
        
        print(f"✓ Banners endpoint working, returned {len(banners)} banners")


class TestZomatoStyleProducts:
    """Test new Zomato-style product fields (image_url, description, rating)"""

    def test_products_have_zomato_fields(self, api_client):
        """Test that products have new Zomato-style fields"""
        response = api_client.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        products = response.json()
        assert len(products) > 0, "No products found"
        
        # Check for new fields
        product = products[0]
        zomato_fields = ['image_url', 'description', 'rating']
        for field in zomato_fields:
            assert field in product, f"Missing Zomato-style field: {field}"
        
        # Verify data types
        assert isinstance(product.get('rating'), (int, float)), "Rating should be numeric"
        print(f"✓ Products have Zomato-style fields (image_url, description, rating)")
