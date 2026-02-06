from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
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
NUTRITION_DB = {
    "chicken breast": {"calories": 165, "protein": 31, "carbs": 0, "fat": 3.6, "category": "Protein"},
    "chicken": {"calories": 239, "protein": 27, "carbs": 0, "fat": 14, "category": "Protein"},
    "paneer": {"calories": 265, "protein": 18.3, "carbs": 1.2, "fat": 20.8, "category": "Protein"},
    "paneer tikka": {"calories": 220, "protein": 16, "carbs": 5, "fat": 15, "category": "Protein"},
    "egg": {"calories": 155, "protein": 13, "carbs": 1.1, "fat": 11, "category": "Protein"},
    "egg white": {"calories": 52, "protein": 11, "carbs": 0.7, "fat": 0.2, "category": "Protein"},
    "dal": {"calories": 116, "protein": 9, "carbs": 20, "fat": 0.4, "category": "Protein"},
    "moong dal": {"calories": 105, "protein": 7.5, "carbs": 18, "fat": 0.6, "category": "Protein"},
    "rice": {"calories": 130, "protein": 2.7, "carbs": 28, "fat": 0.3, "category": "Carb"},
    "brown rice": {"calories": 112, "protein": 2.6, "carbs": 24, "fat": 0.9, "category": "Carb"},
    "roti": {"calories": 297, "protein": 8.1, "carbs": 56, "fat": 3.7, "category": "Carb"},
    "oats": {"calories": 389, "protein": 16.9, "carbs": 66.3, "fat": 6.9, "category": "Carb"},
    "sweet potato": {"calories": 86, "protein": 1.6, "carbs": 20, "fat": 0.1, "category": "Carb"},
    "kabab": {"calories": 205, "protein": 17, "carbs": 8, "fat": 12, "category": "Protein"},
    "seekh kabab": {"calories": 210, "protein": 18, "carbs": 6, "fat": 13, "category": "Protein"},
    "fish": {"calories": 206, "protein": 22, "carbs": 0, "fat": 12, "category": "Protein"},
    "grilled fish": {"calories": 150, "protein": 26, "carbs": 0, "fat": 5, "category": "Protein"},
    "tofu": {"calories": 76, "protein": 8, "carbs": 1.9, "fat": 4.8, "category": "Protein"},
    "quinoa": {"calories": 120, "protein": 4.4, "carbs": 21.3, "fat": 1.9, "category": "Carb"},
    "avocado": {"calories": 160, "protein": 2, "carbs": 9, "fat": 15, "category": "Fat"},
    "almonds": {"calories": 579, "protein": 21, "carbs": 22, "fat": 50, "category": "Fat"},
    "peanut butter": {"calories": 588, "protein": 25, "carbs": 20, "fat": 50, "category": "Fat"},
    "ghee": {"calories": 900, "protein": 0, "carbs": 0, "fat": 100, "category": "Fat"},
    "salad": {"calories": 20, "protein": 1.5, "carbs": 3.5, "fat": 0.2, "category": "Carb"},
    "broccoli": {"calories": 34, "protein": 2.8, "carbs": 7, "fat": 0.4, "category": "Carb"},
    "spinach": {"calories": 23, "protein": 2.9, "carbs": 3.6, "fat": 0.4, "category": "Carb"},
    "milk": {"calories": 42, "protein": 3.4, "carbs": 5, "fat": 1, "category": "Protein"},
    "curd": {"calories": 98, "protein": 11, "carbs": 3.4, "fat": 4.3, "category": "Protein"},
    "greek yogurt": {"calories": 59, "protein": 10, "carbs": 3.6, "fat": 0.7, "category": "Protein"},
    "whey protein": {"calories": 400, "protein": 80, "carbs": 10, "fat": 5, "category": "Protein"},
    "banana": {"calories": 89, "protein": 1.1, "carbs": 23, "fat": 0.3, "category": "Carb"},
    "apple": {"calories": 52, "protein": 0.3, "carbs": 14, "fat": 0.2, "category": "Carb"},
    "chickpeas": {"calories": 164, "protein": 8.9, "carbs": 27.4, "fat": 2.6, "category": "Protein"},
    "rajma": {"calories": 127, "protein": 8.7, "carbs": 22.8, "fat": 0.5, "category": "Protein"},
    "soya chunks": {"calories": 345, "protein": 52, "carbs": 33, "fat": 0.5, "category": "Protein"},
    "mushroom": {"calories": 22, "protein": 3.1, "carbs": 3.3, "fat": 0.3, "category": "Protein"},
    "cottage cheese": {"calories": 98, "protein": 11, "carbs": 3.4, "fat": 4.3, "category": "Protein"},
    "peanuts": {"calories": 567, "protein": 26, "carbs": 16, "fat": 49, "category": "Fat"},
    "olive oil": {"calories": 884, "protein": 0, "carbs": 0, "fat": 100, "category": "Fat"},
    "makhana": {"calories": 347, "protein": 9.7, "carbs": 76.9, "fat": 0.1, "category": "Carb"},
    "sprouts": {"calories": 31, "protein": 3.0, "carbs": 5.9, "fat": 0.2, "category": "Protein"},
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

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    cost_per_100g: Optional[float] = None
    available_qty_grams: Optional[float] = None
    is_active: Optional[bool] = None
    image_url: Optional[str] = None

class OrderItem(BaseModel):
    product_id: str
    product_name: str
    grams: float
    price: float
    calories: float
    protein: float
    carbs: float
    fat: float

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
    return {"calories": 100, "protein": 5, "carbs": 15, "fat": 3, "category": "Other"}

# ========== AUTH ROUTES ==========
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
    product = {
        "id": product_id,
        "name": data.name,
        "cost_per_100g": data.cost_per_100g,
        "available_qty_grams": data.available_qty_grams or 10000,
        "category": nutrition["category"],
        "calories_per_100g": nutrition["calories"],
        "protein_per_100g": nutrition["protein"],
        "carbs_per_100g": nutrition["carbs"],
        "fat_per_100g": nutrition["fat"],
        "is_active": True,
        "image_url": data.image_url,
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

# ========== ORDER ROUTES ==========
@api_router.post("/orders")
async def create_order(data: OrderCreate, user=Depends(get_current_user)):
    order_id = str(uuid.uuid4())[:8].upper()
    extra_charge = 0
    if data.order_type == "takeaway":
        extra_charge = 10
    elif data.order_type == "delivery":
        extra_charge = 30
    order = {
        "id": order_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "order_type": data.order_type,
        "items": [item.dict() for item in data.items],
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
    # Deduct inventory
    for item in data.items:
        await db.products.update_one(
            {"id": item.product_id},
            {"$inc": {"available_qty_grams": -item.grams}}
        )
    # Auto-hide low stock items
    await db.products.update_many(
        {"available_qty_grams": {"$lte": 0}},
        {"$set": {"is_active": False}}
    )
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

# ========== USER / NUTRITION ROUTES ==========
@api_router.put("/user/goals")
async def update_goals(data: UserGoals, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": data.dict()})
    return {"message": "Goals updated", **data.dict()}

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
        {"name": "Chicken Breast", "cost_per_100g": 45, "available_qty_grams": 5000},
        {"name": "Paneer Tikka", "cost_per_100g": 35, "available_qty_grams": 3000},
        {"name": "Egg White", "cost_per_100g": 15, "available_qty_grams": 4000},
        {"name": "Brown Rice", "cost_per_100g": 8, "available_qty_grams": 8000},
        {"name": "Dal", "cost_per_100g": 12, "available_qty_grams": 6000},
        {"name": "Oats", "cost_per_100g": 10, "available_qty_grams": 5000},
        {"name": "Kabab", "cost_per_100g": 50, "available_qty_grams": 3000},
        {"name": "Grilled Fish", "cost_per_100g": 55, "available_qty_grams": 2000},
        {"name": "Sweet Potato", "cost_per_100g": 6, "available_qty_grams": 4000},
        {"name": "Greek Yogurt", "cost_per_100g": 20, "available_qty_grams": 3000},
        {"name": "Salad", "cost_per_100g": 8, "available_qty_grams": 5000},
        {"name": "Sprouts", "cost_per_100g": 10, "available_qty_grams": 3000},
        {"name": "Quinoa", "cost_per_100g": 25, "available_qty_grams": 2000},
        {"name": "Soya Chunks", "cost_per_100g": 12, "available_qty_grams": 3000},
        {"name": "Almonds", "cost_per_100g": 80, "available_qty_grams": 1000},
        {"name": "Banana", "cost_per_100g": 5, "available_qty_grams": 5000},
    ]
    for p in seed_products:
        nutrition = match_nutrition(p["name"])
        product = {
            "id": str(uuid.uuid4()),
            "name": p["name"],
            "cost_per_100g": p["cost_per_100g"],
            "available_qty_grams": p["available_qty_grams"],
            "category": nutrition["category"],
            "calories_per_100g": nutrition["calories"],
            "protein_per_100g": nutrition["protein"],
            "carbs_per_100g": nutrition["carbs"],
            "fat_per_100g": nutrition["fat"],
            "is_active": True,
            "image_url": None,
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
