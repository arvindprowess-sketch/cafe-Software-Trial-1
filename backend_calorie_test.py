#!/usr/bin/env python3
"""
Backend tests focused on the Calorie Goal Awareness System features
Testing that orders are NEVER blocked, regardless of calorie content.
"""
import asyncio
import aiohttp
import json
import uuid
from datetime import datetime

# Backend URL from review request
BACKEND_URL = "https://mobile-app-changes.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

class CalorieTestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.critical_failures = []  # Order blocking would be critical
        
    def log_pass(self, test_name, details=""):
        self.passed.append(f"✅ {test_name} {details}".strip())
        print(f"✅ {test_name} {details}".strip())
        
    def log_fail(self, test_name, error, is_critical=False):
        failure = f"❌ {test_name}: {error}"
        self.failed.append(failure)
        if is_critical:
            self.critical_failures.append(failure)
        print(failure)
        
    def print_summary(self):
        print("\n" + "="*70)
        print(f"📊 CALORIE GOAL AWARENESS SYSTEM - BACKEND TEST RESULTS")
        print("="*70)
        print(f"✅ PASSED: {len(self.passed)}")
        print(f"❌ FAILED: {len(self.failed)}")
        if self.critical_failures:
            print(f"🚨 CRITICAL FAILURES: {len(self.critical_failures)}")
            print("   These failures would break the main feature requirement!")
            for failure in self.critical_failures:
                print(f"   {failure}")
        elif self.failed:
            print("\n⚠️ NON-CRITICAL FAILURES:")
            for failure in self.failed:
                print(f"  {failure}")
        print("="*70)

results = CalorieTestResults()
admin_token = None
customer_token = None

async def test_admin_login(session):
    """Test admin login as specified in review request"""
    global admin_token
    try:
        payload = {"email": "admin@dietcafe.com", "password": "admin123"}
        async with session.post(f"{API_BASE}/auth/login", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                admin_token = data.get("token")
                user = data.get("user", {})
                if admin_token and user.get("role") == "admin":
                    results.log_pass("Admin Login", f"admin@dietcafe.com / admin123 ✓")
                    return True
                else:
                    results.log_fail("Admin Login", "Missing token or wrong role")
                    return False
            else:
                text = await response.text()
                results.log_fail("Admin Login", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Admin Login", f"Exception: {e}")
        return False

async def test_otp_send(session):
    """Test OTP send for customer login"""
    try:
        # Use a test phone number
        test_phone = "9876543210"
        payload = {"phone": test_phone, "name": "Test User"}
        
        async with session.post(f"{API_BASE}/auth/otp/send", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                demo_otp = data.get("demo_otp")  # The API returns demo OTP for testing
                if demo_otp:
                    results.log_pass("OTP Send", f"phone: {test_phone}, demo_otp: {demo_otp}")
                    return demo_otp, test_phone
                else:
                    results.log_fail("OTP Send", "No demo OTP in response")
                    return None, None
            else:
                text = await response.text()
                results.log_fail("OTP Send", f"HTTP {response.status}: {text}")
                return None, None
    except Exception as e:
        results.log_fail("OTP Send", f"Exception: {e}")
        return None, None

async def test_otp_verify(session, otp, phone):
    """Test OTP verification and customer account creation"""
    global customer_token
    if not otp or not phone:
        results.log_fail("OTP Verify", "No OTP or phone from send test")
        return False
        
    try:
        payload = {"phone": phone, "otp": otp, "name": "Test Customer"}
        
        async with session.post(f"{API_BASE}/auth/otp/verify", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                customer_token = data.get("token")
                user = data.get("user", {})
                is_new = data.get("is_new_user", False)
                
                if customer_token and user.get("role") == "customer":
                    results.log_pass("OTP Verify", f"✓ Customer account created/login, new_user: {is_new}")
                    return True
                else:
                    results.log_fail("OTP Verify", "Missing token or wrong role")
                    return False
            else:
                text = await response.text()
                results.log_fail("OTP Verify", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("OTP Verify", f"Exception: {e}")
        return False

async def test_products_for_cart(session):
    """Test /api/products returns products for cart building"""
    try:
        async with session.get(f"{API_BASE}/products") as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list) and len(data) > 0:
                    # Check if products have required fields for cart building
                    sample = data[0]
                    required_fields = ["id", "name", "cost_per_100g", "calories_per_100g", 
                                     "protein_per_100g", "carbs_per_100g", "fat_per_100g"]
                    missing = [f for f in required_fields if f not in sample]
                    
                    if not missing:
                        results.log_pass("Products for Cart", f"✓ {len(data)} products with all cart fields")
                        return data
                    else:
                        results.log_fail("Products for Cart", f"Missing fields: {missing}")
                        return None
                else:
                    results.log_fail("Products for Cart", "No products returned")
                    return None
            else:
                text = await response.text()
                results.log_fail("Products for Cart", f"HTTP {response.status}: {text}")
                return None
    except Exception as e:
        results.log_fail("Products for Cart", f"Exception: {e}")
        return None

async def test_nutrition_summary(session):
    """Test /api/user/nutrition-summary returns user consumed calories and goals"""
    if not customer_token:
        results.log_fail("Nutrition Summary", "No customer token available")
        return None
        
    try:
        headers = {"Authorization": f"Bearer {customer_token}"}
        async with session.get(f"{API_BASE}/user/nutrition-summary", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                consumed = data.get("consumed", {})
                goals = data.get("goals", {})
                
                # Check if it has the expected structure
                if "calories" in consumed and "daily_calories" in goals:
                    results.log_pass("Nutrition Summary", 
                        f"✓ consumed: {consumed.get('calories', 0)} cal, goal: {goals.get('daily_calories', 0)} cal")
                    return data
                else:
                    results.log_fail("Nutrition Summary", "Missing calories or goals data")
                    return None
            else:
                text = await response.text()
                results.log_fail("Nutrition Summary", f"HTTP {response.status}: {text}")
                return None
    except Exception as e:
        results.log_fail("Nutrition Summary", f"Exception: {e}")
        return None

async def test_order_never_blocked_low_calorie(session, products):
    """Test that a low calorie order succeeds (baseline test)"""
    if not customer_token or not products:
        results.log_fail("Order - Low Calorie", "No customer token or products")
        return False
        
    try:
        headers = {"Authorization": f"Bearer {customer_token}"}
        
        # Find a low calorie product (like salad)
        low_cal_product = None
        for p in products:
            if p.get("calories_per_100g", 0) < 50:  # Very low calorie
                low_cal_product = p
                break
        
        if not low_cal_product:
            # Use the first product as fallback
            low_cal_product = products[0]
            
        # Create a small order
        grams = 100
        factor = grams / 100
        order_data = {
            "order_type": "dine-in",
            "items": [{
                "product_id": low_cal_product["id"],
                "product_name": low_cal_product["name"],
                "grams": grams,
                "price": factor * low_cal_product["cost_per_100g"],
                "calories": factor * low_cal_product["calories_per_100g"],
                "protein": factor * low_cal_product["protein_per_100g"],
                "carbs": factor * low_cal_product["carbs_per_100g"],
                "fat": factor * low_cal_product["fat_per_100g"]
            }],
            "total_price": factor * low_cal_product["cost_per_100g"],
            "total_calories": factor * low_cal_product["calories_per_100g"],
            "total_protein": factor * low_cal_product["protein_per_100g"],
            "total_carbs": factor * low_cal_product["carbs_per_100g"],
            "total_fat": factor * low_cal_product["fat_per_100g"],
            "fitness_goal": "maintenance"
        }
        
        async with session.post(f"{API_BASE}/orders", json=order_data, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                order_id = data.get("id")
                results.log_pass("Order - Low Calorie", 
                    f"✓ {low_cal_product['name']} ({grams}g, {order_data['total_calories']:.0f} cal) - Order ID: {order_id}")
                return True
            else:
                text = await response.text()
                results.log_fail("Order - Low Calorie", f"HTTP {response.status}: {text}", is_critical=True)
                return False
    except Exception as e:
        results.log_fail("Order - Low Calorie", f"Exception: {e}", is_critical=True)
        return False

async def test_order_never_blocked_high_calorie(session, products):
    """CRITICAL TEST: Verify high calorie orders are NEVER blocked by backend"""
    if not customer_token or not products:
        results.log_fail("Order - High Calorie (CRITICAL)", "No customer token or products", is_critical=True)
        return False
        
    try:
        headers = {"Authorization": f"Bearer {customer_token}"}
        
        # Find high calorie products
        high_cal_products = [p for p in products if p.get("calories_per_100g", 0) > 300]
        if not high_cal_products:
            # Use highest calorie products available
            high_cal_products = sorted(products, key=lambda x: x.get("calories_per_100g", 0), reverse=True)[:3]
        
        # Create a deliberately excessive calorie order (3000+ calories)
        order_items = []
        total_calories = 0
        total_price = 0
        total_protein = 0
        total_carbs = 0
        total_fat = 0
        
        for product in high_cal_products[:3]:  # Use top 3 high calorie products
            grams = 500  # Large portion
            factor = grams / 100
            
            calories = factor * product["calories_per_100g"]
            price = factor * product["cost_per_100g"]
            protein = factor * product["protein_per_100g"]
            carbs = factor * product["carbs_per_100g"]
            fat = factor * product["fat_per_100g"]
            
            order_items.append({
                "product_id": product["id"],
                "product_name": product["name"],
                "grams": grams,
                "price": price,
                "calories": calories,
                "protein": protein,
                "carbs": carbs,
                "fat": fat
            })
            
            total_calories += calories
            total_price += price
            total_protein += protein
            total_carbs += carbs
            total_fat += fat
        
        order_data = {
            "order_type": "dine-in",
            "items": order_items,
            "total_price": total_price,
            "total_calories": total_calories,
            "total_protein": total_protein,
            "total_carbs": total_carbs,
            "total_fat": total_fat,
            "fitness_goal": "fat_loss"  # This makes it even more "excessive"
        }
        
        async with session.post(f"{API_BASE}/orders", json=order_data, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                order_id = data.get("id")
                results.log_pass("Order - High Calorie (CRITICAL)", 
                    f"✅ NEVER BLOCKED - {total_calories:.0f} calories accepted - Order ID: {order_id}")
                print(f"   📊 Order details: {len(order_items)} items, ₹{total_price:.0f}, {total_calories:.0f} cal")
                return True
            else:
                text = await response.text()
                results.log_fail("Order - High Calorie (CRITICAL)", 
                    f"🚨 ORDER BLOCKED! HTTP {response.status}: {text}", is_critical=True)
                print("   🚨 THIS IS A CRITICAL FAILURE - Orders should NEVER be blocked!")
                return False
    except Exception as e:
        results.log_fail("Order - High Calorie (CRITICAL)", f"Exception: {e}", is_critical=True)
        return False

async def test_order_extreme_calorie(session, products):
    """Test even more extreme calorie scenario to ensure no blocking"""
    if not customer_token or not products:
        results.log_fail("Order - Extreme Calorie", "No customer token or products")
        return False
        
    try:
        headers = {"Authorization": f"Bearer {customer_token}"}
        
        # Find the highest calorie product
        highest_cal = max(products, key=lambda x: x.get("calories_per_100g", 0))
        
        # Create an extreme order: 1kg (1000g) of highest calorie food
        grams = 1000  # 1kg
        factor = grams / 100
        
        order_data = {
            "order_type": "dine-in",
            "items": [{
                "product_id": highest_cal["id"],
                "product_name": highest_cal["name"],
                "grams": grams,
                "price": factor * highest_cal["cost_per_100g"],
                "calories": factor * highest_cal["calories_per_100g"],
                "protein": factor * highest_cal["protein_per_100g"],
                "carbs": factor * highest_cal["carbs_per_100g"],
                "fat": factor * highest_cal["fat_per_100g"]
            }],
            "total_price": factor * highest_cal["cost_per_100g"],
            "total_calories": factor * highest_cal["calories_per_100g"],
            "total_protein": factor * highest_cal["protein_per_100g"],
            "total_carbs": factor * highest_cal["carbs_per_100g"],
            "total_fat": factor * highest_cal["fat_per_100g"],
            "fitness_goal": "fat_loss"
        }
        
        extreme_calories = order_data["total_calories"]
        
        async with session.post(f"{API_BASE}/orders", json=order_data, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                order_id = data.get("id")
                results.log_pass("Order - Extreme Calorie", 
                    f"✅ {extreme_calories:.0f} cal ({highest_cal['name']} 1kg) accepted - Order ID: {order_id}")
                return True
            else:
                text = await response.text()
                results.log_fail("Order - Extreme Calorie", f"HTTP {response.status}: {text}", is_critical=True)
                return False
    except Exception as e:
        results.log_fail("Order - Extreme Calorie", f"Exception: {e}")
        return False

async def main():
    print("🧪 CALORIE GOAL AWARENESS SYSTEM - Backend API Tests")
    print("="*70)
    print("🎯 KEY REQUIREMENT: Orders must NEVER be blocked by backend")
    print("📱 Frontend shows warnings but backend always accepts orders")
    print(f"🌐 Backend URL: {API_BASE}")
    
    # Create session with proper timeout
    timeout = aiohttp.ClientTimeout(total=120)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        
        print("\n1️⃣ Testing Admin Login (admin@dietcafe.com / admin123)...")
        await test_admin_login(session)
        
        print("\n2️⃣ Testing Customer OTP Send...")
        otp, phone = await test_otp_send(session)
        
        print("\n3️⃣ Testing Customer OTP Verify & Account Creation...")
        customer_login_success = await test_otp_verify(session, otp, phone)
        
        print("\n4️⃣ Testing Products Endpoint for Cart Building...")
        products = await test_products_for_cart(session)
        
        if customer_login_success:
            print("\n5️⃣ Testing User Nutrition Summary...")
            await test_nutrition_summary(session)
            
            if products:
                print("\n6️⃣ Testing Low Calorie Order (Baseline)...")
                await test_order_never_blocked_low_calorie(session, products)
                
                print("\n7️⃣ Testing High Calorie Order (CRITICAL - Must NOT be blocked)...")
                await test_order_never_blocked_high_calorie(session, products)
                
                print("\n8️⃣ Testing Extreme Calorie Order (Additional validation)...")
                await test_order_extreme_calorie(session, products)
            else:
                print("⚠️ Skipping order tests - no products available")
        else:
            print("⚠️ Skipping customer tests - login failed")
    
    # Print final results
    results.print_summary()
    
    # Critical check
    if results.critical_failures:
        print("\n🚨 CRITICAL FEATURE FAILURE DETECTED!")
        print("   The main requirement 'Orders are never blocked' has failed!")
        print("   This breaks the core calorie goal awareness feature.")
        return 1
    
    print("\n✅ Core Feature Validation: Orders are NEVER blocked ✅")
    return 0 if len(results.failed) == 0 else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)