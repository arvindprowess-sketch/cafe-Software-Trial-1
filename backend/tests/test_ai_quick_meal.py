"""
Test AI Quick Meal Builder - Hybrid Approach
Tests the /api/ai/quick-meal endpoint which uses:
- AI to pick items + budget share percentages
- System to calculate exact grams based on budget and available stock
"""
import pytest
import requests
import os
import time

BASE_URL = "https://demo-check.preview.emergentagent.com"

# Test fixtures
@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def cashier_token(api_client):
    """Get cashier token via PIN login"""
    response = api_client.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "5678"})
    assert response.status_code == 200, f"Cashier PIN login failed: {response.text}"
    return response.json()["token"]

@pytest.fixture(scope="module")
def kitchen_token(api_client):
    """Get kitchen token via PIN login"""
    response = api_client.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "1234"})
    assert response.status_code == 200, f"Kitchen PIN login failed: {response.text}"
    return response.json()["token"]


class TestPINLogin:
    """Test PIN-based authentication for Cashier and Kitchen"""
    
    def test_cashier_pin_login(self, api_client):
        """Kitchen login with PIN 1234 should work"""
        response = api_client.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "5678"})
        assert response.status_code == 200, f"Cashier PIN login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token missing from response"
        assert data["user"]["role"] == "cashier", f"Expected cashier role, got {data['user']['role']}"
        print(f"✅ Cashier PIN login successful - user: {data['user']['name']}")
    
    def test_kitchen_pin_login(self, api_client):
        """Kitchen login with PIN 1234 should work"""
        response = api_client.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "1234"})
        assert response.status_code == 200, f"Kitchen PIN login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token missing from response"
        assert data["user"]["role"] == "kitchen", f"Expected kitchen role, got {data['user']['role']}"
        print(f"✅ Kitchen PIN login successful - user: {data['user']['name']}")


class TestAIQuickMealBudgetAccuracy:
    """Test that AI quick meal returns total within ₹1 of budget"""
    
    def test_budget_200_fat_loss(self, api_client, cashier_token):
        """POST /api/ai/quick-meal with budget=200, goal=fat_loss returns total within ₹1 of budget"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/quick-meal",
            json={
                "diet_preference": "both",
                "goal": "fat_loss",
                "budget": 200,
                "order_type": "dine-in"
            },
            headers={"Authorization": f"Bearer {cashier_token}"},
            timeout=60  # AI calls take time
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Check structure
        assert "meal_items" in data, "meal_items missing"
        assert "totals" in data, "totals missing"
        assert len(data["meal_items"]) > 0, "No meal items returned"
        
        # Check budget accuracy - should be within ₹1 of budget
        total_price = data["totals"].get("price", 0)
        budget = 200
        budget_diff = abs(total_price - budget)
        
        print(f"Budget: ₹{budget}, Total: ₹{total_price}, Diff: ₹{budget_diff}")
        assert budget_diff <= 1, f"Total ₹{total_price} is not within ₹1 of budget ₹{budget} (diff: ₹{budget_diff})"
        print(f"✅ Budget accuracy test passed - ₹{total_price} within ₹1 of ₹{budget}")
    
    def test_budget_300_muscle_gain_veg(self, api_client, cashier_token):
        """POST /api/ai/quick-meal with budget=300, goal=muscle_gain, veg returns total within ₹1 of budget"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/quick-meal",
            json={
                "diet_preference": "veg",
                "goal": "muscle_gain",
                "budget": 300,
                "order_type": "dine-in"
            },
            headers={"Authorization": f"Bearer {cashier_token}"},
            timeout=60
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        assert "meal_items" in data, "meal_items missing"
        assert len(data["meal_items"]) > 0, "No meal items returned"
        
        # Verify all items are veg
        for item in data["meal_items"]:
            assert item.get("diet_type") == "veg", f"Non-veg item in veg meal: {item['product_name']}"
        
        # Check budget accuracy
        total_price = data["totals"].get("price", 0)
        budget = 300
        budget_diff = abs(total_price - budget)
        
        print(f"Budget: ₹{budget}, Total: ₹{total_price}, Diff: ₹{budget_diff}")
        assert budget_diff <= 1, f"Total ₹{total_price} is not within ₹1 of budget ₹{budget} (diff: ₹{budget_diff})"
        print(f"✅ Budget accuracy test (veg muscle_gain) passed - ₹{total_price} within ₹1 of ₹{budget}")
    
    def test_budget_150_maintenance(self, api_client, cashier_token):
        """POST /api/ai/quick-meal with budget=150, goal=maintenance returns total within ₹1 of budget"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/quick-meal",
            json={
                "diet_preference": "both",
                "goal": "maintenance",
                "budget": 150,
                "order_type": "dine-in"
            },
            headers={"Authorization": f"Bearer {cashier_token}"},
            timeout=60
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        assert "meal_items" in data, "meal_items missing"
        assert len(data["meal_items"]) > 0, "No meal items returned"
        
        # Check budget accuracy
        total_price = data["totals"].get("price", 0)
        budget = 150
        budget_diff = abs(total_price - budget)
        
        print(f"Budget: ₹{budget}, Total: ₹{total_price}, Diff: ₹{budget_diff}")
        assert budget_diff <= 1, f"Total ₹{total_price} is not within ₹1 of budget ₹{budget} (diff: ₹{budget_diff})"
        print(f"✅ Budget accuracy test (maintenance) passed - ₹{total_price} within ₹1 of ₹{budget}")


class TestAIQuickMealStockLimits:
    """Test that AI quick meal respects available stock"""
    
    def test_returns_max_stock_field(self, api_client, cashier_token):
        """POST /api/ai/quick-meal returns items with max_stock field showing available stock"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/quick-meal",
            json={
                "diet_preference": "both",
                "goal": "fat_loss",
                "budget": 200,
                "order_type": "dine-in"
            },
            headers={"Authorization": f"Bearer {cashier_token}"},
            timeout=60
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        assert len(data["meal_items"]) > 0, "No meal items returned"
        
        for item in data["meal_items"]:
            assert "max_stock" in item, f"max_stock field missing for {item['product_name']}"
            assert isinstance(item["max_stock"], int), f"max_stock should be int for {item['product_name']}"
            assert item["max_stock"] > 0, f"max_stock should be positive for {item['product_name']}"
            print(f"  {item['product_name']}: max_stock={item['max_stock']}g")
        
        print(f"✅ All {len(data['meal_items'])} items have max_stock field")
    
    def test_grams_do_not_exceed_stock(self, api_client, cashier_token):
        """POST /api/ai/quick-meal never suggests grams exceeding available stock for any item"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/quick-meal",
            json={
                "diet_preference": "both",
                "goal": "muscle_gain",
                "budget": 500,  # Higher budget to test stock limits
                "order_type": "dine-in"
            },
            headers={"Authorization": f"Bearer {cashier_token}"},
            timeout=60
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        assert len(data["meal_items"]) > 0, "No meal items returned"
        
        for item in data["meal_items"]:
            grams = item["grams"]
            max_stock = item.get("max_stock", float('inf'))
            assert grams <= max_stock, f"{item['product_name']}: suggested {grams}g exceeds available stock {max_stock}g"
            print(f"  {item['product_name']}: {grams}g / {max_stock}g available ✓")
        
        print(f"✅ All items respect stock limits")


class TestAIQuickMealNutritionData:
    """Test that AI quick meal returns proper nutrition data"""
    
    def test_returns_nutrition_per_item(self, api_client, cashier_token):
        """POST /api/ai/quick-meal returns proper nutrition data (calories, protein, carbs, fat) for each item"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/quick-meal",
            json={
                "diet_preference": "both",
                "goal": "fat_loss",
                "budget": 200,
                "order_type": "dine-in"
            },
            headers={"Authorization": f"Bearer {cashier_token}"},
            timeout=60
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        assert len(data["meal_items"]) > 0, "No meal items returned"
        
        required_fields = ["calories", "protein", "carbs", "fat"]
        for item in data["meal_items"]:
            for field in required_fields:
                assert field in item, f"{field} missing for {item['product_name']}"
                assert isinstance(item[field], (int, float)), f"{field} should be numeric for {item['product_name']}"
                assert item[field] >= 0, f"{field} should be non-negative for {item['product_name']}"
            
            print(f"  {item['product_name']}: {item['calories']}cal, {item['protein']}g P, {item['carbs']}g C, {item['fat']}g F")
        
        # Also check totals
        totals = data.get("totals", {})
        for field in required_fields:
            assert field in totals, f"{field} missing from totals"
            assert isinstance(totals[field], (int, float)), f"{field} should be numeric in totals"
        
        print(f"✅ Total: {totals['calories']}cal, {totals['protein']}g P, {totals['carbs']}g C, {totals['fat']}g F")
        print(f"✅ All {len(data['meal_items'])} items have complete nutrition data")


class TestAIQuickMealWithoutBudget:
    """Test AI quick meal when no budget is specified"""
    
    def test_without_budget_returns_valid_meal(self, api_client, cashier_token):
        """POST /api/ai/quick-meal without budget still returns valid meal items"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/quick-meal",
            json={
                "diet_preference": "both",
                "goal": "maintenance",
                "order_type": "dine-in"
                # No budget specified
            },
            headers={"Authorization": f"Bearer {cashier_token}"},
            timeout=60
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Should return valid meal items even without budget
        assert "meal_items" in data, "meal_items missing"
        assert len(data["meal_items"]) > 0, "No meal items returned when no budget specified"
        
        # Each item should still have required fields
        for item in data["meal_items"]:
            assert "product_name" in item, "product_name missing"
            assert "grams" in item, "grams missing"
            assert "price" in item, "price missing"
            assert "calories" in item, "calories missing"
            assert "protein" in item, "protein missing"
        
        total_price = data["totals"].get("price", 0)
        print(f"✅ Without budget, returned {len(data['meal_items'])} items totaling ₹{total_price}")


class TestAIQuickMealResponseStructure:
    """Test the complete response structure of AI quick meal"""
    
    def test_complete_response_structure(self, api_client, cashier_token):
        """Verify complete response structure from AI quick meal"""
        response = api_client.post(
            f"{BASE_URL}/api/ai/quick-meal",
            json={
                "diet_preference": "veg",
                "goal": "fat_loss",
                "budget": 250,
                "order_type": "takeaway"
            },
            headers={"Authorization": f"Bearer {cashier_token}"},
            timeout=60
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Check top-level fields
        assert "meal_items" in data, "meal_items missing"
        assert "summary" in data, "summary missing"
        assert "totals" in data, "totals missing"
        
        # Check item structure
        item_fields = [
            "product_id", "product_name", "grams", "price",
            "calories", "protein", "carbs", "fat",
            "diet_type", "max_stock"
        ]
        for item in data["meal_items"]:
            for field in item_fields:
                assert field in item, f"Field '{field}' missing from item {item.get('product_name', 'unknown')}"
        
        # Check totals structure
        totals_fields = ["price", "calories", "protein", "carbs", "fat"]
        for field in totals_fields:
            assert field in data["totals"], f"Field '{field}' missing from totals"
        
        print(f"✅ Complete response structure verified")
        print(f"   Summary: {data['summary']}")
        print(f"   Items: {len(data['meal_items'])}")
        print(f"   Totals: ₹{data['totals']['price']}, {data['totals']['calories']}cal")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
