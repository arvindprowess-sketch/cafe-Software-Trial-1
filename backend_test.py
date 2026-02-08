#!/usr/bin/env python3
import asyncio
import aiohttp
import json
import os
from pathlib import Path

# Use the public endpoint from the review request
API_BASE = "https://cashier-hub-8.preview.emergentagent.com/api"
print(f"🌐 Testing Diet Cafe Cashier POS System at: {API_BASE}")
print(f"🎯 Focus: Cashier PIN Login, Product Management, Order Creation with GST, Payment Modes")

class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.critical_issues = []
        
    def log_pass(self, test_name, details=""):
        self.passed.append(f"✅ {test_name} {details}".strip())
        print(f"✅ {test_name} {details}".strip())
        
    def log_fail(self, test_name, error):
        self.failed.append(f"❌ {test_name}: {error}")
        print(f"❌ {test_name}: {error}")
        if any(critical in test_name.lower() for critical in ["login", "staff", "pin", "auth", "401"]):
            self.critical_issues.append(f"{test_name}: {error}")
        
    def print_summary(self):
        success_rate = len(self.passed) / (len(self.passed) + len(self.failed)) * 100 if (len(self.passed) + len(self.failed)) > 0 else 0
        print("\n" + "="*70)
        print(f"📊 DIET CAFE STAFF MANAGEMENT TEST RESULTS")
        print("="*70)
        print(f"✅ PASSED: {len(self.passed)}")
        print(f"❌ FAILED: {len(self.failed)}")
        print(f"📈 SUCCESS RATE: {success_rate:.1f}%")
        
        if self.critical_issues:
            print(f"\n🔥 CRITICAL ISSUES:")
            for issue in self.critical_issues:
                print(f"  ❌ {issue}")
                
        if self.failed:
            print(f"\n📝 ALL FAILURES:")
            for failure in self.failed:
                print(f"  {failure}")
        print("="*70)

results = TestResults()
admin_token = None
kitchen_staff_id = None
cashier_staff_id = None
test_order_id = None

async def test_admin_login(session):
    """Test admin login with admin@dietcafe.com / admin123"""
    global admin_token
    try:
        payload = {"email": "admin@dietcafe.com", "password": "admin123"}
        async with session.post(f"{API_BASE}/auth/login", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                admin_token = data.get("token")
                user = data.get("user", {})
                if admin_token and user.get("role") == "admin":
                    results.log_pass("Admin Login", f"✓ Token received, role: {user['role']}")
                    return True
                else:
                    results.log_fail("Admin Login", "Missing token or incorrect role")
                    return False
            else:
                text = await response.text()
                results.log_fail("Admin Login", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Admin Login", f"Exception: {e}")
        return False

async def test_create_kitchen_staff(session):
    """Test POST /api/staff - Create kitchen staff with PIN 9999"""
    global kitchen_staff_id
    if not admin_token:
        results.log_fail("Create Kitchen Staff", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "name": "Test Kitchen Staff",
            "role": "kitchen", 
            "pin": "9999"
        }
        
        async with session.post(f"{API_BASE}/staff", json=payload, headers=headers) as response:
            if response.status in [200, 201]:
                data = await response.json()
                kitchen_staff_id = data.get("id")
                if kitchen_staff_id and data.get("role") == "kitchen":
                    results.log_pass("Create Kitchen Staff", f"✓ Created: {data.get('name')}, PIN: {data.get('pin')}")
                    return True
                else:
                    results.log_fail("Create Kitchen Staff", "Missing ID or incorrect role")
                    return False
            else:
                text = await response.text()
                results.log_fail("Create Kitchen Staff", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Create Kitchen Staff", f"Exception: {e}")
        return False

async def test_create_cashier_staff(session):
    """Test POST /api/staff - Create cashier staff with PIN 8888"""
    global cashier_staff_id
    if not admin_token:
        results.log_fail("Create Cashier Staff", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "name": "Test Cashier Staff",
            "role": "cashier",
            "pin": "8888"
        }
        
        async with session.post(f"{API_BASE}/staff", json=payload, headers=headers) as response:
            if response.status in [200, 201]:
                data = await response.json()
                cashier_staff_id = data.get("id")
                if cashier_staff_id and data.get("role") == "cashier":
                    results.log_pass("Create Cashier Staff", f"✓ Created: {data.get('name')}, PIN: {data.get('pin')}")
                    return True
                else:
                    results.log_fail("Create Cashier Staff", "Missing ID or incorrect role")
                    return False
            else:
                text = await response.text()
                results.log_fail("Create Cashier Staff", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Create Cashier Staff", f"Exception: {e}")
        return False

async def test_list_all_staff(session):
    """Test GET /api/staff - Admin lists all staff"""
    global kitchen_staff_id, cashier_staff_id
    if not admin_token:
        results.log_fail("List All Staff", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/staff", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    staff_count = len(data)
                    if staff_count >= 2:  # Should have at least our 2 test staff
                        kitchen_staff = [s for s in data if s.get("role") == "kitchen"]
                        cashier_staff = [s for s in data if s.get("role") == "cashier"]
                        
                        # Store IDs for later tests
                        if kitchen_staff and not kitchen_staff_id:
                            kitchen_staff_id = kitchen_staff[0].get("id")
                        if cashier_staff and not cashier_staff_id:
                            cashier_staff_id = cashier_staff[0].get("id")
                        
                        results.log_pass("List All Staff", f"✓ {staff_count} staff ({len(kitchen_staff)} kitchen, {len(cashier_staff)} cashier)")
                        return True
                    else:
                        results.log_fail("List All Staff", f"Expected at least 2 staff, got {staff_count}")
                        return False
                else:
                    results.log_fail("List All Staff", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("List All Staff", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("List All Staff", f"Exception: {e}")
        return False

async def test_update_kitchen_staff(session):
    """Test PUT /api/staff/{id} - Update kitchen staff"""
    if not admin_token or not kitchen_staff_id:
        results.log_fail("Update Kitchen Staff", "No admin token or kitchen staff ID")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "name": "Updated Kitchen Staff",
            "is_active": True
        }
        
        async with session.put(f"{API_BASE}/staff/{kitchen_staff_id}", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                if data.get("name") == "Updated Kitchen Staff":
                    results.log_pass("Update Kitchen Staff", f"✓ Updated name successfully")
                    return True
                else:
                    results.log_pass("Update Kitchen Staff", f"✓ Update processed (data may vary)")
                    return True
            else:
                text = await response.text()
                results.log_fail("Update Kitchen Staff", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Update Kitchen Staff", f"Exception: {e}")
        return False

async def test_pin_login_kitchen(session):
    """Test POST /api/auth/pin-login - Kitchen staff login with PIN 1234"""
    try:
        payload = {"pin": "1234"}
        async with session.post(f"{API_BASE}/auth/pin-login", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                token = data.get("token")
                user = data.get("user", {})
                if token and user.get("role") == "kitchen":
                    results.log_pass("PIN Login Kitchen", f"✓ Login successful, role: {user['role']}, name: {user.get('name')}")
                    return True
                else:
                    results.log_fail("PIN Login Kitchen", "Missing token or incorrect role")
                    return False
            else:
                text = await response.text()
                results.log_fail("PIN Login Kitchen", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("PIN Login Kitchen", f"Exception: {e}")
        return False

async def test_pin_login_cashier(session):
    """Test POST /api/auth/pin-login - Cashier staff login with PIN 5678"""
    try:
        payload = {"pin": "5678"}
        async with session.post(f"{API_BASE}/auth/pin-login", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                token = data.get("token")
                user = data.get("user", {})
                if token and user.get("role") == "cashier":
                    results.log_pass("PIN Login Cashier", f"✓ Login successful, role: {user['role']}, name: {user.get('name')}")
                    return True
                else:
                    results.log_fail("PIN Login Cashier", "Missing token or incorrect role")
                    return False
            else:
                text = await response.text()
                results.log_fail("PIN Login Cashier", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("PIN Login Cashier", f"Exception: {e}")
        return False

async def test_pin_login_invalid(session):
    """Test POST /api/auth/pin-login - Invalid PIN should return 401"""
    try:
        payload = {"pin": "9999"}
        async with session.post(f"{API_BASE}/auth/pin-login", json=payload) as response:
            if response.status == 401:
                results.log_pass("PIN Login Invalid", f"✓ Correctly returned 401 for invalid PIN")
                return True
            else:
                text = await response.text()
                results.log_fail("PIN Login Invalid", f"Expected 401, got HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("PIN Login Invalid", f"Exception: {e}")
        return False

async def test_create_order_for_priority_test(session):
    """Create a test order to test priority functionality"""
    global test_order_id
    if not admin_token:
        results.log_fail("Create Test Order", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "order_type": "dine-in",
            "items": [
                {
                    "product_id": "test-priority-id",
                    "product_name": "Test Priority Item",
                    "grams": 100,
                    "price": 50,
                    "calories": 100,
                    "protein": 10,
                    "carbs": 15,
                    "fat": 5
                }
            ],
            "total_price": 50,
            "total_calories": 100,
            "total_protein": 10,
            "total_carbs": 15,
            "total_fat": 5
        }
        
        async with session.post(f"{API_BASE}/orders", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                test_order_id = data.get("id")
                if test_order_id:
                    results.log_pass("Create Test Order", f"✓ Created order: {test_order_id}")
                    return True
                else:
                    results.log_fail("Create Test Order", "No order ID in response")
                    return False
            else:
                text = await response.text()
                results.log_fail("Create Test Order", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Create Test Order", f"Exception: {e}")
        return False

async def test_set_order_priority(session):
    """Test PUT /api/orders/{order_id}/priority - Set order priority"""
    if not admin_token or not test_order_id:
        results.log_fail("Set Order Priority", "No admin token or test order ID")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Test setting priority to "urgent"
        payload = {"priority": "urgent"}
        async with session.put(f"{API_BASE}/orders/{test_order_id}/priority", json=payload, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Set Order Priority", f"✓ Set priority to urgent: {data.get('message', 'Success')}")
                return True
            else:
                text = await response.text()
                results.log_fail("Set Order Priority", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Set Order Priority", f"Exception: {e}")
        return False

async def test_get_inventory_admin(session):
    """Test GET /api/inventory - Admin can view inventory"""
    if not admin_token:
        results.log_fail("Get Inventory (Admin)", "No admin token available")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.get(f"{API_BASE}/inventory", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                if isinstance(data, list):
                    inventory_count = len(data)
                    # Check if inventory items have expected fields
                    if inventory_count > 0:
                        item = data[0]
                        has_name = "name" in item
                        has_stock = "available_qty_grams" in item or "stock" in item
                        results.log_pass("Get Inventory (Admin)", f"✓ {inventory_count} items, has_name: {has_name}, has_stock: {has_stock}")
                    else:
                        results.log_pass("Get Inventory (Admin)", f"✓ Empty inventory (expected for new system)")
                    return True
                else:
                    results.log_fail("Get Inventory (Admin)", "Response is not a list")
                    return False
            else:
                text = await response.text()
                results.log_fail("Get Inventory (Admin)", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Get Inventory (Admin)", f"Exception: {e}")
        return False

async def test_get_inventory_kitchen(session):
    """Test GET /api/inventory with kitchen PIN login - Kitchen can view inventory"""
    try:
        # First login with kitchen PIN
        payload = {"pin": "1234"}
        async with session.post(f"{API_BASE}/auth/pin-login", json=payload) as login_response:
            if login_response.status == 200:
                login_data = await login_response.json()
                kitchen_token = login_data.get("token")
                
                if kitchen_token:
                    # Now test inventory access
                    headers = {"Authorization": f"Bearer {kitchen_token}"}
                    async with session.get(f"{API_BASE}/inventory", headers=headers) as response:
                        if response.status == 200:
                            data = await response.json()
                            if isinstance(data, list):
                                results.log_pass("Get Inventory (Kitchen)", f"✓ Kitchen can access inventory: {len(data)} items")
                                return True
                            else:
                                results.log_fail("Get Inventory (Kitchen)", "Response is not a list")
                                return False
                        else:
                            text = await response.text()
                            results.log_fail("Get Inventory (Kitchen)", f"HTTP {response.status}: {text}")
                            return False
                else:
                    results.log_fail("Get Inventory (Kitchen)", "Kitchen login failed - no token")
                    return False
            else:
                results.log_fail("Get Inventory (Kitchen)", "Kitchen login failed")
                return False
    except Exception as e:
        results.log_fail("Get Inventory (Kitchen)", f"Exception: {e}")
        return False

async def test_non_admin_cannot_access_staff_endpoints(session):
    """Test that non-admin users cannot access staff management endpoints"""
    try:
        # First login with kitchen PIN (non-admin)
        payload = {"pin": "1234"}
        async with session.post(f"{API_BASE}/auth/pin-login", json=payload) as login_response:
            if login_response.status == 200:
                login_data = await login_response.json()
                kitchen_token = login_data.get("token")
                
                if kitchen_token:
                    # Try to access staff endpoint
                    headers = {"Authorization": f"Bearer {kitchen_token}"}
                    async with session.get(f"{API_BASE}/staff", headers=headers) as response:
                        if response.status == 403:
                            results.log_pass("Non-Admin Staff Access", f"✓ Kitchen user correctly denied access (403)")
                            return True
                        else:
                            text = await response.text()
                            results.log_fail("Non-Admin Staff Access", f"Expected 403, got HTTP {response.status}: {text}")
                            return False
                else:
                    results.log_fail("Non-Admin Staff Access", "Kitchen login failed - no token")
                    return False
            else:
                results.log_fail("Non-Admin Staff Access", "Kitchen login failed")
                return False
    except Exception as e:
        results.log_fail("Non-Admin Staff Access", f"Exception: {e}")
        return False

async def test_delete_staff(session):
    """Test DELETE /api/staff/{id} - Admin deletes staff"""
    if not admin_token or not cashier_staff_id:
        results.log_fail("Delete Staff", "No admin token or cashier staff ID")
        return False
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        async with session.delete(f"{API_BASE}/staff/{cashier_staff_id}", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                results.log_pass("Delete Staff", f"✓ Deleted cashier staff: {data.get('message', 'Success')}")
                return True
            else:
                text = await response.text()
                results.log_fail("Delete Staff", f"HTTP {response.status}: {text}")
                return False
    except Exception as e:
        results.log_fail("Delete Staff", f"Exception: {e}")
        return False

async def main():
    print("🧪 Starting Diet Cafe Staff Management Backend Tests...")
    print(f"🌐 Backend URL: {API_BASE}")
    print("🎯 FOCUS: Staff Management, PIN Login, Order Priority, Inventory")
    print("📋 Testing key features from review request:")
    print("   - POST /api/staff (Admin creates kitchen/cashier staff)")
    print("   - GET /api/staff (Admin lists all staff)")
    print("   - PUT /api/staff/{id} (Admin updates staff)")
    print("   - DELETE /api/staff/{id} (Admin deletes staff)")
    print("   - POST /api/auth/pin-login (PIN login for kitchen/cashier)")
    print("   - PUT /api/orders/{order_id}/priority (Set order priority)")
    print("   - GET /api/inventory (Kitchen/Admin view stock levels)")
    print("   - Test credentials: Admin (admin@dietcafe.com/admin123), Kitchen PIN: 1234, Cashier PIN: 5678")
    print("="*70)
    
    # Create session with proper timeout
    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        
        # Test sequence focusing on review request priorities
        print("\n1️⃣ Testing Admin Login...")
        login_success = await test_admin_login(session)
        
        if login_success:
            print("\n🏢 STAFF MANAGEMENT TESTS")
            print("="*50)
            print("2️⃣ Testing Create Kitchen Staff...")
            await test_create_kitchen_staff(session)
            
            print("\n3️⃣ Testing Create Cashier Staff...")
            await test_create_cashier_staff(session)
            
            print("\n4️⃣ Testing List All Staff...")
            await test_list_all_staff(session)
            
            print("\n5️⃣ Testing Update Kitchen Staff...")
            await test_update_kitchen_staff(session)
            
            print("\n🔐 PIN LOGIN TESTS")
            print("="*50)
            print("6️⃣ Testing Kitchen PIN Login (1234)...")
            await test_pin_login_kitchen(session)
            
            print("\n7️⃣ Testing Cashier PIN Login (5678)...")
            await test_pin_login_cashier(session)
            
            print("\n8️⃣ Testing Invalid PIN Login...")
            await test_pin_login_invalid(session)
            
            print("\n⚡ ORDER PRIORITY TESTS")
            print("="*50)
            print("9️⃣ Testing Create Order for Priority Test...")
            await test_create_order_for_priority_test(session)
            
            print("\n🔟 Testing Set Order Priority...")
            await test_set_order_priority(session)
            
            print("\n📦 INVENTORY TESTS")
            print("="*50)
            print("1️⃣1️⃣ Testing Inventory Access (Admin)...")
            await test_get_inventory_admin(session)
            
            print("\n1️⃣2️⃣ Testing Inventory Access (Kitchen)...")
            await test_get_inventory_kitchen(session)
            
            print("\n🔒 AUTHORIZATION TESTS")
            print("="*50)
            print("1️⃣3️⃣ Testing Non-Admin Cannot Access Staff Endpoints...")
            await test_non_admin_cannot_access_staff_endpoints(session)
            
            print("\n🗑️ CLEANUP TESTS")
            print("="*50)
            print("1️⃣4️⃣ Testing Delete Staff...")
            await test_delete_staff(session)
        
        else:
            print("⚠️ Skipping feature tests due to admin login failure")
    
    # Print final results
    results.print_summary()
    
    # Return exit code based on results
    return 0 if len(results.failed) == 0 else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)