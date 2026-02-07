from fastapi import FastAPI, APIRouter, HTTPException, Depends, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import base64
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

JWT_SECRET = "dietcafe_secret_key_2024"
JWT_ALGORITHM = "HS256"

# ========== NUTRITION DATABASE (per 100g) ==========
NON_VEG_KEYWORDS = {"chicken", "egg", "fish", "kabab", "seekh", "mutton", "lamb", "prawn", "shrimp", "meat", "pork", "beef", "turkey"}

def detect_diet_type(name: str) -> str:
    name_lower = name.lower()
    for kw in NON_VEG_KEYWORDS:
        if kw in name_lower:
            return "non-veg"
    return "veg"

NUTRITION_DB = {
    "chicken breast": {"calories": 165, "protein": 31, "carbs": 0, "fat": 3.6, "category": "Protein", "diet_type": "non-veg"},
    "chicken": {"calories": 239, "protein": 27, "carbs": 0, "fat": 14, "category": "Protein", "diet_type": "non-veg"},
    "paneer": {"calories": 265, "protein": 18.3, "carbs": 1.2, "fat": 20.8, "category": "Protein", "diet_type": "veg"},
    "paneer tikka": {"calories": 220, "protein": 16, "carbs": 5, "fat": 15, "category": "Protein", "diet_type": "veg"},
    "egg": {"calories": 155, "protein": 13, "carbs": 1.1, "fat": 11, "category": "Protein", "diet_type": "non-veg"},
    "egg white": {"calories": 52, "protein": 11, "carbs": 0.7, "fat": 0.2, "category": "Protein", "diet_type": "non-veg"},
    "dal": {"calories": 116, "protein": 9, "carbs": 20, "fat": 0.4, "category": "Protein", "diet_type": "veg"},
    "moong dal": {"calories": 105, "protein": 7.5, "carbs": 18, "fat": 0.6, "category": "Protein", "diet_type": "veg"},
    "rice": {"calories": 130, "protein": 2.7, "carbs": 28, "fat": 0.3, "category": "Carb", "diet_type": "veg"},
    "brown rice": {"calories": 112, "protein": 2.6, "carbs": 24, "fat": 0.9, "category": "Carb", "diet_type": "veg"},
    "roti": {"calories": 297, "protein": 8.1, "carbs": 56, "fat": 3.7, "category": "Carb", "diet_type": "veg"},
    "oats": {"calories": 389, "protein": 16.9, "carbs": 66.3, "fat": 6.9, "category": "Carb", "diet_type": "veg"},
    "sweet potato": {"calories": 86, "protein": 1.6, "carbs": 20, "fat": 0.1, "category": "Carb", "diet_type": "veg"},
    "kabab": {"calories": 205, "protein": 17, "carbs": 8, "fat": 12, "category": "Protein", "diet_type": "non-veg"},
    "seekh kabab": {"calories": 210, "protein": 18, "carbs": 6, "fat": 13, "category": "Protein", "diet_type": "non-veg"},
    "fish": {"calories": 206, "protein": 22, "carbs": 0, "fat": 12, "category": "Protein", "diet_type": "non-veg"},
    "grilled fish": {"calories": 150, "protein": 26, "carbs": 0, "fat": 5, "category": "Protein", "diet_type": "non-veg"},
    "tofu": {"calories": 76, "protein": 8, "carbs": 1.9, "fat": 4.8, "category": "Protein", "diet_type": "veg"},
    "quinoa": {"calories": 120, "protein": 4.4, "carbs": 21.3, "fat": 1.9, "category": "Carb", "diet_type": "veg"},
    "avocado": {"calories": 160, "protein": 2, "carbs": 9, "fat": 15, "category": "Fat", "diet_type": "veg"},
    "almonds": {"calories": 579, "protein": 21, "carbs": 22, "fat": 50, "category": "Fat", "diet_type": "veg"},
    "peanut butter": {"calories": 588, "protein": 25, "carbs": 20, "fat": 50, "category": "Fat", "diet_type": "veg"},
    "ghee": {"calories": 900, "protein": 0, "carbs": 0, "fat": 100, "category": "Fat", "diet_type": "veg"},
    "salad": {"calories": 20, "protein": 1.5, "carbs": 3.5, "fat": 0.2, "category": "Carb", "diet_type": "veg"},
    "broccoli": {"calories": 34, "protein": 2.8, "carbs": 7, "fat": 0.4, "category": "Carb", "diet_type": "veg"},
    "spinach": {"calories": 23, "protein": 2.9, "carbs": 3.6, "fat": 0.4, "category": "Carb", "diet_type": "veg"},
    "milk": {"calories": 42, "protein": 3.4, "carbs": 5, "fat": 1, "category": "Protein", "diet_type": "veg"},
    "curd": {"calories": 98, "protein": 11, "carbs": 3.4, "fat": 4.3, "category": "Protein", "diet_type": "veg"},
    "greek yogurt": {"calories": 59, "protein": 10, "carbs": 3.6, "fat": 0.7, "category": "Protein", "diet_type": "veg"},
    "whey protein": {"calories": 400, "protein": 80, "carbs": 10, "fat": 5, "category": "Protein", "diet_type": "veg"},
    "banana": {"calories": 89, "protein": 1.1, "carbs": 23, "fat": 0.3, "category": "Carb", "diet_type": "veg"},
    "apple": {"calories": 52, "protein": 0.3, "carbs": 14, "fat": 0.2, "category": "Carb", "diet_type": "veg"},
    "chickpeas": {"calories": 164, "protein": 8.9, "carbs": 27.4, "fat": 2.6, "category": "Protein", "diet_type": "veg"},
    "rajma": {"calories": 127, "protein": 8.7, "carbs": 22.8, "fat": 0.5, "category": "Protein", "diet_type": "veg"},
    "soya chunks": {"calories": 345, "protein": 52, "carbs": 33, "fat": 0.5, "category": "Protein", "diet_type": "veg"},
    "mushroom": {"calories": 22, "protein": 3.1, "carbs": 3.3, "fat": 0.3, "category": "Protein", "diet_type": "veg"},
    "cottage cheese": {"calories": 98, "protein": 11, "carbs": 3.4, "fat": 4.3, "category": "Protein", "diet_type": "veg"},
    "peanuts": {"calories": 567, "protein": 26, "carbs": 16, "fat": 49, "category": "Fat", "diet_type": "veg"},
    "olive oil": {"calories": 884, "protein": 0, "carbs": 0, "fat": 100, "category": "Fat", "diet_type": "veg"},
    "makhana": {"calories": 347, "protein": 9.7, "carbs": 76.9, "fat": 0.1, "category": "Carb", "diet_type": "veg"},
    "sprouts": {"calories": 31, "protein": 3.0, "carbs": 5.9, "fat": 0.2, "category": "Protein", "diet_type": "veg"},
}

# ========== PYDANTIC MODELS ==========
class UserRegister(BaseModel):
    email: str
    password: str
    name: str
    role: str = "customer"

class UserLogin(BaseModel):
    email: str
    password: str

class UserGoals(BaseModel):
    fitness_goal: str = "maintenance"
    daily_calories: int = 2000
    daily_protein: int = 100
    daily_carbs: int = 250
    daily_fat: int = 65

class ProductCreate(BaseModel):
    name: str
    cost_per_100g: float
    available_qty_grams: Optional[float] = 10000
    image_url: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None  # Admin can select category
    diet_type: Optional[str] = None  # "veg" or "non-veg"

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    cost_per_100g: Optional[float] = None
    available_qty_grams: Optional[float] = None
    is_active: Optional[bool] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    diet_type: Optional[str] = None
    description: Optional[str] = None

class OrderItem(BaseModel):
    product_id: str
    product_name: str
    grams: float
    price: float
    calories: float
    protein: float
    carbs: float
    fat: float
    # For ready-made dishes
    product_type: Optional[str] = "single"  # "single" or "ready_made"
    quantity: Optional[int] = 1  # number of plates for ready-made
    ingredients_breakdown: Optional[List[Dict[str, Any]]] = None  # detailed breakdown for kitchen
    customized_ingredients: Optional[List[Dict[str, Any]]] = None  # if customer modified

class OrderCreate(BaseModel):
    order_type: str
    items: List[OrderItem]
    total_price: float
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float
    fitness_goal: Optional[str] = None
    budget: Optional[float] = None

class AISuggestRequest(BaseModel):
    goal: str
    budget: Optional[float] = None
    selected_items: List[Dict[str, Any]]
    current_nutrition: Dict[str, float]

class QuickMealRequest(BaseModel):
    diet_preference: str  # "veg", "non-veg", "both"
    goal: str  # "fat_loss", "muscle_gain", "maintenance"
    budget: Optional[float] = None
    order_type: str = "dine-in"

class SingleProductCreate(BaseModel):
    name: str
    price: float
    grams: float

class IngredientItem(BaseModel):
    name: str
    grams_per_serving: float
    product_id: Optional[str] = None  # links to single product for stock deduction

class ReadyMadeMealCreate(BaseModel):
    name: str
    ingredients: List[IngredientItem]  # Now includes grams per serving
    images: List[str] = []  # base64 encoded images
    price: float
    serving_grams: float = 300
    is_editable: bool = False  # Whether customer can modify ingredients

class ReadyMadeOrderItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int  # number of plates
    price: float
    calories: float
    protein: float
    carbs: float
    fat: float
    ingredients_breakdown: List[Dict[str, Any]] = []  # Detailed ingredient info for kitchen
    customized_ingredients: Optional[List[Dict[str, Any]]] = None  # For editable dishes

# ========== CATEGORY MODELS ==========
class CategoryCreate(BaseModel):
    name: str
    key: Optional[str] = None  # Short key like "Protein", "Carb"
    label: Optional[str] = None  # Display label
    icon: str = "grid"  # Ionicons icon name
    color: str = "#E23744"  # Hex color
    image_url: Optional[str] = None  # Category image
    description: Optional[str] = None
    sort_order: int = 0  # Display order

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    key: Optional[str] = None
    label: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None

# ========== AUTH UTILS ==========
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, role: str) -> str:
    payload = {"user_id": user_id, "role": role, "exp": datetime.now(timezone.utc).timestamp() + 86400 * 7}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def match_nutrition(product_name: str) -> Dict:
    name_lower = product_name.lower().strip()
    if name_lower in NUTRITION_DB:
        return NUTRITION_DB[name_lower]
    for key, val in NUTRITION_DB.items():
        if key in name_lower or name_lower in key:
            return val
    for key, val in NUTRITION_DB.items():
        words = name_lower.split()
        for word in words:
            if len(word) > 3 and word in key:
                return val
    return {"calories": 100, "protein": 5, "carbs": 15, "fat": 3, "category": "Other", "diet_type": detect_diet_type(product_name)}

# ========== AUTH ROUTES ==========

# OTP Storage (in production, use Redis with TTL)
otp_store: Dict[str, Dict] = {}

def generate_otp() -> str:
    """Generate 6-digit OTP"""
    import random
    return str(random.randint(100000, 999999))

async def send_otp_sms(phone: str, otp: str) -> bool:
    """Send OTP via SMS - Mock for now, can switch to MSG91 later"""
    # TODO: Uncomment below for MSG91 integration
    # import httpx
    # MSG91_AUTH_KEY = os.environ.get("MSG91_AUTH_KEY")
    # MSG91_TEMPLATE_ID = os.environ.get("MSG91_TEMPLATE_ID")
    # MSG91_SENDER_ID = os.environ.get("MSG91_SENDER_ID", "DIETCF")
    # 
    # if MSG91_AUTH_KEY and MSG91_TEMPLATE_ID:
    #     try:
    #         async with httpx.AsyncClient() as client:
    #             response = await client.post(
    #                 "https://api.msg91.com/api/v5/otp",
    #                 headers={"authkey": MSG91_AUTH_KEY},
    #                 json={
    #                     "template_id": MSG91_TEMPLATE_ID,
    #                     "mobile": f"91{phone}",
    #                     "otp": otp,
    #                     "sender": MSG91_SENDER_ID,
    #                 }
    #             )
    #             return response.status_code == 200
    #     except Exception as e:
    #         logger.error(f"MSG91 error: {e}")
    #         return False
    
    # Mock OTP - In production, remove this and use MSG91 above
    logger.info(f"📱 MOCK OTP for {phone}: {otp}")
    return True

class OTPSendRequest(BaseModel):
    phone: str
    name: Optional[str] = None  # For new user registration

class OTPVerifyRequest(BaseModel):
    phone: str
    otp: str
    name: Optional[str] = None  # For new user registration

@api_router.post("/auth/otp/send")
async def send_otp(data: OTPSendRequest):
    """Send OTP to phone number"""
    phone = data.phone.strip().replace(" ", "").replace("-", "")
    
    # Validate phone number (10 digits for India)
    if not phone.isdigit() or len(phone) != 10:
        raise HTTPException(status_code=400, detail="Invalid phone number. Enter 10 digits.")
    
    # Generate OTP
    otp = generate_otp()
    
    # Store OTP with expiry (5 minutes)
    otp_store[phone] = {
        "otp": otp,
        "expires_at": datetime.now(timezone.utc).timestamp() + 300,  # 5 minutes
        "attempts": 0,
        "name": data.name
    }
    
    # Send OTP via SMS
    sent = await send_otp_sms(phone, otp)
    
    if not sent:
        raise HTTPException(status_code=500, detail="Failed to send OTP. Please try again.")
    
    # For DEMO: Return OTP in response (REMOVE IN PRODUCTION!)
    return {
        "message": "OTP sent successfully",
        "phone": phone,
        "demo_otp": otp,  # REMOVE THIS IN PRODUCTION
        "expires_in": 300
    }

@api_router.post("/auth/otp/verify")
async def verify_otp(data: OTPVerifyRequest):
    """Verify OTP and login/register user"""
    phone = data.phone.strip().replace(" ", "").replace("-", "")
    
    # Check if OTP exists
    if phone not in otp_store:
        raise HTTPException(status_code=400, detail="OTP expired or not sent. Please request new OTP.")
    
    stored = otp_store[phone]
    
    # Check expiry
    if datetime.now(timezone.utc).timestamp() > stored["expires_at"]:
        del otp_store[phone]
        raise HTTPException(status_code=400, detail="OTP expired. Please request new OTP.")
    
    # Check attempts (max 3)
    if stored["attempts"] >= 3:
        del otp_store[phone]
        raise HTTPException(status_code=400, detail="Too many wrong attempts. Please request new OTP.")
    
    # Verify OTP
    if data.otp != stored["otp"]:
        otp_store[phone]["attempts"] += 1
        remaining = 3 - otp_store[phone]["attempts"]
        raise HTTPException(status_code=400, detail=f"Invalid OTP. {remaining} attempts remaining.")
    
    # OTP verified - clean up
    del otp_store[phone]
    
    # Check if user exists
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    
    if user:
        # Existing user - login
        token = create_token(user["id"], user["role"])
        return {
            "token": token,
            "user": {
                "id": user["id"], 
                "phone": user["phone"], 
                "name": user["name"],
                "email": user.get("email"),
                "role": user["role"], 
                "fitness_goal": user.get("fitness_goal", "maintenance"),
                "daily_calories": user.get("daily_calories", 2000),
                "daily_protein": user.get("daily_protein", 100),
                "daily_carbs": user.get("daily_carbs", 250),
                "daily_fat": user.get("daily_fat", 65)
            },
            "is_new_user": False
        }
    else:
        # New user - register
        user_id = str(uuid.uuid4())
        name = data.name or stored.get("name") or f"User{phone[-4:]}"
        
        new_user = {
            "id": user_id,
            "phone": phone,
            "name": name,
            "email": None,
            "role": "customer",
            "fitness_goal": "maintenance",
            "daily_calories": 2000,
            "daily_protein": 100,
            "daily_carbs": 250,
            "daily_fat": 65,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(new_user)
        
        token = create_token(user_id, "customer")
        return {
            "token": token,
            "user": {
                "id": user_id, 
                "phone": phone, 
                "name": name,
                "email": None,
                "role": "customer", 
                "fitness_goal": "maintenance",
                "daily_calories": 2000,
                "daily_protein": 100,
                "daily_carbs": 250,
                "daily_fat": 65
            },
            "is_new_user": True
        }

@api_router.post("/auth/otp/resend")
async def resend_otp(data: OTPSendRequest):
    """Resend OTP to phone number"""
    phone = data.phone.strip().replace(" ", "").replace("-", "")
    
    # Rate limiting - check if previous OTP was sent within 30 seconds
    if phone in otp_store:
        time_diff = otp_store[phone]["expires_at"] - 300 + 30  # Original send time + 30 sec
        if datetime.now(timezone.utc).timestamp() < time_diff:
            raise HTTPException(status_code=429, detail="Please wait 30 seconds before requesting new OTP.")
    
    # Generate and send new OTP
    return await send_otp(data)

# Keep existing email/password login for admin
@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": data.email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": data.role,
        "fitness_goal": "maintenance",
        "daily_calories": 2000,
        "daily_protein": 100,
        "daily_carbs": 250,
        "daily_fat": 65,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    token = create_token(user_id, data.role)
    return {
        "token": token,
        "user": {
            "id": user_id, "email": data.email, "name": data.name,
            "role": data.role, "fitness_goal": "maintenance",
            "daily_calories": 2000, "daily_protein": 100,
            "daily_carbs": 250, "daily_fat": 65
        }
    }

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"], "email": user["email"], "name": user["name"],
            "role": user["role"], "fitness_goal": user.get("fitness_goal", "maintenance"),
            "daily_calories": user.get("daily_calories", 2000),
            "daily_protein": user.get("daily_protein", 100),
            "daily_carbs": user.get("daily_carbs", 250),
            "daily_fat": user.get("daily_fat", 65)
        }
    }

@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {
        "id": user["id"], "email": user["email"], "name": user["name"],
        "role": user["role"], "fitness_goal": user.get("fitness_goal", "maintenance"),
        "daily_calories": user.get("daily_calories", 2000),
        "daily_protein": user.get("daily_protein", 100),
        "daily_carbs": user.get("daily_carbs", 250),
        "daily_fat": user.get("daily_fat", 65)
    }

# ========== PRODUCT ROUTES ==========
@api_router.post("/products")
async def create_product(data: ProductCreate, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    nutrition = match_nutrition(data.name)
    product_id = str(uuid.uuid4())
    import random
    product = {
        "id": product_id,
        "name": data.name,
        "cost_per_100g": data.cost_per_100g,
        "available_qty_grams": data.available_qty_grams or 10000,
        "category": nutrition["category"],
        "diet_type": nutrition.get("diet_type", detect_diet_type(data.name)),
        "calories_per_100g": nutrition["calories"],
        "protein_per_100g": nutrition["protein"],
        "carbs_per_100g": nutrition["carbs"],
        "fat_per_100g": nutrition["fat"],
        "is_active": True,
        "image_url": data.image_url,
        "description": data.description or "",
        "rating": round(random.uniform(3.5, 4.9), 1),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product)
    return {k: v for k, v in product.items() if k != "_id"}

@api_router.get("/products")
async def list_products():
    products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(100)
    for p in products:
        if p.get("available_qty_grams", 0) <= 0:
            continue
    return products

@api_router.get("/products/all")
async def list_all_products(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    products = await db.products.find({}, {"_id": 0}).to_list(200)
    return products

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductUpdate, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if "name" in update_data:
        nutrition = match_nutrition(update_data["name"])
        update_data["category"] = nutrition["category"]
        update_data["calories_per_100g"] = nutrition["calories"]
        update_data["protein_per_100g"] = nutrition["protein"]
        update_data["carbs_per_100g"] = nutrition["carbs"]
        update_data["fat_per_100g"] = nutrition["fat"]
    if update_data:
        await db.products.update_one({"id": product_id}, {"$set": update_data})
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}

# ========== CATEGORY MANAGEMENT ==========
@api_router.get("/categories")
async def get_categories():
    """Get all active categories for menu sidebar"""
    categories = await db.categories.find({"is_active": {"$ne": False}}, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return categories

@api_router.get("/categories/all")
async def get_all_categories(user=Depends(get_current_user)):
    """Admin: Get all categories including inactive"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    categories = await db.categories.find({}, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return categories

@api_router.post("/categories")
async def create_category(category: CategoryCreate, user=Depends(get_current_user)):
    """Admin: Create a new category"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Generate key from name if not provided
    key = category.key or category.name.replace(" ", "_").upper()
    label = category.label or category.name
    
    cat_doc = {
        "id": str(uuid.uuid4()),
        "name": category.name,
        "key": key,
        "label": label,
        "icon": category.icon,
        "color": category.color,
        "image_url": category.image_url,
        "description": category.description,
        "sort_order": category.sort_order,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"]
    }
    await db.categories.insert_one(cat_doc)
    del cat_doc["_id"]
    return cat_doc

@api_router.put("/categories/{category_id}")
async def update_category(category_id: str, update: CategoryUpdate, user=Depends(get_current_user)):
    """Admin: Update a category"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user["id"]
    
    result = await db.categories.update_one({"id": category_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    return updated

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, user=Depends(get_current_user)):
    """Admin: Delete a category (soft delete)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    result = await db.categories.update_one(
        {"id": category_id}, 
        {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

@api_router.post("/categories/seed-defaults")
async def seed_default_categories(user=Depends(get_current_user)):
    """Admin: Seed default categories if none exist"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    count = await db.categories.count_documents({})
    if count > 0:
        return {"message": f"{count} categories already exist", "seeded": 0}
    
    default_categories = [
        {"name": "Protein", "key": "Protein", "label": "High Protein", "icon": "barbell", "color": "#E23744", 
         "image_url": "https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=80&h=80&fit=crop", "sort_order": 1},
        {"name": "Carb", "key": "Carb", "label": "Healthy Carbs", "icon": "leaf", "color": "#FF9F0A",
         "image_url": "https://images.unsplash.com/photo-1536304929831-ee1ca9d44726?w=80&h=80&fit=crop", "sort_order": 2},
        {"name": "Fat", "key": "Fat", "label": "Good Fats", "icon": "water", "color": "#5B5FE0",
         "image_url": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=80&h=80&fit=crop", "sort_order": 3},
        {"name": "Meal", "key": "Meal", "label": "Ready Meals", "icon": "fast-food", "color": "#267E3E",
         "image_url": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=80&h=80&fit=crop", "sort_order": 4},
        {"name": "Veg", "key": "veg", "label": "Veg Only", "icon": "nutrition", "color": "#4CAF50",
         "image_url": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=80&h=80&fit=crop", "sort_order": 5},
        {"name": "Non-Veg", "key": "non-veg", "label": "Non-Veg", "icon": "flame", "color": "#E23744",
         "image_url": "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=80&h=80&fit=crop", "sort_order": 6},
    ]
    
    for cat in default_categories:
        cat["id"] = str(uuid.uuid4())
        cat["is_active"] = True
        cat["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.categories.insert_many(default_categories)
    return {"message": "Default categories seeded", "seeded": len(default_categories)}

# ========== FOOD IMAGE BANK ==========
FOOD_IMAGES = {
    "chicken": "https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=400&h=300&fit=crop",
    "paneer": "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400&h=300&fit=crop",
    "egg": "https://images.unsplash.com/photo-1582169296194-e4d644c48063?w=400&h=300&fit=crop",
    "rice": "https://images.unsplash.com/photo-1536304929831-ee1ca9d44726?w=400&h=300&fit=crop",
    "dal": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop",
    "lentil": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop",
    "oats": "https://images.unsplash.com/photo-1517673400267-0251440c45dc?w=400&h=300&fit=crop",
    "kabab": "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=300&fit=crop",
    "fish": "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=300&fit=crop",
    "sweet potato": "https://images.unsplash.com/photo-1596097635121-14b38c5d7a62?w=400&h=300&fit=crop",
    "yogurt": "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=300&fit=crop",
    "salad": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop",
    "sprout": "https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=400&h=300&fit=crop",
    "quinoa": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=300&fit=crop",
    "soya": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&h=300&fit=crop",
    "almond": "https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=400&h=300&fit=crop",
    "banana": "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&h=300&fit=crop",
    "tofu": "https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?w=400&h=300&fit=crop",
    "mushroom": "https://images.unsplash.com/photo-1504545102780-26774c1bb073?w=400&h=300&fit=crop",
    "broccoli": "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=400&h=300&fit=crop",
    "spinach": "https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400&h=300&fit=crop",
    "avocado": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=400&h=300&fit=crop",
    "milk": "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=300&fit=crop",
    "roti": "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=300&fit=crop",
    "biryani": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&h=300&fit=crop",
    "curry": "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=400&h=300&fit=crop",
    "soup": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=300&fit=crop",
    "sandwich": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=300&fit=crop",
    "wrap": "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&h=300&fit=crop",
    "smoothie": "https://images.unsplash.com/photo-1505252585461-04db1eb84625?w=400&h=300&fit=crop",
    "bowl": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop",
    "protein": "https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=400&h=300&fit=crop",
    "default": "https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=400&h=300&fit=crop",
}

def find_food_image(name: str) -> str:
    name_lower = name.lower()
    for key, url in FOOD_IMAGES.items():
        if key in name_lower:
            return url
    return FOOD_IMAGES["default"]

# ========== AI IMAGE GENERATION ==========
async def ai_generate_food_image(product_name: str, product_type: str, ingredients: List[str] = None) -> str:
    """Generate a food product image using OpenAI gpt-image-1, return as base64 data URI"""
    try:
        from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
        api_key = os.environ.get('EMERGENT_LLM_KEY', '')
        if not api_key:
            return find_food_image(product_name)  # fallback

        image_gen = OpenAIImageGeneration(api_key=api_key)

        if product_type == "ready_made" and ingredients:
            prompt = f"Professional food photography of an Indian dish called '{product_name}' made with {', '.join(ingredients)}. Served beautifully on a clean plate, top-down view, soft natural lighting, restaurant quality, appetizing and vibrant colors, white background."
        else:
            prompt = f"Professional food photography of fresh {product_name} for a fitness diet café. Clean minimalist presentation, top-down view, soft natural lighting, vibrant colors, white clean background, restaurant quality."

        images = await image_gen.generate_images(
            prompt=prompt,
            model="gpt-image-1",
            number_of_images=1
        )

        if images and len(images) > 0:
            image_base64 = base64.b64encode(images[0]).decode('utf-8')
            return f"data:image/png;base64,{image_base64}"
        else:
            return find_food_image(product_name)
    except Exception as e:
        logger.error(f"AI image generation error: {e}")
        return find_food_image(product_name)  # fallback to static bank

# ========== AI-POWERED PRODUCT CREATION ==========
async def ai_generate_description(product_name: str, product_type: str, ingredients: List[str] = None) -> str:
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        if product_type == "ready_made" and ingredients:
            prompt = f"""Generate a SHORT appealing food description (max 15 words) for a dish called "{product_name}" made with: {', '.join(ingredients)}. Focus on taste, health benefits, and appeal. Just the description, no quotes."""
        else:
            prompt = f"""Generate a SHORT appealing food description (max 15 words) for a product called "{product_name}" for a fitness/diet café. Focus on health benefits. Just the description, no quotes."""
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY', ''),
            session_id=f"desc-{uuid.uuid4()}",
            system_message="You are a food copywriter. Write SHORT, appealing descriptions. No quotes or special formatting."
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=prompt))
        return response.strip().strip('"').strip("'")[:100]
    except Exception as e:
        logger.error(f"AI description error: {e}")
        return f"Fresh {product_name}, nutritious and delicious"

async def ai_calculate_ready_made_nutrition(dish_name: str, ingredients: List[Dict]) -> Dict:
    """Use NUTRITION_DB to calculate combined nutrition for a ready-made meal based on actual grams"""
    total_cal, total_protein, total_carbs, total_fat = 0, 0, 0, 0
    total_grams = 0
    for ing in ingredients:
        ing_name = ing.get("name", "") if isinstance(ing, dict) else ing
        ing_grams = ing.get("grams_per_serving", 100) if isinstance(ing, dict) else 100
        nutrition = match_nutrition(ing_name)
        # Calculate based on actual grams
        factor = ing_grams / 100
        total_cal += nutrition["calories"] * factor
        total_protein += nutrition["protein"] * factor
        total_carbs += nutrition["carbs"] * factor
        total_fat += nutrition["fat"] * factor
        total_grams += ing_grams
    if total_grams == 0:
        return {"calories": 250, "protein": 15, "carbs": 30, "fat": 8, "category": "Meal"}
    category = "Protein" if total_protein > total_carbs else "Carb" if total_carbs > total_fat else "Meal"
    # Normalize to per 100g for consistency
    return {
        "calories": round(total_cal / total_grams * 100, 1),
        "protein": round(total_protein / total_grams * 100, 1),
        "carbs": round(total_carbs / total_grams * 100, 1),
        "fat": round(total_fat / total_grams * 100, 1),
        "total_calories": round(total_cal, 1),
        "total_protein": round(total_protein, 1),
        "total_carbs": round(total_carbs, 1),
        "total_fat": round(total_fat, 1),
        "category": category
    }

@api_router.post("/products/single")
async def create_single_product(data: SingleProductCreate, user=Depends(get_current_user)):
    """Create single product with AI: auto cost-per-gram, AI-generated photo, nutrition, description"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    import random
    nutrition = match_nutrition(data.name)
    cost_per_100g = round((data.price / data.grams) * 100, 2)
    # AI generates description and image in parallel
    description = await ai_generate_description(data.name, "single")
    image_url = await ai_generate_food_image(data.name, "single")
    product_id = str(uuid.uuid4())
    product = {
        "id": product_id,
        "name": data.name,
        "product_type": "single",
        "cost_per_100g": cost_per_100g,
        "base_price": data.price,
        "base_grams": data.grams,
        "available_qty_grams": data.grams,
        "category": nutrition["category"],
        "diet_type": nutrition.get("diet_type", detect_diet_type(data.name)),
        "calories_per_100g": nutrition["calories"],
        "protein_per_100g": nutrition["protein"],
        "carbs_per_100g": nutrition["carbs"],
        "fat_per_100g": nutrition["fat"],
        "is_active": True,
        "image_url": image_url,
        "description": description,
        "rating": round(random.uniform(3.8, 4.9), 1),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product)
    return {k: v for k, v in product.items() if k != "_id"}

@api_router.post("/products/ready-made")
async def create_ready_made_meal(data: ReadyMadeMealCreate, user=Depends(get_current_user)):
    """Create ready-made meal with AI description, AI-generated image, and auto nutrition"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    import random
    
    # Convert ingredients to list format for nutrition calculation
    ingredients_list = [{"name": ing.name, "grams_per_serving": ing.grams_per_serving} for ing in data.ingredients]
    ingredient_names = [ing.name for ing in data.ingredients]
    
    # Try to link ingredients to existing single products for stock tracking
    linked_ingredients = []
    for ing in data.ingredients:
        # Find matching single product
        product = await db.products.find_one({
            "product_type": "single",
            "name": {"$regex": f"^{ing.name}$", "$options": "i"},
            "is_active": True
        }, {"_id": 0})
        linked_ingredients.append({
            "name": ing.name,
            "grams_per_serving": ing.grams_per_serving,
            "product_id": product["id"] if product else None,
            "linked": product is not None
        })
    
    nutrition = await ai_calculate_ready_made_nutrition(data.name, ingredients_list)
    cost_per_100g = round((data.price / data.serving_grams) * 100, 2)
    description = await ai_generate_description(data.name, "ready_made", ingredient_names)
    
    # Use admin-uploaded image (base64) if provided, else AI generates one
    if data.images and len(data.images) > 0:
        image_url = data.images[0]
    else:
        image_url = await ai_generate_food_image(data.name, "ready_made", ingredient_names)
    
    # Check non-veg from ingredients
    all_ingredients_text = " ".join(ingredient_names).lower()
    is_nonveg = any(kw in all_ingredients_text for kw in NON_VEG_KEYWORDS) or detect_diet_type(data.name) == "non-veg"
    
    product_id = str(uuid.uuid4())
    product = {
        "id": product_id,
        "name": data.name,
        "product_type": "ready_made",
        "cost_per_100g": cost_per_100g,
        "fixed_price": data.price,
        "serving_grams": data.serving_grams,
        "ingredients": linked_ingredients,  # Now stores grams per serving with product links
        "images": data.images,
        "is_editable": data.is_editable,  # Whether customer can modify
        "available_servings": 20,  # Number of plates available (will check ingredient stock)
        "category": nutrition["category"],
        "diet_type": "non-veg" if is_nonveg else "veg",
        "calories_per_100g": nutrition["calories"],
        "protein_per_100g": nutrition["protein"],
        "carbs_per_100g": nutrition["carbs"],
        "fat_per_100g": nutrition["fat"],
        "total_calories_per_serving": nutrition.get("total_calories", 0),
        "total_protein_per_serving": nutrition.get("total_protein", 0),
        "total_carbs_per_serving": nutrition.get("total_carbs", 0),
        "total_fat_per_serving": nutrition.get("total_fat", 0),
        "is_active": True,
        "image_url": image_url,
        "description": description,
        "rating": round(random.uniform(3.8, 4.9), 1),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product)
    return {k: v for k, v in product.items() if k != "_id"}

# ========== STOCK CHECK FOR READY-MADE DISHES ==========
async def check_ready_made_stock(product_id: str, quantity: int = 1) -> Dict:
    """Check if all ingredients have sufficient stock for the requested quantity"""
    product = await db.products.find_one({"id": product_id, "product_type": "ready_made"}, {"_id": 0})
    if not product:
        return {"available": False, "reason": "Product not found"}
    
    insufficient = []
    for ing in product.get("ingredients", []):
        if ing.get("product_id"):
            single_product = await db.products.find_one({"id": ing["product_id"]}, {"_id": 0})
            if single_product:
                required_grams = ing["grams_per_serving"] * quantity
                available = single_product.get("available_qty_grams", 0)
                if available < required_grams:
                    insufficient.append({
                        "name": ing["name"],
                        "required": required_grams,
                        "available": available
                    })
    
    if insufficient:
        return {"available": False, "reason": "Insufficient stock", "items": insufficient}
    return {"available": True}

@api_router.get("/products/{product_id}/check-stock")
async def check_product_stock(product_id: str, quantity: int = 1):
    """Check stock availability for a ready-made dish"""
    return await check_ready_made_stock(product_id, quantity)

# ========== ORDER ROUTES ==========
@api_router.post("/orders")
async def create_order(data: OrderCreate, user=Depends(get_current_user)):
    order_id = str(uuid.uuid4())[:8].upper()
    extra_charge = 0
    if data.order_type == "takeaway":
        extra_charge = 10
    elif data.order_type == "delivery":
        extra_charge = 30
    
    # Process items and build order with ingredient breakdowns for kitchen
    processed_items = []
    for item in data.items:
        item_data = item.dict()
        
        # For ready-made dishes, check stock and add ingredient breakdown
        if item.product_type == "ready_made":
            product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
            if product:
                quantity = item.quantity or 1
                
                # Check ingredient stock before creating order
                stock_check = await check_ready_made_stock(item.product_id, quantity)
                if not stock_check.get("available", False):
                    raise HTTPException(status_code=400, detail=f"Insufficient stock for {item.product_name}: {stock_check.get('reason')}")
                
                # Build ingredient breakdown for kitchen view
                ingredients_breakdown = []
                for ing in product.get("ingredients", []):
                    total_grams = ing["grams_per_serving"] * quantity
                    ingredients_breakdown.append({
                        "name": ing["name"],
                        "grams_per_serving": ing["grams_per_serving"],
                        "total_grams": total_grams,
                        "product_id": ing.get("product_id")
                    })
                item_data["ingredients_breakdown"] = ingredients_breakdown
                
                # Deduct from linked single product stocks
                for ing in product.get("ingredients", []):
                    if ing.get("product_id"):
                        deduct_grams = ing["grams_per_serving"] * quantity
                        await db.products.update_one(
                            {"id": ing["product_id"]},
                            {"$inc": {"available_qty_grams": -deduct_grams}}
                        )
        else:
            # Single product - deduct directly
            await db.products.update_one(
                {"id": item.product_id},
                {"$inc": {"available_qty_grams": -item.grams}}
            )
        
        processed_items.append(item_data)
    
    order = {
        "id": order_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "order_type": data.order_type,
        "items": processed_items,
        "total_price": data.total_price + extra_charge,
        "extra_charge": extra_charge,
        "total_calories": data.total_calories,
        "total_protein": data.total_protein,
        "total_carbs": data.total_carbs,
        "total_fat": data.total_fat,
        "fitness_goal": data.fitness_goal,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.orders.insert_one(order)
    
    # Auto-hide low stock single products
    await db.products.update_many(
        {"product_type": "single", "available_qty_grams": {"$lte": 0}},
        {"$set": {"is_active": False}}
    )
    
    # Auto-hide ready-made dishes that can't be made anymore
    ready_made_products = await db.products.find({"product_type": "ready_made", "is_active": True}, {"_id": 0}).to_list(100)
    for rm in ready_made_products:
        for ing in rm.get("ingredients", []):
            if ing.get("product_id"):
                single_product = await db.products.find_one({"id": ing["product_id"]}, {"_id": 0})
                if single_product and single_product.get("available_qty_grams", 0) < ing["grams_per_serving"]:
                    await db.products.update_one({"id": rm["id"]}, {"$set": {"is_active": False}})
                    break
    
    # Save to meal history
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.meal_history.update_one(
        {"user_id": user["id"], "date": today},
        {"$push": {"meals": {"order_id": order_id, "calories": data.total_calories,
                             "protein": data.total_protein, "carbs": data.total_carbs,
                             "fat": data.total_fat, "time": datetime.now(timezone.utc).isoformat()}},
         "$inc": {"total_calories": data.total_calories, "total_protein": data.total_protein,
                  "total_carbs": data.total_carbs, "total_fat": data.total_fat}},
        upsert=True
    )
    return {k: v for k, v in order.items() if k != "_id"}

@api_router.get("/orders")
async def list_orders(user=Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return orders

@api_router.get("/orders/kitchen")
async def kitchen_orders(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    orders = await db.orders.find(
        {"status": {"$in": ["pending", "preparing"]}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    return orders

@api_router.get("/orders/all")
async def all_orders(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return orders

@api_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    valid_statuses = ["pending", "preparing", "ready", "completed", "cancelled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": status}})
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

# ========== POPULAR ITEMS (Based on Previous Day Sales) ==========
@api_router.get("/products/popular")
async def get_popular_products(user=Depends(get_current_user)):
    """Get popular products based on previous day orders"""
    from datetime import timedelta
    
    # Get yesterday's date range
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    
    # Get orders from yesterday
    yesterday_orders = await db.orders.find({
        "created_at": {"$gte": yesterday.isoformat(), "$lt": today.isoformat()},
        "status": {"$in": ["completed", "ready", "preparing"]}
    }, {"_id": 0}).to_list(500)
    
    # Count product sales
    product_sales = {}
    for order in yesterday_orders:
        for item in order.get("items", []):
            pid = item.get("product_id")
            if pid:
                product_sales[pid] = product_sales.get(pid, 0) + item.get("quantity", 1)
    
    # Get all active products
    products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(100)
    
    # Sort by sales (products with sales first, then by rating)
    def sort_key(p):
        sales = product_sales.get(p["id"], 0)
        rating = p.get("rating", 0)
        return (-sales, -rating)
    
    sorted_products = sorted(products, key=sort_key)
    
    # Add sales count to each product
    for p in sorted_products:
        p["yesterday_sales"] = product_sales.get(p["id"], 0)
    
    return sorted_products[:12]  # Return top 12

# ========== AI ROUTES ==========
@api_router.post("/ai/suggest")
async def ai_suggest(data: AISuggestRequest, user=Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        products = await db.products.find({"is_active": True, "available_qty_grams": {"$gt": 50}}, {"_id": 0}).to_list(100)
        available_items_str = "\n".join([
            f"- {p['name']}: ₹{p['cost_per_100g']}/100g | {p['calories_per_100g']}cal, {p['protein_per_100g']}g protein, {p['carbs_per_100g']}g carbs, {p['fat_per_100g']}g fat per 100g | Stock: {p['available_qty_grams']}g"
            for p in products
        ])
        selected_str = "\n".join([
            f"- {item['product_name']}: {item.get('grams', 0)}g (₹{item.get('price', 0):.0f})"
            for item in data.selected_items
        ]) if data.selected_items else "None selected yet"
        budget_str = f"Budget: ₹{data.budget}" if data.budget else "No budget set"
        prompt = f"""You are a nutrition expert at a fitness café in India. The customer needs meal suggestions.

Customer Goal: {data.goal}
{budget_str}

Currently Selected Items:
{selected_str}

Current Totals: {data.current_nutrition.get('calories', 0):.0f} cal, {data.current_nutrition.get('protein', 0):.0f}g protein, {data.current_nutrition.get('carbs', 0):.0f}g carbs, {data.current_nutrition.get('fat', 0):.0f}g fat
Current Price: ₹{data.current_nutrition.get('price', 0):.0f}

Available Menu Items:
{available_items_str}

RULES:
- ONLY suggest items from the available menu above
- Suggest specific gram quantities
- Keep within budget if specified
- Optimize for the customer's fitness goal:
  * fat_loss: High protein, low carb, calorie deficit (~1500-1800 cal/day)
  * muscle_gain: High protein, moderate carbs, calorie surplus (~2500-3000 cal/day)
  * maintenance: Balanced macros (~2000-2200 cal/day)

Respond in this exact JSON format:
{{"suggestions": [{{"product_name": "...", "suggested_grams": 100, "reason": "..."}}], "summary": "Brief 1-2 line summary of the suggestion"}}"""

        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY', ''),
            session_id=f"suggest-{uuid.uuid4()}",
            system_message="You are a nutrition expert. Always respond in valid JSON format only."
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=prompt))
        try:
            cleaned = response.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
                cleaned = cleaned.rsplit("```", 1)[0]
            result = json.loads(cleaned)
            return result
        except json.JSONDecodeError:
            return {"suggestions": [], "summary": response[:200]}
    except Exception as e:
        logger.error(f"AI suggestion error: {e}")
        return {"suggestions": [], "summary": "AI suggestion unavailable. Please select items manually."}

# ========== QUICK MEAL (AI BUILD MY MEAL) ==========
@api_router.post("/ai/quick-meal")
async def ai_quick_meal(data: QuickMealRequest, user=Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        # Build product filter
        query = {"is_active": True, "available_qty_grams": {"$gt": 50}}
        if data.diet_preference == "veg":
            query["diet_type"] = "veg"
        elif data.diet_preference == "non-veg":
            query["diet_type"] = "non-veg"
        # "both" = no filter on diet_type

        products = await db.products.find(query, {"_id": 0}).to_list(100)
        if not products:
            return {"meal_items": [], "summary": "No products available for your preference.", "totals": {}}

        available_str = "\n".join([
            f"- {p['name']} ({p.get('diet_type','veg')}): ₹{p['cost_per_100g']}/100g | {p['calories_per_100g']}cal, {p['protein_per_100g']}g protein, {p['carbs_per_100g']}g carbs, {p['fat_per_100g']}g fat per 100g | Stock: {p['available_qty_grams']}g"
            for p in products
        ])
        budget_str = f"Budget: ₹{data.budget}. STRICTLY stay within this budget." if data.budget else "No budget limit, but keep meal reasonable (₹100-₹400 range)."
        diet_pref_str = {"veg": "VEGETARIAN ONLY", "non-veg": "NON-VEGETARIAN ONLY", "both": "Both veg and non-veg allowed"}.get(data.diet_preference, "Both")

        prompt = f"""You are a nutrition expert at a fitness café in India. Build a COMPLETE single meal for this customer.

Diet Preference: {diet_pref_str}
Fitness Goal: {data.goal}
{budget_str}

Available Menu Items:
{available_str}

RULES:
- Build a COMPLETE balanced meal (protein source + carb source + optionally extras like salad/yogurt)
- ONLY use items from the available menu above
- Use the EXACT product names as listed
- Suggest specific gram quantities (multiples of 25g)
- Keep within budget if specified
- For {data.goal}:
  * fat_loss: High protein, low carb, ~400-600 cal total, prioritize lean proteins
  * muscle_gain: High protein, moderate-high carbs, ~700-1000 cal, include carb sources
  * maintenance: Balanced macros, ~500-700 cal, good variety
- Select 3-5 items for a complete meal

Respond ONLY in this exact JSON format (no other text):
{{"meal_items": [{{"product_name": "Exact Name", "grams": 150, "reason": "Brief reason"}}], "summary": "One line meal description"}}"""

        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY', ''),
            session_id=f"quickmeal-{uuid.uuid4()}",
            system_message="You are a nutrition expert. Always respond in valid JSON format only. No markdown, no backticks."
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=prompt))

        # Parse AI response
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            cleaned = cleaned.rsplit("```", 1)[0]
        result = json.loads(cleaned)

        # Enrich with full product data and calculate totals
        enriched_items = []
        totals = {"price": 0, "calories": 0, "protein": 0, "carbs": 0, "fat": 0}
        for ai_item in result.get("meal_items", []):
            product = next((p for p in products if p["name"].lower() == ai_item["product_name"].lower()), None)
            if not product:
                # Fuzzy match
                product = next((p for p in products if ai_item["product_name"].lower() in p["name"].lower() or p["name"].lower() in ai_item["product_name"].lower()), None)
            if product:
                grams = ai_item.get("grams", 100)
                factor = grams / 100
                item_data = {
                    "product_id": product["id"],
                    "product_name": product["name"],
                    "grams": grams,
                    "price": round(factor * product["cost_per_100g"], 2),
                    "calories": round(factor * product["calories_per_100g"], 1),
                    "protein": round(factor * product["protein_per_100g"], 1),
                    "carbs": round(factor * product["carbs_per_100g"], 1),
                    "fat": round(factor * product["fat_per_100g"], 1),
                    "diet_type": product.get("diet_type", "veg"),
                    "image_url": product.get("image_url"),
                    "reason": ai_item.get("reason", ""),
                    "cost_per_100g": product["cost_per_100g"],
                    "calories_per_100g": product["calories_per_100g"],
                    "protein_per_100g": product["protein_per_100g"],
                    "carbs_per_100g": product["carbs_per_100g"],
                    "fat_per_100g": product["fat_per_100g"],
                    "category": product.get("category", ""),
                }
                enriched_items.append(item_data)
                totals["price"] += item_data["price"]
                totals["calories"] += item_data["calories"]
                totals["protein"] += item_data["protein"]
                totals["carbs"] += item_data["carbs"]
                totals["fat"] += item_data["fat"]

        totals = {k: round(v, 1) for k, v in totals.items()}
        return {
            "meal_items": enriched_items,
            "summary": result.get("summary", "AI-built meal"),
            "totals": totals,
            "diet_preference": data.diet_preference,
            "goal": data.goal
        }
    except json.JSONDecodeError:
        logger.error("AI quick-meal JSON parse error")
        return {"meal_items": [], "summary": "Could not parse AI response. Please try again.", "totals": {}}
    except Exception as e:
        logger.error(f"AI quick-meal error: {e}")
        return {"meal_items": [], "summary": "AI meal builder unavailable. Please try the manual menu.", "totals": {}}

# ========== AI CHAT ASSISTANT ==========
class AIChatRequest(BaseModel):
    message: str
    budget: Optional[float] = None
    goal: Optional[str] = "maintenance"
    diet_preference: Optional[str] = "both"
    current_cart: Optional[List[Dict]] = []

@api_router.post("/ai/chat")
async def ai_chat(data: AIChatRequest, user=Depends(get_current_user)):
    """Conversational AI assistant for meal planning and nutrition advice"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Get available products
        query = {"is_active": True, "available_qty_grams": {"$gt": 50}}
        if data.diet_preference == "veg":
            query["diet_type"] = "veg"
        elif data.diet_preference == "non-veg":
            query["diet_type"] = "non-veg"
        
        products = await db.products.find(query, {"_id": 0}).to_list(100)
        
        # Get user's nutrition summary
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        summary = await db.meal_history.find_one({"user_id": user["id"], "date": today}, {"_id": 0})
        consumed_today = {
            "calories": summary.get("total_calories", 0) if summary else 0,
            "protein": summary.get("total_protein", 0) if summary else 0,
            "carbs": summary.get("total_carbs", 0) if summary else 0,
            "fat": summary.get("total_fat", 0) if summary else 0,
        }
        
        # Current cart summary
        cart_summary = ""
        cart_total = {"price": 0, "calories": 0, "protein": 0}
        if data.current_cart:
            cart_items = []
            for item in data.current_cart:
                grams = item.get("grams", 0)
                f = grams / 100
                cart_items.append(f"- {item.get('name', 'Unknown')}: {grams}g (₹{round(f * item.get('cost_per_100g', 0))})")
                cart_total["price"] += f * item.get("cost_per_100g", 0)
                cart_total["calories"] += f * item.get("calories_per_100g", 0)
                cart_total["protein"] += f * item.get("protein_per_100g", 0)
            cart_summary = f"\n\nCurrent Cart ({len(data.current_cart)} items, ₹{round(cart_total['price'])}):\n" + "\n".join(cart_items)
        
        menu_str = "\n".join([
            f"- {p['name']} ({p.get('diet_type','veg')}): ₹{p['cost_per_100g']}/100g | {p['calories_per_100g']}cal, P:{p['protein_per_100g']}g"
            for p in products[:20]  # Limit to avoid token overflow
        ])
        
        budget_str = f"Budget: ₹{data.budget}" if data.budget else "No specific budget"
        
        system_prompt = f"""You are a friendly AI nutritionist at Diet Café. Help customers build healthy, budget-friendly meals.

USER INFO:
- Name: {user.get('name', 'Customer')}
- Goal: {data.goal} ({user.get('fitness_goal', 'maintenance')})
- Diet: {data.diet_preference}
- {budget_str}
- Consumed today: {consumed_today['calories']} cal, {consumed_today['protein']}g protein
- Daily targets: {user.get('daily_calories', 2000)} cal, {user.get('daily_protein', 100)}g protein
{cart_summary}

AVAILABLE MENU (₹ per 100g):
{menu_str}

RULES:
1. Be friendly, brief (2-3 sentences max unless asked for details)
2. When suggesting items, always include: name, grams, and price
3. Keep suggestions within budget when specified
4. For fat_loss: prioritize high protein, low carb
5. For muscle_gain: high protein, moderate carbs
6. Always use EXACT product names from menu
7. If asked about nutrition, give practical advice
8. If asked to add items, respond with JSON at the end like: {{\"add\": [{{\"name\": \"Product Name\", \"grams\": 100}}]}}
9. If customer says "order" or "checkout", respond with: {{\"action\": \"checkout\"}}
10. Keep Indian food culture in mind"""

        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY', ''),
            session_id=f"chat-{user['id']}-{uuid.uuid4().hex[:8]}",
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=data.message))
        
        # Parse any actions from response
        actions = None
        try:
            # Check if response contains JSON action
            if "{" in response and "}" in response:
                json_start = response.rfind("{")
                json_end = response.rfind("}") + 1
                json_str = response[json_start:json_end]
                actions = json.loads(json_str)
                # Remove JSON from displayed message
                response = response[:json_start].strip()
        except:
            pass
        
        # If action is to add items, enrich with product data
        if actions and "add" in actions:
            enriched_add = []
            for item in actions["add"]:
                product = next((p for p in products if p["name"].lower() == item["name"].lower()), None)
                if not product:
                    product = next((p for p in products if item["name"].lower() in p["name"].lower()), None)
                if product:
                    grams = item.get("grams", 100)
                    factor = grams / 100
                    enriched_add.append({
                        "product_id": product["id"],
                        "name": product["name"],
                        "grams": grams,
                        "price": round(factor * product["cost_per_100g"], 2),
                        "calories": round(factor * product["calories_per_100g"], 1),
                        "protein": round(factor * product["protein_per_100g"], 1),
                        "cost_per_100g": product["cost_per_100g"],
                        "calories_per_100g": product["calories_per_100g"],
                        "protein_per_100g": product["protein_per_100g"],
                        "carbs_per_100g": product["carbs_per_100g"],
                        "fat_per_100g": product["fat_per_100g"],
                        "diet_type": product.get("diet_type", "veg"),
                        "image_url": product.get("image_url"),
                    })
            if enriched_add:
                actions["add"] = enriched_add
        
        return {
            "message": response,
            "actions": actions,
        }
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        return {
            "message": "I'm having trouble right now. Please try again or use the Budget Meal Builder!",
            "actions": None
        }

# ========== REORDER ==========
@api_router.post("/orders/{order_id}/reorder")
async def reorder(order_id: str, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # Validate items are still available
    cart_items = []
    unavailable = []
    for item in order.get("items", []):
        product = await db.products.find_one({"id": item["product_id"], "is_active": True}, {"_id": 0})
        if product and product.get("available_qty_grams", 0) >= item["grams"]:
            cart_items.append({
                **item,
                "cost_per_100g": product["cost_per_100g"],
                "calories_per_100g": product["calories_per_100g"],
                "protein_per_100g": product["protein_per_100g"],
                "carbs_per_100g": product["carbs_per_100g"],
                "fat_per_100g": product["fat_per_100g"],
                "category": product.get("category", ""),
                "diet_type": product.get("diet_type", "veg"),
                "image_url": product.get("image_url"),
                "description": product.get("description", ""),
                "rating": product.get("rating", 4.0),
                "available_qty_grams": product.get("available_qty_grams", 0),
                "id": product["id"],
                "name": product["name"],
            })
        else:
            unavailable.append(item["product_name"])
    return {
        "cart_items": cart_items,
        "order_type": order.get("order_type", "dine-in"),
        "unavailable": unavailable
    }

# ========== MIGRATE EXISTING PRODUCTS ==========
@api_router.post("/migrate/diet-type")
async def migrate_diet_type():
    """Add diet_type to all existing products that don't have it"""
    products = await db.products.find({"diet_type": {"$exists": False}}, {"_id": 0}).to_list(500)
    count = 0
    for p in products:
        dt = detect_diet_type(p["name"])
        await db.products.update_one({"id": p["id"]}, {"$set": {"diet_type": dt}})
        count += 1
    return {"message": f"Migrated {count} products with diet_type"}

@api_router.post("/products/{product_id}/regenerate-image")
async def regenerate_product_image(product_id: str, user=Depends(get_current_user)):
    """Regenerate AI image for a specific product"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    ingredients = product.get("ingredients", [])
    product_type = product.get("product_type", "single")
    image_url = await ai_generate_food_image(product["name"], product_type, ingredients if ingredients else None)
    await db.products.update_one({"id": product_id}, {"$set": {"image_url": image_url}})
    return {"message": "Image regenerated", "image_url": image_url}

# ========== USER / NUTRITION ROUTES ==========
@api_router.put("/user/goals")
async def update_goals(data: UserGoals, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": data.dict()})
    return {"message": "Goals updated", **data.dict()}

@api_router.put("/user/profile")
async def update_profile(data: dict = Body(...), user=Depends(get_current_user)):
    allowed = {k: v for k, v in data.items() if k in ("name",)}
    if not allowed:
        raise HTTPException(400, "No valid fields to update")
    await db.users.update_one({"id": user["id"]}, {"$set": allowed})
    return {"message": "Profile updated", **allowed}


@api_router.get("/user/nutrition-summary")
async def nutrition_summary(user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    summary = await db.meal_history.find_one(
        {"user_id": user["id"], "date": today}, {"_id": 0}
    )
    if not summary:
        summary = {"user_id": user["id"], "date": today, "meals": [],
                   "total_calories": 0, "total_protein": 0, "total_carbs": 0, "total_fat": 0}
    goals = {
        "daily_calories": user.get("daily_calories", 2000),
        "daily_protein": user.get("daily_protein", 100),
        "daily_carbs": user.get("daily_carbs", 250),
        "daily_fat": user.get("daily_fat", 65),
        "fitness_goal": user.get("fitness_goal", "maintenance")
    }
    return {
        "date": today,
        "consumed": {
            "calories": summary.get("total_calories", 0),
            "protein": summary.get("total_protein", 0),
            "carbs": summary.get("total_carbs", 0),
            "fat": summary.get("total_fat", 0)
        },
        "goals": goals,
        "meals_count": len(summary.get("meals", []))
    }

@api_router.get("/user/history")
async def meal_history(user=Depends(get_current_user)):
    history = await db.meal_history.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("date", -1).to_list(30)
    return history

# ========== SEED DATA ==========
@api_router.post("/seed")
async def seed_data():
    existing = await db.products.count_documents({})
    if existing > 0:
        return {"message": "Data already seeded"}
    seed_products = [
        {"name": "Chicken Breast", "cost_per_100g": 45, "available_qty_grams": 5000, "description": "Grilled lean chicken breast, high protein", "image_url": "https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=400&h=300&fit=crop"},
        {"name": "Paneer Tikka", "cost_per_100g": 35, "available_qty_grams": 3000, "description": "Spiced cottage cheese, tandoor grilled", "image_url": "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400&h=300&fit=crop"},
        {"name": "Egg White", "cost_per_100g": 15, "available_qty_grams": 4000, "description": "Pure egg whites, zero fat protein", "image_url": "https://images.unsplash.com/photo-1582169296194-e4d644c48063?w=400&h=300&fit=crop"},
        {"name": "Brown Rice", "cost_per_100g": 8, "available_qty_grams": 8000, "description": "Fiber-rich whole grain brown rice", "image_url": "https://images.unsplash.com/photo-1536304929831-ee1ca9d44726?w=400&h=300&fit=crop"},
        {"name": "Dal", "cost_per_100g": 12, "available_qty_grams": 6000, "description": "Protein-rich lentil curry", "image_url": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop"},
        {"name": "Oats", "cost_per_100g": 10, "available_qty_grams": 5000, "description": "Whole grain oats, perfect for breakfast", "image_url": "https://images.unsplash.com/photo-1517673400267-0251440c45dc?w=400&h=300&fit=crop"},
        {"name": "Kabab", "cost_per_100g": 50, "available_qty_grams": 3000, "description": "Smoky seekh kabab, charcoal grilled", "image_url": "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=300&fit=crop"},
        {"name": "Grilled Fish", "cost_per_100g": 55, "available_qty_grams": 2000, "description": "Fresh fish fillet, herb grilled", "image_url": "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=300&fit=crop"},
        {"name": "Sweet Potato", "cost_per_100g": 6, "available_qty_grams": 4000, "description": "Baked sweet potato, complex carbs", "image_url": "https://images.unsplash.com/photo-1596097635121-14b38c5d7a62?w=400&h=300&fit=crop"},
        {"name": "Greek Yogurt", "cost_per_100g": 20, "available_qty_grams": 3000, "description": "Thick creamy yogurt, probiotic rich", "image_url": "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=300&fit=crop"},
        {"name": "Salad", "cost_per_100g": 8, "available_qty_grams": 5000, "description": "Fresh garden salad mix", "image_url": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop"},
        {"name": "Sprouts", "cost_per_100g": 10, "available_qty_grams": 3000, "description": "Mixed sprouts, nutrient dense", "image_url": "https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=400&h=300&fit=crop"},
        {"name": "Quinoa", "cost_per_100g": 25, "available_qty_grams": 2000, "description": "Superfood grain, complete protein", "image_url": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=300&fit=crop"},
        {"name": "Soya Chunks", "cost_per_100g": 12, "available_qty_grams": 3000, "description": "Plant-based protein powerhouse", "image_url": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&h=300&fit=crop"},
        {"name": "Almonds", "cost_per_100g": 80, "available_qty_grams": 1000, "description": "Premium California almonds", "image_url": "https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=400&h=300&fit=crop"},
        {"name": "Banana", "cost_per_100g": 5, "available_qty_grams": 5000, "description": "Natural energy, potassium rich", "image_url": "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&h=300&fit=crop"},
    ]
    for p in seed_products:
        nutrition = match_nutrition(p["name"])
        product = {
            "id": str(uuid.uuid4()),
            "name": p["name"],
            "cost_per_100g": p["cost_per_100g"],
            "available_qty_grams": p["available_qty_grams"],
            "category": nutrition["category"],
            "diet_type": nutrition.get("diet_type", detect_diet_type(p["name"])),
            "calories_per_100g": nutrition["calories"],
            "protein_per_100g": nutrition["protein"],
            "carbs_per_100g": nutrition["carbs"],
            "fat_per_100g": nutrition["fat"],
            "is_active": True,
            "image_url": p.get("image_url"),
            "description": p.get("description", ""),
            "rating": round(3.5 + (hash(p["name"]) % 15) / 10, 1),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.products.insert_one(product)
    # Create default admin
    admin_exists = await db.users.find_one({"email": "admin@dietcafe.com"}, {"_id": 0})
    if not admin_exists:
        admin = {
            "id": str(uuid.uuid4()),
            "email": "admin@dietcafe.com",
            "password_hash": hash_password("admin123"),
            "name": "Admin",
            "role": "admin",
            "fitness_goal": "maintenance",
            "daily_calories": 2000,
            "daily_protein": 100,
            "daily_carbs": 250,
            "daily_fat": 65,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin)
    return {"message": "Seed data created", "products": len(seed_products)}

@api_router.get("/banners")
async def get_banners():
    return [
        {"id": "1", "title": "Flat 20% OFF", "subtitle": "On all protein meals today", "color": "#E23744"},
        {"id": "2", "title": "Muscle Gain Pack", "subtitle": "Curated high-protein combo at ₹199", "color": "#267E3E"},
        {"id": "3", "title": "Free Delivery", "subtitle": "On orders above ₹299", "color": "#FF9F0A"},
        {"id": "4", "title": "AI Meal Planner", "subtitle": "Get personalized diet suggestions", "color": "#5B5FE0"},
    ]

# ========== QR CODE TABLE ORDERING ==========
class TableOrderRequest(BaseModel):
    table_number: int
    items: List[Dict[str, Any]]
    special_instructions: Optional[str] = ""

@api_router.get("/tables")
async def get_tables():
    """Get all café tables with their status"""
    tables = await db.tables.find({}, {"_id": 0}).to_list(50)
    if not tables:
        # Create default tables
        for i in range(1, 11):
            table = {
                "id": str(uuid.uuid4()),
                "table_number": i,
                "seats": 4 if i <= 6 else 2,
                "status": "available",  # available, occupied, reserved
                "current_order_id": None,
                "qr_code": f"DIETCAFE-TABLE-{i}",
            }
            await db.tables.insert_one(table)
        tables = await db.tables.find({}, {"_id": 0}).to_list(50)
    return tables

@api_router.get("/tables/{table_number}")
async def get_table(table_number: int):
    """Get table info by scanning QR code"""
    table = await db.tables.find_one({"table_number": table_number}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    # Get current order if any
    current_order = None
    if table.get("current_order_id"):
        current_order = await db.orders.find_one({"id": table["current_order_id"]}, {"_id": 0})
    return {**table, "current_order": current_order}

@api_router.post("/tables/{table_number}/occupy")
async def occupy_table(table_number: int, user=Depends(get_current_user)):
    """Mark table as occupied when customer scans QR"""
    table = await db.tables.find_one({"table_number": table_number}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if table["status"] == "occupied" and table.get("occupied_by") != user["id"]:
        raise HTTPException(status_code=400, detail="Table already occupied by another customer")
    await db.tables.update_one(
        {"table_number": table_number},
        {"$set": {"status": "occupied", "occupied_by": user["id"], "occupied_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": f"Table {table_number} is now yours!", "table_number": table_number}

@api_router.post("/tables/{table_number}/release")
async def release_table(table_number: int, user=Depends(get_current_user)):
    """Release table after payment"""
    await db.tables.update_one(
        {"table_number": table_number},
        {"$set": {"status": "available", "occupied_by": None, "current_order_id": None, "occupied_at": None}}
    )
    return {"message": f"Table {table_number} released"}

# ========== PUSH NOTIFICATIONS ==========
class PushTokenRequest(BaseModel):
    expo_push_token: str
    device_type: Optional[str] = "unknown"

@api_router.post("/notifications/register")
async def register_push_token(data: PushTokenRequest, user=Depends(get_current_user)):
    """Register device for push notifications"""
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"expo_push_token": data.expo_push_token, "device_type": data.device_type}}
    )
    return {"message": "Push token registered"}

@api_router.post("/notifications/send")
async def send_notification(title: str, body: str, user_id: str = None, user=Depends(get_current_user)):
    """Send push notification (admin only or to self)"""
    import httpx
    
    if user["role"] != "admin" and user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Cannot send to other users")
    
    target_user = await db.users.find_one({"id": user_id or user["id"]}, {"_id": 0})
    if not target_user or not target_user.get("expo_push_token"):
        return {"message": "User has no push token registered"}
    
    # Store notification in DB
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": target_user["id"],
        "title": title,
        "body": body,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    
    # Send via Expo Push API
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://exp.host/--/api/v2/push/send",
                json={
                    "to": target_user["expo_push_token"],
                    "title": title,
                    "body": body,
                    "data": {"notificationId": notification["id"]}
                }
            )
            logger.info(f"Push sent: {response.status_code}")
    except Exception as e:
        logger.error(f"Push notification error: {e}")
    
    return {"message": "Notification sent", "notification_id": notification["id"]}

@api_router.get("/notifications")
async def get_notifications(user=Depends(get_current_user)):
    """Get user's notifications"""
    notifications = await db.notifications.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return notifications

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user=Depends(get_current_user)):
    """Mark notification as read"""
    await db.notifications.update_one(
        {"id": notification_id, "user_id": user["id"]},
        {"$set": {"read": True}}
    )
    return {"message": "Marked as read"}

# ========== DELIVERY TRACKING (GOOGLE MAPS) ==========
class DeliveryLocationUpdate(BaseModel):
    order_id: str
    latitude: float
    longitude: float

@api_router.get("/orders/{order_id}/tracking")
async def get_delivery_tracking(order_id: str, user=Depends(get_current_user)):
    """Get delivery tracking info for an order"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["user_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    tracking = await db.delivery_tracking.find_one({"order_id": order_id}, {"_id": 0})
    
    # Default café location (can be configured)
    cafe_location = {"latitude": 28.6139, "longitude": 77.2090, "name": "Diet Café"}  # Delhi coords
    
    return {
        "order_id": order_id,
        "order_status": order["status"],
        "order_type": order.get("order_type", "dine-in"),
        "delivery_address": order.get("delivery_address"),
        "cafe_location": cafe_location,
        "driver_location": tracking.get("current_location") if tracking else None,
        "driver_name": tracking.get("driver_name") if tracking else None,
        "estimated_arrival": tracking.get("eta") if tracking else None,
        "tracking_updates": tracking.get("updates", []) if tracking else []
    }

@api_router.post("/orders/{order_id}/tracking/update")
async def update_delivery_location(order_id: str, data: DeliveryLocationUpdate, user=Depends(get_current_user)):
    """Update delivery driver location (driver/admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin/Driver only")
    
    update = {
        "latitude": data.latitude,
        "longitude": data.longitude,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    await db.delivery_tracking.update_one(
        {"order_id": order_id},
        {
            "$set": {"current_location": update, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"updates": update}
        },
        upsert=True
    )
    
    return {"message": "Location updated"}

@api_router.post("/orders/{order_id}/assign-driver")
async def assign_driver(order_id: str, driver_name: str, user=Depends(get_current_user)):
    """Assign driver to delivery order (admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    await db.delivery_tracking.update_one(
        {"order_id": order_id},
        {
            "$set": {
                "order_id": order_id,
                "driver_name": driver_name,
                "assigned_at": datetime.now(timezone.utc).isoformat(),
                "eta": "25-35 mins"
            }
        },
        upsert=True
    )
    
    # Update order status
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "out_for_delivery", "driver_name": driver_name}})
    
    return {"message": f"Driver {driver_name} assigned"}

# ========== ADMIN AI ANALYTICS ==========
@api_router.get("/admin/analytics")
async def get_admin_analytics(user=Depends(get_current_user)):
    """Get comprehensive business analytics for admin"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Get date ranges
    today = datetime.now(timezone.utc)
    today_str = today.strftime("%Y-%m-%d")
    week_ago = (today - __import__('datetime').timedelta(days=7)).strftime("%Y-%m-%d")
    month_ago = (today - __import__('datetime').timedelta(days=30)).strftime("%Y-%m-%d")
    
    # Today's stats
    today_orders = await db.orders.find({"created_at": {"$regex": f"^{today_str}"}}, {"_id": 0}).to_list(1000)
    today_revenue = sum(o.get("total_price", 0) for o in today_orders)
    today_orders_count = len(today_orders)
    
    # Week stats
    week_orders = await db.orders.find({"created_at": {"$gte": week_ago}}, {"_id": 0}).to_list(1000)
    week_revenue = sum(o.get("total_price", 0) for o in week_orders)
    
    # Month stats
    month_orders = await db.orders.find({"created_at": {"$gte": month_ago}}, {"_id": 0}).to_list(5000)
    month_revenue = sum(o.get("total_price", 0) for o in month_orders)
    
    # Best selling products
    product_sales = {}
    for order in month_orders:
        for item in order.get("items", []):
            pid = item.get("product_id", item.get("product_name", "unknown"))
            if pid not in product_sales:
                product_sales[pid] = {"name": item.get("product_name", "Unknown"), "quantity_grams": 0, "revenue": 0, "orders": 0}
            product_sales[pid]["quantity_grams"] += item.get("grams", 0)
            product_sales[pid]["revenue"] += item.get("price", 0)
            product_sales[pid]["orders"] += 1
    
    best_sellers = sorted(product_sales.values(), key=lambda x: x["revenue"], reverse=True)[:10]
    
    # Order type breakdown
    order_types = {"dine-in": 0, "takeaway": 0, "delivery": 0}
    for order in month_orders:
        ot = order.get("order_type", "dine-in")
        order_types[ot] = order_types.get(ot, 0) + 1
    
    # Peak hours analysis
    hourly_orders = {}
    for order in week_orders:
        try:
            hour = datetime.fromisoformat(order["created_at"].replace("Z", "+00:00")).hour
            hourly_orders[hour] = hourly_orders.get(hour, 0) + 1
        except:
            pass
    peak_hours = sorted(hourly_orders.items(), key=lambda x: x[1], reverse=True)[:5]
    
    # Average order value
    avg_order_value = month_revenue / len(month_orders) if month_orders else 0
    
    # Customer stats
    unique_customers = len(set(o.get("user_id") for o in month_orders if o.get("user_id")))
    
    # Low stock alerts
    low_stock = await db.products.find({"available_qty_grams": {"$lt": 500}, "is_active": True}, {"_id": 0}).to_list(20)
    
    return {
        "today": {
            "orders": today_orders_count,
            "revenue": round(today_revenue, 2),
        },
        "week": {
            "orders": len(week_orders),
            "revenue": round(week_revenue, 2),
        },
        "month": {
            "orders": len(month_orders),
            "revenue": round(month_revenue, 2),
            "avg_order_value": round(avg_order_value, 2),
            "unique_customers": unique_customers,
        },
        "best_sellers": best_sellers,
        "order_types": order_types,
        "peak_hours": [{"hour": h, "orders": c} for h, c in peak_hours],
        "low_stock_alerts": [{"name": p["name"], "stock": p["available_qty_grams"]} for p in low_stock],
    }

@api_router.post("/admin/ai-insights")
async def get_ai_business_insights(user=Depends(get_current_user)):
    """Get AI-powered business insights and recommendations"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Gather analytics data
        analytics = await get_admin_analytics(user)
        
        # Get product profit margins
        products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(100)
        product_data = "\n".join([
            f"- {p['name']}: Sells at ₹{p['cost_per_100g']}/100g, Category: {p.get('category', 'N/A')}"
            for p in products[:20]
        ])
        
        prompt = f"""You are a business analyst for Diet Café, a fitness-focused café in India. Analyze this data and provide actionable insights.

BUSINESS DATA:
- Today: {analytics['today']['orders']} orders, ₹{analytics['today']['revenue']} revenue
- This Week: {analytics['week']['orders']} orders, ₹{analytics['week']['revenue']} revenue
- This Month: {analytics['month']['orders']} orders, ₹{analytics['month']['revenue']} revenue
- Average Order Value: ₹{analytics['month']['avg_order_value']}
- Unique Customers (month): {analytics['month']['unique_customers']}

TOP SELLERS:
{json.dumps(analytics['best_sellers'][:5], indent=2)}

ORDER TYPES:
{json.dumps(analytics['order_types'], indent=2)}

PEAK HOURS: {analytics['peak_hours']}

LOW STOCK ALERTS: {analytics['low_stock_alerts']}

MENU ITEMS:
{product_data}

Provide:
1. 3 KEY INSIGHTS about current business performance
2. 3 ACTIONABLE RECOMMENDATIONS to increase revenue
3. 1 PRICING SUGGESTION (which item to adjust price)
4. 1 INVENTORY TIP
5. Overall business health score (1-10)

Be specific with numbers and percentages. Keep it concise and actionable."""

        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY', ''),
            session_id=f"admin-insights-{uuid.uuid4().hex[:8]}",
            system_message="You are a business analytics AI. Provide data-driven insights in a clear, actionable format."
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        return {
            "insights": response,
            "analytics_summary": {
                "today_revenue": analytics['today']['revenue'],
                "month_revenue": analytics['month']['revenue'],
                "avg_order_value": analytics['month']['avg_order_value'],
                "top_product": analytics['best_sellers'][0]['name'] if analytics['best_sellers'] else "N/A"
            },
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error(f"AI insights error: {e}")
        return {
            "insights": "Unable to generate AI insights at this time. Please check the analytics dashboard for raw data.",
            "error": str(e)
        }

# ========== ADMIN PROFIT CALCULATOR ==========
@api_router.get("/admin/profit-calculator")
async def get_profit_margins(user=Depends(get_current_user)):
    """Calculate profit margins for all products"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Estimated cost prices (admin can customize later)
    COST_ESTIMATES = {
        "chicken": 25, "paneer": 20, "egg": 8, "dal": 5, "oats": 4,
        "fish": 35, "kabab": 30, "rice": 3, "potato": 2, "yogurt": 12,
        "salad": 3, "sprouts": 4, "quinoa": 15, "soya": 6, "almonds": 50, "banana": 2
    }
    
    products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(100)
    margins = []
    
    for p in products:
        # Estimate cost based on product name
        cost = 10  # default
        for key, val in COST_ESTIMATES.items():
            if key in p["name"].lower():
                cost = val
                break
        
        selling_price = p["cost_per_100g"]
        profit = selling_price - cost
        margin_pct = (profit / selling_price) * 100 if selling_price > 0 else 0
        
        margins.append({
            "product_id": p["id"],
            "name": p["name"],
            "selling_price": selling_price,
            "estimated_cost": cost,
            "profit_per_100g": round(profit, 2),
            "margin_percentage": round(margin_pct, 1),
            "recommendation": "Good" if margin_pct >= 50 else "Review pricing" if margin_pct >= 30 else "Low margin - increase price"
        })
    
    # Sort by margin
    margins.sort(key=lambda x: x["margin_percentage"], reverse=True)
    
    return {
        "products": margins,
        "summary": {
            "avg_margin": round(sum(m["margin_percentage"] for m in margins) / len(margins), 1) if margins else 0,
            "best_margin": margins[0] if margins else None,
            "worst_margin": margins[-1] if margins else None,
        }
    }

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
