#!/usr/bin/env python3
"""
Backend API Testing for AI Diet Café App
Testing new features: diet_type in products, AI quick meal builder, and reorder functionality
"""

import requests
import json
import sys
from typing import Dict, List, Any

# Use the public URL as per instructions
BASE_URL = "https://mobile-app-resume.preview.emergentagent.com/api"

class TestRunner:
    def __init__(self):
        self.token = None
        self.user_id = None
        self.order_id = None
        self.failures = []
        self.successes = []
    
    def log_test(self, test_name: str, success: bool, message: str):
        if success:
            self.successes.append(f"✅ {test_name}: {message}")
            print(f"✅ {test_name}: {message}")
        else:
            self.failures.append(f"❌ {test_name}: {message}")
            print(f"❌ {test_name}: {message}")
    
    def make_request(self, method: str, endpoint: str, data: Dict = None, auth: bool = False) -> tuple:
        """Make HTTP request and return (success, response_data, status_code)"""
        url = f"{BASE_URL}{endpoint}"
        headers = {"Content-Type": "application/json"}
        if auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        
        try:
            if method == "GET":
                response = requests.get(url, headers=headers, timeout=30)
            elif method == "POST":
                response = requests.post(url, headers=headers, json=data, timeout=30)
            elif method == "PUT":
                response = requests.put(url, headers=headers, json=data, timeout=30)
            else:
                return False, {"error": f"Unsupported method {method}"}, 0
            
            try:
                response_data = response.json()
            except:
                response_data = {"text": response.text}
            
            return response.status_code < 400, response_data, response.status_code
        
        except requests.exceptions.Timeout:
            return False, {"error": "Request timeout"}, 0
        except requests.exceptions.ConnectionError:
            return False, {"error": "Connection error"}, 0
        except Exception as e:
            return False, {"error": str(e)}, 0
    
    def test_products_diet_type(self):
        """Test 1: Verify products have diet_type field with correct values"""
        print("\n🧪 Testing Products Diet Type Classification...")
        
        success, data, status = self.make_request("GET", "/products")
        if not success:
            self.log_test("GET /products", False, f"Request failed: {data.get('error', 'Unknown error')}")
            return
        
        if status != 200:
            self.log_test("GET /products", False, f"HTTP {status}: {data}")
            return
        
        if not isinstance(data, list):
            self.log_test("GET /products", False, f"Expected list, got: {type(data)}")
            return
        
        if len(data) == 0:
            self.log_test("GET /products", False, "No products returned")
            return
        
        # Check specific products mentioned in requirements
        expected_non_veg = ["chicken breast", "kabab", "egg white", "grilled fish"]
        expected_veg = ["paneer tikka", "dal", "brown rice", "oats"]
        
        found_products = {}
        diet_type_present = True
        
        for product in data:
            if "diet_type" not in product:
                diet_type_present = False
                break
            
            name_lower = product.get("name", "").lower()
            for expected in expected_non_veg + expected_veg:
                if expected in name_lower:
                    found_products[expected] = product.get("diet_type")
        
        if not diet_type_present:
            self.log_test("Products diet_type field", False, "Some products missing diet_type field")
            return
        
        # Verify specific classifications
        errors = []
        for item in expected_non_veg:
            if item in found_products:
                if found_products[item] != "non-veg":
                    errors.append(f"{item} is {found_products[item]}, expected non-veg")
            else:
                errors.append(f"{item} not found in products")
        
        for item in expected_veg:
            if item in found_products:
                if found_products[item] != "veg":
                    errors.append(f"{item} is {found_products[item]}, expected veg")
            else:
                errors.append(f"{item} not found in products")
        
        if errors:
            self.log_test("Products diet_type classification", False, f"Classification errors: {', '.join(errors)}")
        else:
            self.log_test("Products diet_type classification", True, f"All products correctly classified. Found {len(found_products)} expected products.")
    
    def test_user_registration_and_login(self):
        """Test user registration and authentication"""
        print("\n🧪 Testing User Authentication...")
        
        # Test registration
        reg_data = {
            "email": "testuser@example.com",
            "password": "test123456",
            "name": "Test User",
            "role": "customer"
        }
        
        success, data, status = self.make_request("POST", "/auth/register", reg_data)
        
        if success and status == 200:
            if "token" in data and "user" in data:
                self.token = data["token"]
                self.user_id = data["user"]["id"]
                self.log_test("User Registration", True, f"User registered successfully with ID: {self.user_id}")
            else:
                self.log_test("User Registration", False, "Token or user data missing in response")
        elif status == 400 and "already registered" in str(data).lower():
            # User already exists, try login
            login_data = {"email": reg_data["email"], "password": reg_data["password"]}
            success, data, status = self.make_request("POST", "/auth/login", login_data)
            
            if success and status == 200:
                self.token = data["token"]
                self.user_id = data["user"]["id"]
                self.log_test("User Login (existing user)", True, f"Logged in successfully with ID: {self.user_id}")
            else:
                self.log_test("User Login", False, f"Login failed: {data}")
        else:
            self.log_test("User Registration", False, f"Registration failed: {data}")
    
    def test_ai_quick_meal_builder(self):
        """Test 2: AI Quick Meal Builder endpoint"""
        print("\n🧪 Testing AI Quick Meal Builder...")
        
        if not self.token:
            self.log_test("AI Quick Meal - Auth", False, "No authentication token available")
            return
        
        # Test 1: Vegetarian meal for fat loss
        veg_request = {
            "diet_preference": "veg",
            "goal": "fat_loss",
            "budget": 200,
            "order_type": "dine-in"
        }
        
        success, data, status = self.make_request("POST", "/ai/quick-meal", veg_request, auth=True)
        
        if not success:
            self.log_test("AI Quick Meal (veg)", False, f"Request failed: {data.get('error', 'Unknown error')}")
        elif status != 200:
            self.log_test("AI Quick Meal (veg)", False, f"HTTP {status}: {data}")
        else:
            # Validate response structure
            required_fields = ["meal_items", "summary", "totals"]
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                self.log_test("AI Quick Meal (veg) - Structure", False, f"Missing fields: {missing_fields}")
            else:
                # Validate meal_items structure
                if not isinstance(data["meal_items"], list):
                    self.log_test("AI Quick Meal (veg) - Items", False, "meal_items is not a list")
                elif len(data["meal_items"]) == 0:
                    self.log_test("AI Quick Meal (veg) - Items", False, "No meal items returned")
                else:
                    # Check first item structure
                    item = data["meal_items"][0]
                    required_item_fields = ["product_id", "product_name", "grams", "price", "calories", "protein", "carbs", "fat", "diet_type"]
                    missing_item_fields = [field for field in required_item_fields if field not in item]
                    
                    if missing_item_fields:
                        self.log_test("AI Quick Meal (veg) - Item Structure", False, f"Missing item fields: {missing_item_fields}")
                    else:
                        # Check all items are veg
                        non_veg_items = [item["product_name"] for item in data["meal_items"] if item.get("diet_type") != "veg"]
                        if non_veg_items:
                            self.log_test("AI Quick Meal (veg) - Diet Filter", False, f"Non-veg items in veg meal: {non_veg_items}")
                        else:
                            self.log_test("AI Quick Meal (veg)", True, f"Generated veg meal with {len(data['meal_items'])} items, total: ₹{data['totals'].get('price', 0)}")
        
        # Test 2: Non-vegetarian meal for muscle gain
        non_veg_request = {
            "diet_preference": "non-veg",
            "goal": "muscle_gain",
            "budget": 300,
            "order_type": "dine-in"
        }
        
        success, data, status = self.make_request("POST", "/ai/quick-meal", non_veg_request, auth=True)
        
        if not success:
            self.log_test("AI Quick Meal (non-veg)", False, f"Request failed: {data.get('error', 'Unknown error')}")
        elif status != 200:
            self.log_test("AI Quick Meal (non-veg)", False, f"HTTP {status}: {data}")
        else:
            if "meal_items" in data and len(data["meal_items"]) > 0:
                # Check if at least one item is non-veg for non-veg preference
                has_non_veg = any(item.get("diet_type") == "non-veg" for item in data["meal_items"])
                if has_non_veg:
                    self.log_test("AI Quick Meal (non-veg)", True, f"Generated non-veg meal with {len(data['meal_items'])} items, total: ₹{data['totals'].get('price', 0)}")
                else:
                    self.log_test("AI Quick Meal (non-veg) - Diet Filter", False, "No non-veg items in non-veg meal request")
            else:
                self.log_test("AI Quick Meal (non-veg)", False, "No meal items returned")
    
    def test_create_order_for_reorder(self):
        """Create an order to test reorder functionality"""
        print("\n🧪 Creating Order for Reorder Test...")
        
        if not self.token:
            self.log_test("Create Order - Auth", False, "No authentication token available")
            return
        
        # First get some products to create an order
        success, products, status = self.make_request("GET", "/products")
        if not success or len(products) == 0:
            self.log_test("Create Order - Products", False, "Cannot get products for order creation")
            return
        
        # Create order with first few products
        selected_products = products[:2]  # Use first 2 products
        order_items = []
        total_price = total_calories = total_protein = total_carbs = total_fat = 0
        
        for product in selected_products:
            grams = 150  # 150g of each item
            factor = grams / 100
            
            item = {
                "product_id": product["id"],
                "product_name": product["name"],
                "grams": grams,
                "price": factor * product["cost_per_100g"],
                "calories": factor * product["calories_per_100g"],
                "protein": factor * product["protein_per_100g"],
                "carbs": factor * product["carbs_per_100g"],
                "fat": factor * product["fat_per_100g"]
            }
            order_items.append(item)
            total_price += item["price"]
            total_calories += item["calories"]
            total_protein += item["protein"]
            total_carbs += item["carbs"]
            total_fat += item["fat"]
        
        order_data = {
            "order_type": "dine-in",
            "items": order_items,
            "total_price": total_price,
            "total_calories": total_calories,
            "total_protein": total_protein,
            "total_carbs": total_carbs,
            "total_fat": total_fat,
            "fitness_goal": "maintenance"
        }
        
        success, data, status = self.make_request("POST", "/orders", order_data, auth=True)
        
        if success and status == 200:
            self.order_id = data.get("id")
            self.log_test("Create Order", True, f"Order created with ID: {self.order_id}")
        else:
            self.log_test("Create Order", False, f"Order creation failed: {data}")
    
    def test_reorder_endpoint(self):
        """Test 3: Reorder endpoint"""
        print("\n🧪 Testing Reorder Functionality...")
        
        if not self.token:
            self.log_test("Reorder - Auth", False, "No authentication token available")
            return
        
        if not self.order_id:
            self.log_test("Reorder - Order ID", False, "No order ID available for reorder test")
            return
        
        success, data, status = self.make_request("POST", f"/orders/{self.order_id}/reorder", auth=True)
        
        if not success:
            self.log_test("Reorder", False, f"Request failed: {data.get('error', 'Unknown error')}")
        elif status != 200:
            self.log_test("Reorder", False, f"HTTP {status}: {data}")
        else:
            # Validate response structure
            required_fields = ["cart_items", "order_type"]
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                self.log_test("Reorder - Structure", False, f"Missing fields: {missing_fields}")
            else:
                if not isinstance(data["cart_items"], list):
                    self.log_test("Reorder - Cart Items", False, "cart_items is not a list")
                elif len(data["cart_items"]) == 0:
                    self.log_test("Reorder - Cart Items", False, "No cart items returned")
                else:
                    # Check first cart item has full product details
                    item = data["cart_items"][0]
                    expected_fields = ["product_id", "product_name", "grams", "price", "calories", "protein", "carbs", "fat", "cost_per_100g", "diet_type"]
                    missing_item_fields = [field for field in expected_fields if field not in item]
                    
                    if missing_item_fields:
                        self.log_test("Reorder - Item Details", False, f"Missing item fields: {missing_item_fields}")
                    else:
                        self.log_test("Reorder", True, f"Successfully reordered {len(data['cart_items'])} items with full product details")
    
    def test_existing_endpoints(self):
        """Test 4: Verify existing endpoints still work"""
        print("\n🧪 Testing Existing Endpoints...")
        
        # Test admin login
        admin_login = {"email": "admin@dietcafe.com", "password": "admin123"}
        success, data, status = self.make_request("POST", "/auth/login", admin_login)
        
        if success and status == 200:
            self.log_test("Admin Login", True, "Admin authentication successful")
            admin_token = data["token"]
        else:
            self.log_test("Admin Login", False, f"Admin login failed: {data}")
            admin_token = None
        
        # Test banners endpoint
        success, data, status = self.make_request("GET", "/banners")
        
        if success and status == 200:
            if isinstance(data, list) and len(data) > 0:
                self.log_test("GET /banners", True, f"Retrieved {len(data)} banners")
            else:
                self.log_test("GET /banners", False, "No banners returned or invalid format")
        else:
            self.log_test("GET /banners", False, f"Banners request failed: {data}")
        
        # Test products endpoint (already tested above but verify again)
        success, data, status = self.make_request("GET", "/products")
        
        if success and status == 200:
            if isinstance(data, list) and len(data) > 0:
                self.log_test("GET /products (existing)", True, f"Retrieved {len(data)} products")
            else:
                self.log_test("GET /products (existing)", False, "No products returned")
        else:
            self.log_test("GET /products (existing)", False, f"Products request failed: {data}")
    
    def run_all_tests(self):
        """Run all backend API tests"""
        print("🚀 Starting AI Diet Café Backend API Tests")
        print(f"🌐 Testing against: {BASE_URL}")
        print("=" * 60)
        
        # Test in order of dependencies
        self.test_products_diet_type()
        self.test_user_registration_and_login()
        self.test_ai_quick_meal_builder()
        self.test_create_order_for_reorder()
        self.test_reorder_endpoint()
        self.test_existing_endpoints()
        
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        if self.successes:
            print(f"\n✅ PASSED ({len(self.successes)}):")
            for success in self.successes:
                print(f"  {success}")
        
        if self.failures:
            print(f"\n❌ FAILED ({len(self.failures)}):")
            for failure in self.failures:
                print(f"  {failure}")
        else:
            print("\n🎉 All tests passed!")
        
        print(f"\n📈 Success Rate: {len(self.successes)}/{len(self.successes) + len(self.failures)} ({(len(self.successes)/(len(self.successes) + len(self.failures))*100):.1f}%)")
        
        return len(self.failures) == 0

if __name__ == "__main__":
    runner = TestRunner()
    success = runner.run_all_tests()
    sys.exit(0 if success else 1)