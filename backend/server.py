from fastapi import FastAPI, APIRouter, HTTPException, Depends, Body, Query
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import io
import os
import re
import logging
import json
import base64
import secrets
import socketio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# ========== CONFIG (env-driven, A3 + A4) ==========
JWT_SECRET = os.environ.get("JWT_SECRET") or secrets.token_hex(32)
JWT_ALGORITHM = "HS256"

_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()] or ["*"]

# ========== ENV GUARD ==========
def assert_prod_secrets(env: str, jwt_secret: str, origins: list, msg91_key: Optional[str] = None) -> None:
    """Raise RuntimeError if production env is missing required secrets.

    Login (OTP delivery via MSG91) is a core flow, so a missing MSG91 key fails
    boot in production rather than silently falling back to console-logged OTPs
    (nobody could log in, and the OTP would leak to logs)."""
    is_prod = env.lower() in ("prod", "production")
    if not is_prod:
        return
    if not jwt_secret:
        raise RuntimeError("JWT_SECRET must be set in production")
    if origins == ["*"]:
        raise RuntimeError("ALLOWED_ORIGINS must be set in production")
    if not msg91_key:
        logger.warning("MSG91_AUTH_KEY is not set in production; OTP delivery will fall back to console logging (insecure — set before launch)")

_APP_ENV = os.environ.get("APP_ENV", "development")
_jwt_secret_raw = os.environ.get("JWT_SECRET", "")
_msg91_key_raw = os.environ.get("MSG91_AUTH_KEY", "").strip()
assert_prod_secrets(_APP_ENV, _jwt_secret_raw, ALLOWED_ORIGINS, _msg91_key_raw)

_is_prod = _APP_ENV.lower() in ("prod", "production")
if not _jwt_secret_raw:
    logger.warning("JWT_SECRET is not set; using a random secret (tokens will not survive restarts)")
if ALLOWED_ORIGINS == ["*"]:
    logger.warning("ALLOWED_ORIGINS is not set; defaulting to ['*'] (insecure for credentialed requests)")
if _is_prod and not os.environ.get("EMERGENT_LLM_KEY", "").strip():
    # Razorpay is not integrated yet, so it is intentionally not guarded here.
    logger.warning("EMERGENT_LLM_KEY is not set in production; AI features will be degraded")

# ========== SOCKET.IO REAL-TIME SERVER (Part C) ==========
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
# Generic role rooms — used only for GLOBAL events (e.g. catalog/menu updates).
# Store-scoped operational events go to per-store rooms instead (see store_event_rooms).
STAFF_ROOMS = ["kitchen", "cashier", "admin"]

def store_event_rooms(store_id: str, channels=("kitchen", "cashier", "manager")):
    """Per-store rooms an operational event for `store_id` should reach.

    A store's order events must only land in that store's staff rooms (kitchen /
    cashier / store-manager), plus the HQ room. Area managers join the per-store
    rooms for every store in their cluster, so they receive their stores' events
    without any cross-store leakage.
    """
    rooms = [f"{c}:{store_id}" for c in channels]
    rooms.append("hq")  # HQ super-admin dashboard sees every store
    return rooms

@sio.event
async def connect(sid, environ):
    logger.info(f"[WS] Client connected: {sid}")

@sio.event
async def disconnect(sid):
    logger.info(f"[WS] Client disconnected: {sid}")

@sio.event
async def join_room(sid, data):
    """Clients join rooms by name. Staff use store-scoped rooms such as
    'kitchen:<store_id>' / 'cashier:<store_id>' / 'manager:<store_id>', HQ uses
    'hq', and customers use 'user:<id>'. A single client may join several rooms
    (e.g. an area manager joins each store in its cluster)."""
    room_id = (data or {}).get("room_id")
    rooms = (data or {}).get("rooms")
    join_targets = []
    if room_id:
        join_targets.append(room_id)
    if isinstance(rooms, list):
        join_targets.extend([r for r in rooms if r])
    if not join_targets:
        logger.warning(f"[WS] join_room without room_id from {sid}")
        return
    for r in join_targets:
        await sio.enter_room(sid, r)
    await sio.emit("joined", {"rooms": join_targets}, to=sid)
    logger.info(f"[WS] {sid} joined rooms {join_targets}")

async def broadcast_event(event_type: str, payload: dict, rooms=None, store_id=None):
    """Broadcast a real-time event.

    - rooms set explicitly  -> those rooms.
    - store_id set          -> ONLY that store's staff rooms (+ HQ); never leaks
                               to other stores.
    - menu_update (global)  -> all staff + customers (catalog is shared in Phase 0).
    - otherwise             -> generic staff rooms.
    """
    message = {"type": event_type, "data": payload}
    if rooms is not None:
        targets = rooms
    elif store_id is not None:
        targets = store_event_rooms(store_id)
        if event_type == "menu_update":
            targets = targets + ["customers"]
    elif event_type == "menu_update":
        targets = STAFF_ROOMS + ["customers"]
    else:
        targets = STAFF_ROOMS
    for room in targets:
        try:
            await sio.emit("update", message, room=room)
        except Exception as e:
            logger.error(f"[WS] broadcast error to {room}: {e}")

# ========== CANONICAL ORDER STATUS FLOW (Part C2) ==========
ORDER_STATUSES = ["pending", "accepted", "preparing", "ready", "completed", "cancelled", "scheduled", "out_for_delivery"]

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
    diet_type: Optional[str] = None  # "veg" or "non-veg" (legacy, kept for back-compat)
    diet_types: Optional[List[str]] = None  # multi tags: veg, non-veg, vegan, eggetarian, jain, keto, high-protein
    # B1: admin-entered nutrition (per 100g). When set, these override NUTRITION_DB.
    calories_per_100g: Optional[float] = None
    protein_per_100g: Optional[float] = None
    carbs_per_100g: Optional[float] = None
    fat_per_100g: Optional[float] = None
    # B5: per-item preparation time
    preparation_time_minutes: Optional[int] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    cost_per_100g: Optional[float] = None
    fixed_price: Optional[float] = None
    available_qty_grams: Optional[float] = None
    available_servings: Optional[int] = None
    is_active: Optional[bool] = None
    image_url: Optional[str] = None
    images: Optional[List[str]] = None
    category: Optional[str] = None
    category_id: Optional[str] = None
    diet_type: Optional[str] = None
    diet_types: Optional[List[str]] = None
    description: Optional[str] = None
    is_editable: Optional[bool] = None
    # B1 + B5
    calories_per_100g: Optional[float] = None
    protein_per_100g: Optional[float] = None
    carbs_per_100g: Optional[float] = None
    fat_per_100g: Optional[float] = None
    preparation_time_minutes: Optional[int] = None

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
    store_id: Optional[str] = None  # store the customer is ordering from (POS uses staff's store)
    items: List[OrderItem]
    total_price: float
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float
    fitness_goal: Optional[str] = None
    budget: Optional[float] = None
    payment_mode: Optional[str] = "cash"  # cash, upi, card, other
    coupon_code: Optional[str] = None
    discount: Optional[float] = 0
    customer_name: Optional[str] = None  # For walk-in customers
    is_scheduled: Optional[bool] = False
    scheduled_ready_time: Optional[str] = None  # ISO datetime string
    table_number: Optional[int] = None
    delivery_address: Optional[str] = None
    delivery_time: Optional[str] = None
    delivery_fee: Optional[float] = None
    tip: Optional[float] = 0
    gstin: Optional[str] = None
    business_name: Optional[str] = None
    item_subtotal: Optional[float] = None
    confirm_duplicate: Optional[bool] = False  # B3: bypass duplicate guard when user confirms

class AISuggestRequest(BaseModel):
    goal: str
    budget: Optional[float] = None
    selected_items: List[Dict[str, Any]]
    current_nutrition: Dict[str, float]

class QuickMealRequest(BaseModel):
    diet_preference: Union[str, List[str]] = "both"  # single (legacy) or multi diet tags
    goal: str  # "fat_loss", "muscle_gain", "maintenance", "beginner", "recovery"
    budget: Optional[float] = None
    order_type: str = "dine-in"

class SingleProductCreate(BaseModel):
    name: str
    price: float
    grams: float
    category_id: Optional[str] = None
    diet_type: Optional[str] = None
    diet_types: Optional[List[str]] = None
    # B1 + B5
    calories_per_100g: Optional[float] = None
    protein_per_100g: Optional[float] = None
    carbs_per_100g: Optional[float] = None
    fat_per_100g: Optional[float] = None
    preparation_time_minutes: Optional[int] = None

class IngredientItem(BaseModel):
    name: str
    grams_per_serving: float
    product_id: Optional[str] = None
    raw_item_id: Optional[str] = None  # Phase 3A: optional link to a pure-raw inventory_item

class ReadyMadeMealCreate(BaseModel):
    name: str
    ingredients: List[IngredientItem]
    images: List[str] = []
    price: float
    serving_grams: float = 300
    is_editable: bool = False
    category_id: Optional[str] = None
    preparation_time_minutes: Optional[int] = None  # B5

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
    key: Optional[str] = None
    label: Optional[str] = None
    icon: str = "grid"
    color: str = "#15140F"
    image_url: Optional[str] = None
    description: Optional[str] = None
    sort_order: int = 0
    font_style: Optional[str] = "default"  # default, bold, italic, mono

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
    font_style: Optional[str] = None

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

optional_security = HTTPBearer(auto_error=False)

async def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security)):
    """Like get_current_user but returns None instead of raising when there is no
    (or an invalid) token. Used by endpoints that serve both authenticated staff
    and anonymous customers (e.g. QR table lookup)."""
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    except Exception:
        return None

# ========== MULTI-STORE TENANCY (Phase 0) ==========
# A single company-owned chain. Catalog (products/categories/offers/packs) stays
# global; operational data (orders/payments/tables/shifts/stock_logs/held_bills/
# delivery_tracking/staff-notifications) is partitioned by store_id.
DEFAULT_STORE_ID = "STORE-DEFAULT"

# Canonical roles. Exactly ONE role per user. Legacy "admin" == HQ "super_admin".
ROLES = {"super_admin", "area_manager", "store_manager", "cashier", "kitchen", "customer"}
STAFF_ROLES = {"super_admin", "area_manager", "store_manager", "cashier", "kitchen"}
STORE_BOUND_ROLES = {"store_manager", "cashier", "kitchen"}

def normalize_role(user) -> str:
    """Map the legacy 'admin' role to 'super_admin'; otherwise return role as-is."""
    role = (user or {}).get("role")
    return "super_admin" if role == "admin" else role

def is_hq(user) -> bool:
    """True for the HQ super-admin, which can see/act on every store."""
    return normalize_role(user) == "super_admin"

def role_in(user, *roles) -> bool:
    return normalize_role(user) in roles

def staff_store_scope(user):
    """Store ids a staff user may touch. None => ALL stores (HQ). [] => none."""
    role = normalize_role(user)
    if role == "super_admin":
        return None
    if role == "area_manager":
        return list(user.get("cluster_store_ids") or [])
    if role in STORE_BOUND_ROLES:
        sid = user.get("store_id")
        return [sid] if sid else []
    return []

def store_filter(user, field: str = "store_id") -> dict:
    """Mongo filter fragment limiting a query to the caller's allowed stores.

    {} for HQ (all stores). For everyone else, restricts to their store(s).
    """
    scope = staff_store_scope(user)
    if scope is None:
        return {}
    return {field: {"$in": scope}}

def assert_store_allowed(user, store_id):
    """Raise 403 if the caller may not act on `store_id`."""
    scope = staff_store_scope(user)
    if scope is None:
        return
    if not store_id or store_id not in scope:
        raise HTTPException(status_code=403, detail="Store outside your scope")

async def resolve_order_store_id(user, requested_store_id):
    """Decide which store a new order belongs to, based on the caller's role.

    Store-bound staff (POS) always order against their own store. Customers (and
    HQ acting as a customer) must supply a valid, active store_id; for backward
    compatibility a missing store_id falls back to the default store.
    """
    role = normalize_role(user)
    if role in STORE_BOUND_ROLES:
        return user.get("store_id") or DEFAULT_STORE_ID
    sid = requested_store_id or DEFAULT_STORE_ID
    store = await db.stores.find_one({"store_id": sid}, {"_id": 0})
    if not store or store.get("status") == "inactive":
        raise HTTPException(status_code=400, detail="Invalid or inactive store_id")
    return sid

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

def resolved_nutrition(name: str, cal=None, pro=None, carb=None, fat=None) -> Dict:
    """B1: Prefer admin-entered nutrition; fall back to NUTRITION_DB keyword matching when empty."""
    base = match_nutrition(name)
    return {
        "calories": cal if cal is not None else base["calories"],
        "protein": pro if pro is not None else base["protein"],
        "carbs": carb if carb is not None else base["carbs"],
        "fat": fat if fat is not None else base["fat"],
        "category": base["category"],
        "diet_type": base.get("diet_type", detect_diet_type(name)),
    }

# ========== DIET TAGS (multi) — shared across customer app, POS, Kitchen, Admin ==========
ALLOWED_DIET_TAGS = ["veg", "non-veg", "vegan", "eggetarian", "jain", "keto", "high-protein"]

def normalize_diet_types(diet_types, fallback_diet_type=None, name=None) -> List[str]:
    """Clean a diet_types list to allowed tags. Falls back to migrating a single diet_type."""
    tags: List[str] = []
    if diet_types:
        for t in diet_types:
            if t in ALLOWED_DIET_TAGS and t not in tags:
                tags.append(t)
    if not tags:
        dt = fallback_diet_type or (detect_diet_type(name) if name else None)
        if dt in ALLOWED_DIET_TAGS:
            tags = [dt]
    return tags

def ensure_product_diet_types(p: dict) -> dict:
    """On-read migration: guarantee a product dict carries a diet_types array.
    Derives veg/non-veg from legacy diet_type and auto-adds 'high-protein' from nutrition
    only when the product has not been explicitly tagged yet."""
    if isinstance(p, dict) and not p.get("diet_types"):
        tags = normalize_diet_types(None, p.get("diet_type"), p.get("name"))
        try:
            if float(p.get("protein_per_100g") or 0) >= 18 and "high-protein" not in tags:
                tags.append("high-protein")
        except (TypeError, ValueError):
            pass
        p["diet_types"] = tags
    return p

def diet_prefs_to_list(diet_preference) -> List[str]:
    """Accept legacy single string or new list; normalize to a list of tags (drop 'both'/empties)."""
    if diet_preference is None:
        return []
    prefs = [diet_preference] if isinstance(diet_preference, str) else list(diet_preference)
    return [str(p).strip() for p in prefs if p and str(p).strip() and str(p).strip() != "both"]

def product_matches_diet(p: dict, prefs) -> bool:
    """Match if the product carries ALL selected diet tags (AND/intersection semantics)."""
    if not prefs:
        return True
    tags = p.get("diet_types") or normalize_diet_types(None, p.get("diet_type"), p.get("name"))
    return all(pref in tags for pref in prefs)

# ========== GOAL PERSONALIZATION — body stats → daily target (CUSTOMER APP ONLY) ==========
# Phase 2/3: Mifflin-St Jeor BMR -> TDEE (x activity) -> goal-adjusted daily target,
# split into per-meal slices, plus goal-fit dish ranking. Safety guardrails enforced.
ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,     # little/no exercise
    "light": 1.375,       # 1-3 days/week
    "moderate": 1.55,     # 3-5 days/week
    "active": 1.725,      # 6-7 days/week
    "very_active": 1.9,   # hard daily / physical job
}
# Calorie factor vs TDEE per goal (deficits kept conservative & safe)
GOAL_CAL_FACTOR = {
    "fat_loss": 0.82,        # ~18% deficit (safe)
    "muscle_gain": 1.15,     # ~15% surplus
    "lean_bulk": 1.10,       # ~10% surplus
    "recomposition": 1.0,    # maintenance + high protein
    "maintenance": 1.0,
    "beginner": 1.0,
}
GOAL_PROTEIN_PER_KG = {
    "fat_loss": 2.0,
    "muscle_gain": 1.8,
    "lean_bulk": 1.8,
    "recomposition": 2.2,
    "maintenance": 1.6,
    "beginner": 1.4,
}
CALORIE_FLOOR = 1200  # never output below this (safety guardrail)
TARGET_DISCLAIMER = (
    "These are approximate targets to help personalize your meals — not medical advice. "
    "If you have any health conditions, please consult a doctor or registered dietitian."
)

def has_body_stats(u: dict) -> bool:
    return bool(u and u.get("height_cm") and u.get("weight_kg") and u.get("age"))

def compute_daily_targets(height_cm, weight_kg, age, gender, activity_level, fitness_goal, target_weight_kg=None):
    """Mifflin-St Jeor BMR -> TDEE -> goal-adjusted daily calories + macros, with guardrails."""
    notes: List[str] = []
    try:
        height_cm = float(height_cm); weight_kg = float(weight_kg); age = float(age)
    except (TypeError, ValueError):
        return None
    g = (gender or "male").lower()
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    if g == "female":
        bmr = base - 161
    elif g == "male":
        bmr = base + 5
    else:
        bmr = base - 78  # gender-neutral: midpoint of male/female constants
    activity = ACTIVITY_MULTIPLIERS.get(activity_level or "light", 1.375)
    tdee = bmr * activity
    factor = GOAL_CAL_FACTOR.get(fitness_goal, 1.0)
    calories = tdee * factor
    floor_applied = False
    # Guardrail 1: block extreme deficit — for fat loss never go below BMR (or the floor)
    if fitness_goal == "fat_loss":
        min_safe = max(CALORIE_FLOOR, round(bmr))
        if calories < min_safe:
            calories = min_safe
            floor_applied = True
            notes.append("Adjusted so you never dip into an unsafe deficit — slow & steady is more sustainable.")
    # Guardrail 2: absolute calorie floor
    if calories < CALORIE_FLOOR:
        calories = CALORIE_FLOOR
        floor_applied = True
        notes.append(f"We keep a minimum of {CALORIE_FLOOR} kcal/day so you stay energized and healthy.")
    # Protein target (g/kg bodyweight), capped at 40% of calories
    protein = GOAL_PROTEIN_PER_KG.get(fitness_goal, 1.6) * weight_kg
    if protein * 4 > calories * 0.4:
        protein = (calories * 0.4) / 4
    # Fat ~25% of calories; carbs fill the remainder
    fat = (calories * 0.25) / 9
    carb_cal = calories - (protein * 4 + fat * 9)
    carbs = max(0.0, carb_cal / 4)
    notes.append("Targets are approximate and update as your stats change.")
    return {
        "bmr": int(round(bmr)),
        "tdee": int(round(tdee)),
        "daily_calories": int(round(calories)),
        "daily_protein": int(round(protein)),
        "daily_carbs": int(round(carbs)),
        "daily_fat": int(round(fat)),
        "fitness_goal": fitness_goal,
        "activity_level": activity_level,
        "floor_applied": floor_applied,
        "notes": notes,
        "disclaimer": TARGET_DISCLAIMER,
    }

def split_targets_into_meals(daily_calories, daily_protein, daily_carbs, daily_fat, meals: int):
    """Split a daily target across N meals (3-6). Slightly larger lunch/dinner, lighter snacks."""
    meals = max(3, min(6, int(meals or 3)))
    # weight profiles per meal count (sum ~= 1.0); index 0..meals-1
    profiles = {
        3: [0.30, 0.40, 0.30],
        4: [0.25, 0.35, 0.10, 0.30],
        5: [0.22, 0.30, 0.10, 0.28, 0.10],
        6: [0.20, 0.27, 0.08, 0.25, 0.10, 0.10],
    }
    labels = {
        3: ["Breakfast", "Lunch", "Dinner"],
        4: ["Breakfast", "Lunch", "Snack", "Dinner"],
        5: ["Breakfast", "Lunch", "Snack", "Dinner", "Evening Snack"],
        6: ["Breakfast", "Mid-Morning", "Lunch", "Snack", "Dinner", "Late Snack"],
    }
    w = profiles[meals]
    lbl = labels[meals]
    slices = []
    for i in range(meals):
        slices.append({
            "index": i,
            "label": lbl[i],
            "calories": int(round(daily_calories * w[i])),
            "protein": int(round(daily_protein * w[i])),
            "carbs": int(round(daily_carbs * w[i])),
            "fat": int(round(daily_fat * w[i])),
        })
    return slices

def goal_fit_for_product(p: dict, goal: str):
    """Return (fits: bool, score: float, reason: str) for how well a dish fits a goal.
    Uses per-100g nutrition already on the product."""
    cal = float(p.get("calories_per_100g") or 0)
    pro = float(p.get("protein_per_100g") or 0)
    carb = float(p.get("carbs_per_100g") or 0)
    fat = float(p.get("fat_per_100g") or 0)
    # protein density = grams of protein per 100 kcal
    pd = (pro / cal * 100) if cal > 0 else 0
    goal = goal or "maintenance"
    if goal == "fat_loss":
        fits = pd >= 8 and cal <= 220
        score = pd * 3 - cal / 50
        reason = "High protein, lower calorie"
    elif goal in ("muscle_gain", "lean_bulk"):
        fits = pro >= 12
        score = pro * 2 + cal / 100
        reason = "Protein-rich, energy-dense"
    elif goal == "recomposition":
        fits = pd >= 8
        score = pd * 3
        reason = "Very high protein density"
    else:  # maintenance, beginner
        fits = pd >= 5
        score = pd + (pro / 10)
        reason = "Balanced macros"
    return fits, round(score, 2), reason

async def fetch_active_products() -> List[dict]:
    active_cats = await db.categories.find({"is_active": {"$ne": False}}, {"_id": 0, "name": 1}).to_list(100)
    active_cat_names = {c["name"] for c in active_cats}
    products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(200)
    if active_cat_names:
        products = [p for p in products if p.get("category", "") in active_cat_names or not p.get("category")]
    return [ensure_product_diet_types(p) for p in products]

# ========== AUTH ROUTES ==========

# ========== AUTH ROUTES ==========

# OTP storage is durable in MongoDB (collection: otp_codes) with a TTL index on expires_at (A5).
async def store_otp(phone: str, otp: str, name: Optional[str] = None):
    now = datetime.now(timezone.utc)
    await db.otp_codes.update_one(
        {"phone": phone},
        {"$set": {
            "phone": phone,
            "otp_hash": hash_password(otp),
            "expires_at": now + timedelta(minutes=5),
            "last_sent_at": now,
            "attempts": 0,
            "name": name,
        }},
        upsert=True,
    )

def generate_otp() -> str:
    """Generate 6-digit OTP"""
    import random
    return str(random.randint(100000, 999999))

def sms_is_configured() -> bool:
    """True only when a real SMS provider (MSG91) is configured.
    Used to gate the DEV-ONLY dev_otp response field."""
    return bool(
        os.environ.get("MSG91_AUTH_KEY", "").strip()
        and os.environ.get("MSG91_TEMPLATE_ID", "").strip()
    )

async def send_otp_sms(phone: str, otp: str) -> bool:
    """Send OTP via MSG91 SMS (A2). Falls back to dev-mode logging if creds are missing.
    The OTP is NEVER returned in the HTTP response."""
    import httpx
    MSG91_AUTH_KEY = os.environ.get("MSG91_AUTH_KEY", "").strip()
    MSG91_TEMPLATE_ID = os.environ.get("MSG91_TEMPLATE_ID", "").strip()
    MSG91_SENDER_ID = os.environ.get("MSG91_SENDER_ID", "BORROC").strip()

    if MSG91_AUTH_KEY and MSG91_TEMPLATE_ID:
        try:
            async with httpx.AsyncClient(timeout=10) as hc:
                response = await hc.post(
                    "https://control.msg91.com/api/v5/otp",
                    headers={"authkey": MSG91_AUTH_KEY, "Content-Type": "application/json"},
                    params={
                        "template_id": MSG91_TEMPLATE_ID,
                        "mobile": f"91{phone}",
                        "otp": otp,
                        "sender": MSG91_SENDER_ID,
                    },
                )
                if response.status_code == 200:
                    logger.info(f"[SMS] OTP sent to {phone} via MSG91")
                    return True
                logger.error(f"[SMS] MSG91 failed ({response.status_code}): {response.text}")
                return False
        except Exception as e:
            logger.error(f"[SMS] MSG91 error: {e}")
            return False

    # DEV MODE: no SMS provider configured -> log only, never expose in response
    logger.info(f"[SMS][DEV] OTP for {phone}: {otp}  (configure MSG91_AUTH_KEY + MSG91_TEMPLATE_ID for real SMS)")
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
    """Send OTP to phone number (A1: never returns the OTP)."""
    phone = data.phone.strip().replace(" ", "").replace("-", "")

    if not phone.isdigit() or len(phone) != 10:
        raise HTTPException(status_code=400, detail="Invalid phone number. Enter 10 digits.")

    otp = generate_otp()
    await store_otp(phone, otp, data.name)

    sent = await send_otp_sms(phone, otp)
    if not sent:
        raise HTTPException(status_code=500, detail="Failed to send OTP. Please try again.")

    response = {
        "message": "OTP sent successfully",
        "phone": phone,
        "expires_in": 300
    }
    # DEV-ONLY CONVENIENCE (A1 relaxed for dev): when NO SMS provider (MSG91) is configured,
    # also return the plaintext OTP so testers can log in without real SMS.
    # Once MSG91_AUTH_KEY + MSG91_TEMPLATE_ID are set, the OTP is NEVER included.
    if not sms_is_configured():
        logger.warning(
            f"[SMS][DEV] No SMS provider configured -> returning dev_otp in /auth/otp/send "
            f"response for {phone}. Set MSG91_AUTH_KEY + MSG91_TEMPLATE_ID to disable this."
        )
        response["dev_otp"] = otp
    return response

@api_router.post("/auth/otp/verify")
async def verify_otp(data: OTPVerifyRequest):
    """Verify OTP and login/register user"""
    phone = data.phone.strip().replace(" ", "").replace("-", "")

    record = await db.otp_codes.find_one({"phone": phone}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=400, detail="OTP expired or not sent. Please request new OTP.")

    expires_at = record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        await db.otp_codes.delete_one({"phone": phone})
        raise HTTPException(status_code=400, detail="OTP expired. Please request new OTP.")

    if record.get("attempts", 0) >= 3:
        await db.otp_codes.delete_one({"phone": phone})
        raise HTTPException(status_code=400, detail="Too many wrong attempts. Please request new OTP.")

    if not verify_password(data.otp, record.get("otp_hash", "")):
        await db.otp_codes.update_one({"phone": phone}, {"$inc": {"attempts": 1}})
        remaining = 3 - (record.get("attempts", 0) + 1)
        raise HTTPException(status_code=400, detail=f"Invalid OTP. {max(remaining,0)} attempts remaining.")

    await db.otp_codes.delete_one({"phone": phone})

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
        name = data.name or record.get("name") or f"User{phone[-4:]}"
        
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

    record = await db.otp_codes.find_one({"phone": phone}, {"_id": 0})
    if record and record.get("last_sent_at"):
        last_sent = record["last_sent_at"]
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - last_sent).total_seconds() < 30:
            raise HTTPException(status_code=429, detail="Please wait 30 seconds before requesting new OTP.")

    return await send_otp(data)

# Keep existing email/password login for admin
@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    # Public self-registration ALWAYS creates a customer. Staff (store-bound
    # roles, area_manager, super_admin) are provisioned by HQ via /staff or seed,
    # never by self-registration — this prevents role self-escalation.
    role = "customer"
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": data.email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": role,
        "fitness_goal": "maintenance",
        "daily_calories": 2000,
        "daily_protein": 100,
        "daily_carbs": 250,
        "daily_fat": 65,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    token = create_token(user_id, role)
    return {
        "token": token,
        "user": {
            "id": user_id, "email": data.email, "name": data.name,
            "role": role, "fitness_goal": "maintenance",
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
            "store_id": user.get("store_id"), "cluster_store_ids": user.get("cluster_store_ids"),
            "daily_calories": user.get("daily_calories", 2000),
            "daily_protein": user.get("daily_protein", 100),
            "daily_carbs": user.get("daily_carbs", 250),
            "daily_fat": user.get("daily_fat", 65)
        }
    }

@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {
        "id": user["id"], "email": user.get("email"), "name": user["name"],
        "role": user["role"], "fitness_goal": user.get("fitness_goal", "maintenance"),
        "store_id": user.get("store_id"), "cluster_store_ids": user.get("cluster_store_ids"),
        "daily_calories": user.get("daily_calories", 2000),
        "daily_protein": user.get("daily_protein", 100),
        "daily_carbs": user.get("daily_carbs", 250),
        "daily_fat": user.get("daily_fat", 65),
        # Phase 2: body stats (customer app only) — may be absent for older users
        "height_cm": user.get("height_cm"),
        "weight_kg": user.get("weight_kg"),
        "age": user.get("age"),
        "gender": user.get("gender"),
        "activity_level": user.get("activity_level"),
        "target_weight_kg": user.get("target_weight_kg"),
        "meals_per_day": user.get("meals_per_day", 3),
        "has_body_stats": has_body_stats(user),
    }

# ========== PRODUCT ROUTES ==========
@api_router.post("/products")
async def create_product(data: ProductCreate, user=Depends(get_current_user)):
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    nutrition = resolved_nutrition(data.name, data.calories_per_100g, data.protein_per_100g, data.carbs_per_100g, data.fat_per_100g)
    product_id = str(uuid.uuid4())
    import random
    product = {
        "id": product_id,
        "name": data.name,
        "cost_per_100g": data.cost_per_100g,
        "available_qty_grams": data.available_qty_grams or 10000,
        "category": data.category or nutrition["category"],
        "diet_type": data.diet_type or nutrition.get("diet_type", detect_diet_type(data.name)),
        "calories_per_100g": nutrition["calories"],
        "protein_per_100g": nutrition["protein"],
        "carbs_per_100g": nutrition["carbs"],
        "fat_per_100g": nutrition["fat"],
        "preparation_time_minutes": data.preparation_time_minutes or 10,
        "is_active": True,
        "image_url": data.image_url,
        "description": data.description or "",
        "rating": round(random.uniform(3.5, 4.9), 1),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product)
    await broadcast_event("menu_update", {"action": "created", "product_id": product_id})
    return {k: v for k, v in product.items() if k != "_id"}

@api_router.get("/products")
async def list_products(diet: Optional[str] = None, store_id: Optional[str] = None):
    # Multi-store: when a store_id is given, return that store's resolved menu
    # (master catalog + per-store overrides). With no store_id the global menu is
    # returned unchanged, so the existing customer app keeps working.
    if store_id:
        return await resolve_menu_for_store(store_id, diet)
    # Get active category names
    active_cats = await db.categories.find({"is_active": {"$ne": False}}, {"_id": 0, "name": 1}).to_list(100)
    active_cat_names = {c["name"] for c in active_cats}
    products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(200)
    # Filter: only show products in active categories (or with no category set)
    if active_cat_names:
        products = [p for p in products if p.get("category", "") in active_cat_names or not p.get("category")]
    products = [ensure_product_diet_types(p) for p in products]
    # Optional multi diet-tag filter (?diet=vegan,keto) — AND semantics
    if diet:
        prefs = [d.strip() for d in diet.split(",") if d.strip()]
        if prefs:
            products = [p for p in products if product_matches_diet(p, prefs)]
    return products

@api_router.get("/products/all")
async def list_all_products(user=Depends(get_current_user)):
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    products = await db.products.find({}, {"_id": 0}).to_list(200)
    return [ensure_product_diet_types(p) for p in products]

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductUpdate, user=Depends(get_current_user)):
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    # Diet tags (multi): normalize + keep legacy diet_type in sync
    if "diet_types" in update_data:
        update_data["diet_types"] = normalize_diet_types(update_data["diet_types"])
        if "diet_type" not in update_data and update_data["diet_types"]:
            update_data["diet_type"] = next((t for t in update_data["diet_types"] if t in ("veg", "non-veg")), update_data["diet_types"][0])
    # Resolve category_id to category name
    if "category_id" in update_data:
        cat = await db.categories.find_one({"id": update_data["category_id"]}, {"_id": 0})
        if cat:
            update_data["category"] = cat["name"]
    if "name" in update_data and "category_id" not in update_data:
        nutrition = match_nutrition(update_data["name"])
        # Keep admin-provided category if present, else derive from keyword match
        if "category" not in update_data:
            update_data["category"] = nutrition["category"]
        # B1: only fill nutrition from NUTRITION_DB for fields the admin did NOT explicitly send
        for fld, key in [("calories_per_100g", "calories"), ("protein_per_100g", "protein"),
                          ("carbs_per_100g", "carbs"), ("fat_per_100g", "fat")]:
            if fld not in update_data:
                update_data[fld] = nutrition[key]
    if update_data:
        await db.products.update_one({"id": product_id}, {"$set": update_data})
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    await broadcast_event("menu_update", {"action": "updated", "product_id": product_id})
    return product

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user=Depends(get_current_user)):
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    await broadcast_event("menu_update", {"action": "deleted", "product_id": product_id})
    return {"message": "Product deleted"}

# ==========================================================================
# PHASE 1A — CENTRAL CATALOG + PER-STORE OVERRIDE + HQ PUSH + VERSION LOG
# products = GLOBAL master catalog (unchanged). product_overrides hold per-store
# selling_price / availability. The resolved menu = master with overrides applied.
# ==========================================================================

def _product_base_price(p: dict):
    """The master 'base' price for a product (absolute where defined, else the
    per-100g unit price for build-your-own singles)."""
    if p.get("product_type") == "ready_made":
        return p.get("fixed_price") if p.get("fixed_price") is not None else p.get("cost_per_100g")
    if p.get("base_price") is not None:
        return p.get("base_price")
    return p.get("cost_per_100g")

async def resolve_menu_for_store(store_id: str, diet: Optional[str] = None) -> List[dict]:
    """Master catalog with this store's overrides applied:
    override selling_price wins over base; products marked available=false are
    hidden. Products with no override get base price + available=true."""
    active_cats = await db.categories.find({"is_active": {"$ne": False}}, {"_id": 0, "name": 1}).to_list(100)
    active_cat_names = {c["name"] for c in active_cats}
    products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(200)
    if active_cat_names:
        products = [p for p in products if p.get("category", "") in active_cat_names or not p.get("category")]
    products = [ensure_product_diet_types(p) for p in products]
    if diet:
        prefs = [d.strip() for d in diet.split(",") if d.strip()]
        if prefs:
            products = [p for p in products if product_matches_diet(p, prefs)]

    overrides = await db.product_overrides.find({"store_id": store_id}, {"_id": 0}).to_list(2000)
    ov_by_pid = {o["product_id"]: o for o in overrides}

    resolved = []
    for p in products:
        ov = ov_by_pid.get(p["id"])
        available = ov.get("available", True) if ov else True
        if not available:
            continue  # hidden for this store
        base = _product_base_price(p)
        selling_price = ov["selling_price"] if (ov and ov.get("selling_price") is not None) else base
        item = dict(p)
        item["store_id"] = store_id
        item["base_price"] = base
        item["selling_price"] = selling_price
        item["available"] = True
        item["has_override"] = bool(ov)
        resolved.append(item)
    return resolved

class ProductOverrideRequest(BaseModel):
    selling_price: Optional[float] = None   # null clears the price override (back to base)
    available: Optional[bool] = None

class CatalogPushRequest(BaseModel):
    product_ids: List[str]
    fields: List[str]                        # subset of ["price", "availability"]
    target: Union[str, List[str]]            # "all" OR a list of store_ids
    selling_price: Optional[float] = None    # value for the price field (defaults to each product's base)
    available: Optional[bool] = None         # value for the availability field (defaults to True)

@api_router.get("/stores/{store_id}/menu")
async def get_store_menu(store_id: str, diet: Optional[str] = None):
    """Resolved menu (master + this store's overrides). Public, like /products."""
    return await resolve_menu_for_store(store_id, diet)

@api_router.put("/stores/{store_id}/products/{product_id}/override")
async def set_product_override(store_id: str, product_id: str, data: ProductOverrideRequest,
                               user=Depends(get_current_user)):
    """Set per-store selling_price / availability for ONE product.
    super_admin: any store · area_manager: own cluster · store_manager: own store ·
    cashier/kitchen: 403."""
    if not role_in(user, "super_admin", "area_manager", "store_manager"):
        raise HTTPException(status_code=403, detail="Manager/HQ only")
    assert_store_allowed(user, store_id)
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    set_fields = {"store_id": store_id, "product_id": product_id,
                  "updated_by": user["id"], "updated_at": datetime.now(timezone.utc).isoformat()}
    if data.selling_price is not None:
        set_fields["selling_price"] = data.selling_price
    if data.available is not None:
        set_fields["available"] = data.available
    await db.product_overrides.update_one(
        {"store_id": store_id, "product_id": product_id},
        {"$set": set_fields, "$setOnInsert": {"id": str(uuid.uuid4())}},
        upsert=True,
    )
    ov = await db.product_overrides.find_one({"store_id": store_id, "product_id": product_id}, {"_id": 0})
    await broadcast_event("menu_update", {"action": "override", "product_id": product_id}, store_id=store_id)
    return ov

@api_router.get("/stores/{store_id}/overrides")
async def list_store_overrides(store_id: str, user=Depends(get_current_user)):
    """List a store's product overrides (scoped to the caller's stores)."""
    if not role_in(user, "super_admin", "area_manager", "store_manager"):
        raise HTTPException(status_code=403, detail="Manager/HQ only")
    assert_store_allowed(user, store_id)
    return await db.product_overrides.find({"store_id": store_id}, {"_id": 0}).to_list(2000)

@api_router.post("/catalog/push")
async def catalog_push(data: CatalogPushRequest, user=Depends(get_current_user)):
    """HQ-only: push price and/or availability for product_ids to ALL stores or a
    selected set. Writes/updates one override per (store, product) and appends a
    single immutable entry to catalog_push_log."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    if not data.product_ids:
        raise HTTPException(status_code=400, detail="product_ids is required")
    fields = [f for f in (data.fields or []) if f in ("price", "availability")]
    if not fields:
        raise HTTPException(status_code=400, detail="fields must include 'price' and/or 'availability'")

    # Resolve targets
    if data.target == "all":
        stores = await db.stores.find({}, {"_id": 0, "store_id": 1}).to_list(1000)
        target_store_ids = [s["store_id"] for s in stores]
    elif isinstance(data.target, list) and data.target:
        target_store_ids = data.target
        for sid in target_store_ids:
            if not await db.stores.find_one({"store_id": sid}, {"_id": 0}):
                raise HTTPException(status_code=404, detail=f"Store not found: {sid}")
    else:
        raise HTTPException(status_code=400, detail="target must be 'all' or a non-empty list of store_ids")

    # Cache product docs (for base-price fallback when no explicit price given)
    products = await db.products.find({"id": {"$in": data.product_ids}}, {"_id": 0}).to_list(2000)
    prod_by_id = {p["id"]: p for p in products}
    now = datetime.now(timezone.utc).isoformat()
    writes = 0
    for sid in target_store_ids:
        for pid in data.product_ids:
            prod = prod_by_id.get(pid)
            if not prod:
                continue
            set_fields = {"store_id": sid, "product_id": pid, "updated_by": user["id"], "updated_at": now}
            if "price" in fields:
                set_fields["selling_price"] = data.selling_price if data.selling_price is not None else _product_base_price(prod)
            if "availability" in fields:
                set_fields["available"] = data.available if data.available is not None else True
            await db.product_overrides.update_one(
                {"store_id": sid, "product_id": pid},
                {"$set": set_fields, "$setOnInsert": {"id": str(uuid.uuid4())}},
                upsert=True,
            )
            writes += 1
            await broadcast_event("menu_update", {"action": "push", "product_id": pid}, store_id=sid)

    # APPEND-ONLY version log (one entry per push). No update/delete route exists.
    summary = f"Pushed {fields} for {len(data.product_ids)} product(s) to {len(target_store_ids)} store(s)"
    log_entry = {
        "id": str(uuid.uuid4()),
        "pushed_by": user["id"],
        "pushed_at": now,
        "product_ids": data.product_ids,
        "fields": fields,
        "target": "all" if data.target == "all" else target_store_ids,
        "store_ids": target_store_ids,
        "writes": writes,
        "summary": summary,
    }
    await db.catalog_push_log.insert_one(log_entry)
    return {k: v for k, v in log_entry.items() if k != "_id"}

@api_router.get("/catalog/push-log")
async def get_catalog_push_log(user=Depends(get_current_user)):
    """HQ-only: read the append-only catalog push history (newest first)."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    return await db.catalog_push_log.find({}, {"_id": 0}).sort("pushed_at", -1).to_list(500)

@api_router.post("/upload/image")
async def upload_image(body: dict = Body(...), user=Depends(get_current_user)):
    """Upload base64 image and store it. Returns the data URI."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    image_data = body.get("image")
    if not image_data:
        raise HTTPException(status_code=400, detail="No image provided")
    # If it already starts with data:, it's a data URI
    if not image_data.startswith("data:"):
        image_data = f"data:image/png;base64,{image_data}"
    image_id = str(uuid.uuid4())
    await db.uploads.insert_one({"id": image_id, "data": image_data, "created_at": datetime.now(timezone.utc).isoformat()})
    return {"id": image_id, "url": image_data}

# ========== CATEGORY MANAGEMENT ==========
@api_router.get("/categories")
async def get_categories():
    """Get all active categories for menu sidebar"""
    categories = await db.categories.find({"is_active": {"$ne": False}}, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return categories

@api_router.get("/categories/all")
async def get_all_categories(user=Depends(get_current_user)):
    """Admin: Get all categories including inactive"""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    categories = await db.categories.find({}, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return categories

@api_router.post("/categories")
async def create_category(category: CategoryCreate, user=Depends(get_current_user)):
    """Admin: Create a new category"""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    
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
        "font_style": category.font_style or "default",
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
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    
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
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    
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
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    
    count = await db.categories.count_documents({})
    if count > 0:
        return {"message": f"{count} categories already exist", "seeded": 0}
    
    default_categories = [
        {"name": "Protein", "key": "Protein", "label": "High Protein", "icon": "barbell", "color": "#E2603F", 
         "image_url": "https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=400&h=400&fit=crop&q=80", "sort_order": 1},
        {"name": "Carb", "key": "Carb", "label": "Healthy Carbs", "icon": "leaf", "color": "#D69A35",
         "image_url": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop&q=80", "sort_order": 2},
        {"name": "Fat", "key": "Fat", "label": "Good Fats", "icon": "water", "color": "#5E97B8",
         "image_url": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=400&h=400&fit=crop&q=80", "sort_order": 3},
        {"name": "Meal", "key": "Meal", "label": "Ready Meals", "icon": "fast-food", "color": "#15140F",
         "image_url": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=400&fit=crop&q=80", "sort_order": 4},
        {"name": "Veg", "key": "veg", "label": "Veg Only", "icon": "nutrition", "color": "#3FA34D",
         "image_url": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop&q=80", "sort_order": 5},
        {"name": "Non-Veg", "key": "non-veg", "label": "Non-Veg", "icon": "flame", "color": "#C0392B",
         "image_url": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=400&fit=crop&q=80", "sort_order": 6},
    ]
    
    for cat in default_categories:
        cat["id"] = str(uuid.uuid4())
        cat["is_active"] = True
        cat["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.categories.insert_many(default_categories)
    return {"message": "Default categories seeded", "seeded": len(default_categories)}

@api_router.get("/admin/dashboard-stats")
async def admin_dashboard_stats(user=Depends(get_current_user)):
    """Admin dashboard: aggregated stats"""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    products_count = await db.products.count_documents({"is_active": True})
    categories_count = await db.categories.count_documents({"is_active": {"$ne": False}})
    today_orders = await db.orders.find({"created_at": {"$regex": f"^{today}"}}, {"_id": 0, "total_price": 1, "status": 1}).to_list(500)
    low_stock = await low_stock_alerts(user, limit=50)  # Fix 2: live inventory_items, not frozen global
    pending_orders = await db.orders.count_documents({"status": {"$in": ["pending", "preparing"]}})
    revenue = sum(o.get("total_price", 0) for o in today_orders)
    return {
        "products": products_count,
        "categories": categories_count,
        "today_orders": len(today_orders),
        "pending_orders": pending_orders,
        "revenue": round(revenue, 2),
        "low_stock_alerts": low_stock
    }

@api_router.get("/admin/staff-accounts")
async def admin_staff_accounts(user=Depends(get_current_user)):
    """Admin: list kitchen & cashier accounts"""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    staff = await db.users.find({"role": {"$in": ["kitchen", "cashier"]}}, {"_id": 0, "password": 0}).to_list(20)
    return staff

@api_router.put("/admin/staff/{staff_id}/reset-pin")
async def admin_reset_staff_pin(staff_id: str, body: dict = Body(...), user=Depends(get_current_user)):
    """Admin: reset a staff member's PIN"""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    new_pin = body.get("pin")
    if not new_pin or len(new_pin) < 4:
        raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")
    result = await db.users.update_one({"id": staff_id}, {"$set": {"pin": new_pin}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Staff not found")
    return {"message": "PIN updated"}

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
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    import random
    nutrition = resolved_nutrition(data.name, data.calories_per_100g, data.protein_per_100g, data.carbs_per_100g, data.fat_per_100g)
    cost_per_100g = round((data.price / data.grams) * 100, 2)
    description = await ai_generate_description(data.name, "single")
    image_url = await ai_generate_food_image(data.name, "single")
    
    # Resolve category from category_id or fallback to nutrition
    category_name = nutrition["category"]
    if data.category_id:
        cat = await db.categories.find_one({"id": data.category_id}, {"_id": 0})
        if cat:
            category_name = cat["name"]

    diet_type = data.diet_type or nutrition.get("diet_type", detect_diet_type(data.name))
    diet_types = normalize_diet_types(data.diet_types, diet_type, data.name)

    product_id = str(uuid.uuid4())
    product = {
        "id": product_id,
        "name": data.name,
        "product_type": "single",
        "cost_per_100g": cost_per_100g,
        "base_price": data.price,
        "base_grams": data.grams,
        "available_qty_grams": data.grams,
        "category": category_name,
        "category_id": data.category_id,
        "diet_type": diet_type,
        "diet_types": diet_types,
        "calories_per_100g": nutrition["calories"],
        "protein_per_100g": nutrition["protein"],
        "carbs_per_100g": nutrition["carbs"],
        "fat_per_100g": nutrition["fat"],
        "preparation_time_minutes": data.preparation_time_minutes or 8,
        "is_active": True,
        "image_url": image_url,
        "description": description,
        "rating": round(random.uniform(3.8, 4.9), 1),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product)
    await broadcast_event("menu_update", {"action": "created", "product_id": product_id})
    return {k: v for k, v in product.items() if k != "_id"}

@api_router.post("/products/ready-made")
async def create_ready_made_meal(data: ReadyMadeMealCreate, user=Depends(get_current_user)):
    """Create ready-made meal with AI description, AI-generated image, and auto nutrition"""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
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
    
    # Resolve category from category_id or fallback to nutrition
    category_name = nutrition["category"]
    if data.category_id:
        cat = await db.categories.find_one({"id": data.category_id}, {"_id": 0})
        if cat:
            category_name = cat["name"]

    product_id = str(uuid.uuid4())
    product = {
        "id": product_id,
        "name": data.name,
        "product_type": "ready_made",
        "cost_per_100g": cost_per_100g,
        "fixed_price": data.price,
        "serving_grams": data.serving_grams,
        "ingredients": linked_ingredients,
        "images": data.images,
        "is_editable": data.is_editable,
        "available_servings": 20,
        "category": category_name,
        "category_id": data.category_id,
        "diet_type": "non-veg" if is_nonveg else "veg",
        "calories_per_100g": nutrition["calories"],
        "protein_per_100g": nutrition["protein"],
        "carbs_per_100g": nutrition["carbs"],
        "fat_per_100g": nutrition["fat"],
        "total_calories_per_serving": nutrition.get("total_calories", 0),
        "total_protein_per_serving": nutrition.get("total_protein", 0),
        "total_carbs_per_serving": nutrition.get("total_carbs", 0),
        "total_fat_per_serving": nutrition.get("total_fat", 0),
        "preparation_time_minutes": data.preparation_time_minutes or 15,
        "is_active": True,
        "image_url": image_url,
        "description": description,
        "rating": round(random.uniform(3.8, 4.9), 1),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product)
    await broadcast_event("menu_update", {"action": "created", "product_id": product_id})
    return {k: v for k, v in product.items() if k != "_id"}

# ========== STOCK CHECK FOR READY-MADE DISHES ==========
async def check_ready_made_stock(product_id: str, quantity: int = 1, store_id: Optional[str] = None) -> Dict:
    """Ready-made availability — SINGLE path, delegates to raw_meal_available over
    THIS store's raw inventory_items. (Phase 3D: no longer reads the legacy
    global available_qty_grams.)"""
    product = await db.products.find_one({"id": product_id, "product_type": "ready_made"}, {"_id": 0})
    if not product:
        return {"available": False, "reason": "Product not found"}
    sid = store_id or DEFAULT_STORE_ID
    ok = await raw_meal_available(sid, product_id, quantity)
    return {"available": ok} if ok else {"available": False, "reason": "Insufficient stock"}

@api_router.get("/products/{product_id}/check-stock")
async def check_product_stock(product_id: str, quantity: int = 1, store_id: Optional[str] = None):
    """Check stock availability for a ready-made dish (from a store's raw inventory)."""
    return await check_ready_made_stock(product_id, quantity, store_id)

# ========== ORDER ROUTES ==========
@api_router.post("/orders")
async def create_order(data: OrderCreate, user=Depends(get_current_user)):
    order_id = str(uuid.uuid4())[:8].upper()
    # Multi-store: every order is tied to a store. POS/staff orders use the staff
    # member's own store; customer orders carry the selected store_id.
    store_id = await resolve_order_store_id(user, data.store_id)
    # FIX 1 — server-authoritative bill (anti-tamper). Prices, discount, delivery
    # fee, GST and totals are recomputed here from the store's resolved menu +
    # validate_offer_for_order; client-sent money fields are NOT trusted.
    bill = await compute_authoritative_bill(
        [it.dict() for it in data.items], data.order_type, data.coupon_code,
        (data.tip or 0), store_id, user)
    # A coupon the client asked for that the server rejects -> 400 (no silent discount).
    if data.coupon_code and not bill["coupon_applied"]:
        raise HTTPException(status_code=400, detail={"error": "coupon_rejected",
                            "reason": bill.get("coupon_error") or "Coupon not valid for this order"})
    # Anti-tamper: reject if the client tries to pay LESS than the server bill
    # (net food). Client money fields are ignored either way; the saved order uses
    # the server numbers below.
    if data.total_price is not None and float(data.total_price) < bill["net_food"] - 1.00:
        raise HTTPException(status_code=400, detail={"error": "price_mismatch",
                            "server_total": bill["net_food"], "client_total": float(data.total_price)})
    extra_charge = bill["delivery_fee"]
    tip_amount = bill["tip"]

    # B3: Duplicate-order guard. Flag identical order from same user/table within 2 minutes.
    if not data.confirm_duplicate:
        def _sig(items):
            return sorted([f"{i.get('product_id')}|{i.get('grams', 0)}|{i.get('quantity', 1)}" for i in items])
        new_sig = _sig([it.dict() for it in data.items])
        two_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
        # Scope the duplicate check to THIS store so identical table numbers at
        # different stores never collide.
        dup_query = {"created_at": {"$gte": two_min_ago}, "status": {"$nin": ["cancelled"]}, "store_id": store_id}
        if data.table_number is not None:
            dup_query["$or"] = [{"user_id": user["id"]}, {"table_number": data.table_number}]
        else:
            dup_query["user_id"] = user["id"]
        recent = await db.orders.find(dup_query, {"_id": 0}).to_list(20)
        for r in recent:
            if _sig(r.get("items", [])) == new_sig:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "warning": "duplicate_order",
                        "message": "An identical order was just placed moments ago. Place it again?",
                        "existing_order_id": r["id"],
                    },
                )

    # Process items and build order with ingredient breakdowns for kitchen
    processed_items = []
    for item in data.items:
        item_data = item.dict()
        
        # For ready-made dishes, check stock and add ingredient breakdown
        if item.product_type == "ready_made":
            product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
            if product:
                quantity = item.quantity or 1
                
                # Phase 3C: availability from THIS store's raw inventory (graceful)
                if not await raw_meal_available(store_id, item.product_id, quantity):
                    raise HTTPException(status_code=400, detail=f"Insufficient stock for {item.product_name}")
                
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
        # Phase 3D: stock is decremented ONLY from per-store inventory_items
        # (decrement_stock_for_order, after the order is saved). The legacy global
        # product.available_qty_grams is no longer touched on sale.
        processed_items.append(item_data)
    
    # Determine status based on scheduled or immediate
    is_scheduled = data.is_scheduled and data.scheduled_ready_time
    if is_scheduled:
        order_status = "scheduled"
        ready_dt = datetime.fromisoformat(data.scheduled_ready_time.replace('Z', '+00:00'))
        # B5: alert lead time = LONGEST prep time among the ordered items (+ delivery buffer)
        prep_times = []
        for it in data.items:
            prod = await db.products.find_one({"id": it.product_id}, {"_id": 0})
            if prod and prod.get("preparation_time_minutes"):
                prep_times.append(prod["preparation_time_minutes"])
        max_prep = max(prep_times) if prep_times else 10
        alert_minutes = max_prep + (15 if data.order_type == "delivery" else 0)
        kitchen_alert_time = (ready_dt - timedelta(minutes=alert_minutes)).isoformat()
    else:
        order_status = "preparing" if getattr(data, 'payment_mode', None) in ("cash", "upi", "card", "other") else "pending"
        kitchen_alert_time = None

    order = {
        "id": order_id,
        "store_id": store_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "order_type": data.order_type,
        "items": processed_items,
        "total_price": bill["total"],                       # server-authoritative grand total
        "extra_charge": extra_charge,
        "delivery_fee": bill["delivery_fee"] if data.order_type == "delivery" else (extra_charge if data.order_type == "takeaway" else 0),
        "tip": tip_amount,
        "delivery_time": data.delivery_time if data.order_type == "delivery" else None,
        "gstin": data.gstin,
        "business_name": data.business_name,
        "item_subtotal": bill["item_subtotal"],             # server-authoritative
        "total_calories": data.total_calories,
        "total_protein": data.total_protein,
        "total_carbs": data.total_carbs,
        "total_fat": data.total_fat,
        "fitness_goal": data.fitness_goal,
        "payment_mode": getattr(data, 'payment_mode', None) or "cash",
        "coupon_code": data.coupon_code if bill["coupon_applied"] else None,
        "discount": bill["discount"],                       # ONLY from validate_offer_for_order
        "customer_name": data.customer_name or user["name"],
        "order_source": "walk_in" if role_in(user, "cashier", "store_manager", "super_admin") else "app",
        "gst_percent": 5,
        "gst_amount": bill["gst_amount"],                   # server-authoritative
        "base_amount": bill["base_amount"],                 # server-authoritative
        "status": order_status,
        "payment_status": "paid" if getattr(data, 'payment_mode', None) in ("cash", "upi", "card", "other") else "unpaid",
        "is_scheduled": bool(is_scheduled),
        "scheduled_ready_time": data.scheduled_ready_time if is_scheduled else None,
        "kitchen_alert_time": kitchen_alert_time,
        "schedule_confirmed": False if is_scheduled else None,
        "table_number": data.table_number,
        "delivery_address": data.delivery_address if data.order_type == "delivery" else None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.orders.insert_one(order)

    # Phase 3C: decrement THIS store's raw inventory via recipe explosion
    # (idempotent per order_id, graceful if a raw row is missing — never blocks).
    try:
        await decrement_stock_for_order(order, user["id"])
    except Exception as e:
        logger.error(f"[3C] stock decrement error for order {order_id}: {e}")

    # Phase 2A: record ONE coupon redemption per PLACED order (append-only).
    # Quote / apply-coupon never write here — only successful placement does, and
    # only if the SERVER actually applied the coupon (FIX 1).
    if data.coupon_code and bill["coupon_applied"]:
        off = await db.offers.find_one({"coupon_code": data.coupon_code}, {"_id": 0})
        await db.coupon_redemptions.insert_one({
            "id": str(uuid.uuid4()),
            "offer_id": off["id"] if off else None,
            "coupon_code": data.coupon_code,
            "user_id": user["id"],
            "store_id": store_id,
            "order_id": order_id,
            "redeemed_at": datetime.now(timezone.utc).isoformat(),
        })

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
    # Auto-earn loyalty points (1 point per ₹10)
    points = max(1, int(order["total_price"] / 10))
    await db.loyalty.update_one(
        {"user_id": user["id"]},
        {"$inc": {"points": points, "total_earned": points},
         "$push": {"history": {"order_id": order_id, "points": points, "type": "earned", "date": datetime.now(timezone.utc).isoformat()}}},
        upsert=True
    )
    # Auto-update streak
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    streak_data = await db.streaks.find_one({"user_id": user["id"]}, {"_id": 0})
    if not streak_data:
        streak_data = {"user_id": user["id"], "current_streak": 0, "longest_streak": 0, "last_order_date": None, "total_orders": 0}
    last_date = streak_data.get("last_order_date")
    if last_date != today:
        if last_date == yesterday:
            streak_data["current_streak"] = streak_data.get("current_streak", 0) + 1
        else:
            streak_data["current_streak"] = 1
        streak_data["last_order_date"] = today
        streak_data["total_orders"] = streak_data.get("total_orders", 0) + 1
        streak_data["longest_streak"] = max(streak_data.get("longest_streak", 0), streak_data["current_streak"])
        await db.streaks.update_one({"user_id": user["id"]}, {"$set": streak_data}, upsert=True)
    # Notify kitchen about new order (skip for scheduled - kitchen gets alerted at alert time)
    if not is_scheduled:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "user_id": "kitchen", "store_id": store_id, "title": "New Order!",
            "body": f"Order #{order_id} from {user['name']} ({data.order_type})",
            "type": "new_order", "order_id": order_id, "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    else:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "user_id": "kitchen", "store_id": store_id, "title": "Scheduled Order",
            "body": f"Order #{order_id} scheduled for {data.scheduled_ready_time} ({data.order_type})",
            "type": "scheduled_order", "order_id": order_id, "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    # Real-time push (C1 + C5): notify ONLY this store's staff panels of the new order
    clean_order = {k: v for k, v in order.items() if k != "_id"}
    await broadcast_event("new_order", clean_order, store_id=store_id)
    # Stock changed -> tell customer apps + POS to refresh menu (C3)
    await broadcast_event("menu_update", {"action": "stock_changed"})
    return clean_order

@api_router.get("/orders")
async def list_orders(user=Depends(get_current_user)):
    """Customer: own orders. Staff: orders within their store scope.
    Kitchen: active orders in their store. Cashier/Manager/HQ/Area: all (in-scope) orders."""
    if role_in(user, *STAFF_ROLES):
        scope = store_filter(user)
        if normalize_role(user) == "kitchen":
            query = {**scope, "status": {"$in": ["pending", "accepted", "preparing", "ready"]}}
            orders = await db.orders.find(query, {"_id": 0}).sort("created_at", 1).to_list(100)
        else:
            orders = await db.orders.find(scope, {"_id": 0}).sort("created_at", -1).to_list(100)
    else:
        orders = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return orders

@api_router.get("/orders/kitchen")
async def kitchen_orders(user=Depends(get_current_user)):
    """Kitchen/Manager/HQ: active orders for the caller's store(s)."""
    if not role_in(user, "super_admin", "area_manager", "store_manager", "kitchen"):
        raise HTTPException(status_code=403, detail="Kitchen staff only")
    query = {**store_filter(user), "status": {"$in": ["pending", "accepted", "preparing"]}}
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", 1).to_list(100)
    return orders

@api_router.get("/orders/all")
async def all_orders(user=Depends(get_current_user)):
    if not role_in(user, "super_admin", "area_manager", "store_manager", "cashier"):
        raise HTTPException(status_code=403, detail="Cashier/Manager/HQ only")
    orders = await db.orders.find(store_filter(user), {"_id": 0}).sort("created_at", -1).to_list(100)
    return orders

@api_router.get("/orders/scheduled")
async def get_scheduled_orders(user=Depends(get_current_user)):
    """Kitchen/Manager/HQ: scheduled orders (upcoming + alert-ready) for their store(s)."""
    if not role_in(user, "super_admin", "area_manager", "store_manager", "kitchen"):
        raise HTTPException(status_code=403, detail="Kitchen staff only")
    query = {**store_filter(user), "is_scheduled": True, "status": "scheduled"}
    orders = await db.orders.find(query, {"_id": 0}).sort("scheduled_ready_time", 1).to_list(100)
    now = datetime.now(timezone.utc).isoformat()
    for o in orders:
        o["alert_triggered"] = o.get("kitchen_alert_time", "") <= now if o.get("kitchen_alert_time") else False
    return orders

@api_router.post("/orders/{order_id}/confirm-scheduled")
async def confirm_scheduled_order(order_id: str, user=Depends(get_current_user)):
    """Kitchen confirms a scheduled order and moves it to preparing"""
    if not role_in(user, "super_admin", "store_manager", "kitchen"):
        raise HTTPException(status_code=403, detail="Kitchen staff only")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    assert_store_allowed(user, order.get("store_id"))
    if order.get("status") != "scheduled":
        raise HTTPException(status_code=400, detail="Order is not in scheduled status")
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": "preparing", "schedule_confirmed": True, "confirmed_at": datetime.now(timezone.utc).isoformat()}}
    )
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    try:
        await notify_order_status(order_id, "preparing")
    except Exception:
        pass
    await broadcast_event("order_status", updated, store_id=updated.get("store_id"))
    if updated and updated.get("user_id"):
        await broadcast_event("order_status", updated, rooms=[f"user:{updated['user_id']}"])
    return updated

@api_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str, user=Depends(get_current_user)):
    """Staff: update order status (only within their store scope)."""
    if not role_in(user, "super_admin", "store_manager", "kitchen", "cashier"):
        raise HTTPException(status_code=403, detail="Staff only")
    if status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {ORDER_STATUSES}")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    assert_store_allowed(user, order.get("store_id"))
    await db.orders.update_one({"id": order_id}, {"$set": {"status": status}})
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    # Auto push notification on status change
    try:
        await notify_order_status(order_id, status)
    except Exception:
        pass
    # Real-time propagation to this store's staff panels + the customer's tracking screen (C1/C2)
    await broadcast_event("order_status", order, store_id=order.get("store_id"))
    if order.get("user_id"):
        await broadcast_event("order_status", order, rooms=[f"user:{order['user_id']}"])
    return order

# ========== POPULAR ITEMS (Based on Previous Day Sales) ==========
@api_router.get("/products/popular")
async def get_popular_products(user=Depends(get_current_user)):
    """Get popular products based on previous day orders"""
    
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

@api_router.get("/products/best-sellers")
async def best_sellers(limit: int = 30):
    """Top N best-selling products across ALL order history (rating fallback).
    Public (no auth) so the home grid always loads."""
    orders = await db.orders.find({}, {"_id": 0, "items": 1}).to_list(5000)
    sales: dict = {}
    for o in orders:
        for it in o.get("items", []):
            pid = it.get("product_id")
            if pid:
                sales[pid] = sales.get(pid, 0) + (it.get("quantity") or 1)
    # Only active products in active categories
    active_cats = await db.categories.find({"is_active": {"$ne": False}}, {"_id": 0, "name": 1}).to_list(100)
    active_cat_names = {c["name"] for c in active_cats}
    products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(500)
    if active_cat_names:
        products = [p for p in products if p.get("category", "") in active_cat_names or not p.get("category")]
    for p in products:
        p["sales_count"] = sales.get(p["id"], 0)
    products.sort(key=lambda p: (-p.get("sales_count", 0), -p.get("rating", 0)))
    return products[:max(1, limit)]

@api_router.get("/products/top-selling-by-category")
async def top_selling_by_category(user=Depends(get_current_user)):
    """Top 5 highest-selling products from EACH active category.
    Sales are counted from all order history; ties (and zero-sales) fall back to rating."""
    # Count units sold per product across all orders
    orders = await db.orders.find({}, {"_id": 0, "items": 1}).to_list(2000)
    product_sales: dict = {}
    for order in orders:
        for item in order.get("items", []):
            pid = item.get("product_id")
            if pid:
                product_sales[pid] = product_sales.get(pid, 0) + (item.get("quantity") or 1)

    # Only consider active categories
    active_cats = await db.categories.find({"is_active": {"$ne": False}}, {"_id": 0, "name": 1}).to_list(100)
    active_cat_names = {c["name"] for c in active_cats}

    products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(500)

    # Group active products by category
    by_cat: dict = {}
    for p in products:
        cat = p.get("category") or "Other"
        if active_cat_names and cat not in active_cat_names:
            continue
        p["sales_count"] = product_sales.get(p["id"], 0)
        by_cat.setdefault(cat, []).append(p)

    # For each category, take the top 5 (by sales, then rating)
    result = []
    for cat in sorted(by_cat.keys()):
        ranked = sorted(by_cat[cat], key=lambda x: (-x.get("sales_count", 0), -x.get("rating", 0)))
        result.extend(ranked[:5])
    return result

# ========== AI ROUTES ==========
@api_router.post("/ai/suggest")
async def ai_suggest(data: AISuggestRequest, user=Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(100)
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
            system_message="You are a nutrition expert. Always respond in valid JSON format only. You are NOT a doctor: never give medical, clinical, or diagnostic advice; for health conditions advise consulting a professional."
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

        # Define strict nutrition guidelines for each goal
        GOAL_GUIDELINES = {
            "fat_loss": {
                "description": "Fat Loss - High protein, low carb, calorie deficit",
                "target_calories": "400-600 kcal per meal",
                "protein_priority": "50-60% of budget on protein sources",
                "macro_ratio": "High protein (40-50%), Low carb (20-30%), Moderate fat (20-30%)",
                "foods_to_prioritize": "Lean proteins (chicken, fish, egg whites, tofu), Low-calorie vegetables",
                "foods_to_avoid": "High-carb items (rice, bread), High-fat items",
                "portion_size": "Smaller portions, focus on protein density"
            },
            "muscle_gain": {
                "description": "Muscle Gain - High protein, high carb, calorie surplus",
                "target_calories": "700-1000 kcal per meal",
                "protein_priority": "40-50% of budget on protein sources",
                "macro_ratio": "High protein (35-45%), High carb (40-50%), Moderate fat (15-25%)",
                "foods_to_prioritize": "Lean proteins, Complex carbs (brown rice, quinoa, oats), Healthy fats",
                "foods_to_avoid": "Low-calorie items that don't support growth",
                "portion_size": "Larger portions to support muscle building"
            },
            "maintenance": {
                "description": "Maintenance - Balanced nutrition",
                "target_calories": "500-700 kcal per meal",
                "protein_priority": "30-40% of budget on protein sources",
                "macro_ratio": "Balanced - Protein (30-35%), Carbs (35-45%), Fat (20-30%)",
                "foods_to_prioritize": "Variety of proteins, carbs, and fats",
                "foods_to_avoid": "None - balanced approach",
                "portion_size": "Moderate portions for energy balance"
            },
            "beginner": {
                "description": "Beginner / Adaptation Phase - Easy to digest, moderate calories",
                "target_calories": "450-600 kcal per meal",
                "protein_priority": "30-40% of budget on easily digestible proteins",
                "macro_ratio": "Moderate protein (30-35%), Moderate carb (40-45%), Lower fat (20-25%)",
                "foods_to_prioritize": "Easy to digest proteins (paneer, dal, egg whites), Simple carbs (brown rice, oats), Easily digestible foods",
                "foods_to_avoid": "Very high fiber items, Heavy/rich foods, Excessive fats",
                "portion_size": "Moderate portions to allow body adaptation"
            },
            "recovery": {
                "description": "Recovery / Deload Phase - Lower intensity, anti-inflammatory",
                "target_calories": "400-550 kcal per meal",
                "protein_priority": "30-35% of budget on protein for recovery",
                "macro_ratio": "Moderate protein (30-35%), Lower carb (30-35%), Moderate-high healthy fats (30-35%)",
                "foods_to_prioritize": "Quality proteins, Anti-inflammatory foods, Healthy fats (avocado, nuts), Vegetables",
                "foods_to_avoid": "Excessive carbs, Processed foods, High-sugar items",
                "portion_size": "Slightly smaller portions to aid recovery"
            },
            "recomposition": {
                "description": "Recomposition / Body Recomp - Build muscle AND lose fat simultaneously at maintenance calories",
                "target_calories": "500-650 kcal per meal (maintenance-level)",
                "protein_priority": "45-55% of budget on high-quality protein (VERY high protein)",
                "macro_ratio": "Very high protein (40-45%), Moderate carb (30-35%), Moderate fat (20-25%)",
                "foods_to_prioritize": "Lean proteins (chicken, fish, egg whites, paneer, tofu), Fibrous vegetables, Moderate complex carbs",
                "foods_to_avoid": "Refined sugars, Excess oils/fats, Empty-calorie carbs",
                "portion_size": "Moderate, maintenance-level portions with a strong protein emphasis"
            },
            "lean_bulk": {
                "description": "Lean Bulk - Slight calorie surplus to build muscle with minimal fat gain",
                "target_calories": "650-850 kcal per meal (slight surplus ~+10-15%)",
                "protein_priority": "40-50% of budget on protein sources (high protein)",
                "macro_ratio": "High protein (30-35%), High carb (40-50%), Controlled fat (15-20%)",
                "foods_to_prioritize": "Lean proteins, Complex carbs (brown rice, quinoa, oats), Controlled healthy fats",
                "foods_to_avoid": "Excessive fats and fried foods, Empty calories that add fat instead of muscle",
                "portion_size": "Slightly larger portions for a controlled surplus"
            }
        }

        goal_guide = GOAL_GUIDELINES.get(data.goal, GOAL_GUIDELINES["maintenance"])

        # Get user's daily targets from profile
        user_goals = {
            "daily_calories": user.get("daily_calories", 2000),
            "daily_protein": user.get("daily_protein", 100),
            "daily_carbs": user.get("daily_carbs", 250),
            "daily_fat": user.get("daily_fat", 65),
            "fitness_goal": user.get("fitness_goal", "maintenance")
        }

        # Step 0: Fetch available products with real stock (multi diet-tag match)
        _prefs = diet_prefs_to_list(data.diet_preference)
        products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(100)
        products = [ensure_product_diet_types(p) for p in products]
        if _prefs:
            products = [p for p in products if product_matches_diet(p, _prefs)]
        if not products:
            return {"meal_items": [], "summary": "No products available for your preference.", "totals": {}}

        # Build stock-aware menu string for AI
        available_str = "\n".join([
            f"- {p['name']} ({p.get('diet_type','veg')}): ₹{p['cost_per_100g']}/100g | {p['calories_per_100g']}cal, P:{p['protein_per_100g']}g, C:{p['carbs_per_100g']}g, F:{p['fat_per_100g']}g per 100g | MAX available: {int(p['available_qty_grams'])}g"
            for p in products
        ])
        diet_pref_str = (", ".join(_prefs).upper() + " ONLY") if _prefs else "Both veg and non-veg allowed"
        budget_str = f"Budget: ₹{data.budget}" if data.budget else "No specific budget"

        # User's fitness profile
        user_profile_str = f"""
**USER'S DAILY TARGETS:**
- Daily Calorie Target: {user_goals['daily_calories']} kcal
- Daily Protein Target: {user_goals['daily_protein']}g
- Daily Carbs Target: {user_goals['daily_carbs']}g
- Daily Fat Target: {user_goals['daily_fat']}g
- User's Fitness Goal: {user_goals['fitness_goal']}

NOTE: This is ONE MEAL. Keep portions reasonable to fit within user's daily targets (typically 25-35% of daily calories per meal)."""

        # HYBRID STEP 1: AI picks items with STRICT goal-based guidelines
        prompt = f"""You are a professional nutritionist and meal planner. Create a meal that STRICTLY follows the fitness goal guidelines.

**GOAL: {goal_guide['description']}**

{user_profile_str}

**STRICT NUTRITIONAL REQUIREMENTS:**
- Target Calories: {goal_guide['target_calories']}
- Protein Priority: {goal_guide['protein_priority']}
- Macro Ratio: {goal_guide['macro_ratio']}
- Foods to Prioritize: {goal_guide['foods_to_prioritize']}
- Foods to Avoid: {goal_guide['foods_to_avoid']}
- Portion Size: {goal_guide['portion_size']}

**CUSTOMER PREFERENCES:**
- Diet: {diet_pref_str}
- {budget_str}

**AVAILABLE MENU (with MAX stock):**
{available_str}

**CRITICAL RULES - YOU MUST FOLLOW THESE EXACTLY:**
1. Pick 3-5 items that STRICTLY ALIGN with the {data.goal} goal guidelines above
2. ONLY pick items from the available menu
3. Use EXACT product names as listed
4. For each item, assign budget_share_percent (total must equal 100)
5. DO NOT exceed MAX available stock
6. PRIORITIZE foods listed in "Foods to Prioritize" for {data.goal}
7. AVOID or MINIMIZE foods listed in "Foods to Avoid" for {data.goal}
8. Ensure the meal targets the specified calorie range and macro ratios
9. For {data.goal} specifically:
   - {"Focus on lean proteins and low-carb vegetables. Minimize rice, bread, and high-fat items." if data.goal == "fat_loss" else ""}
   - {"Include substantial protein AND complex carbs. Higher calorie items preferred." if data.goal == "muscle_gain" else ""}
   - {"Balance of all macros - variety is key." if data.goal == "maintenance" else ""}
   - {"Easy to digest proteins (paneer, dal, egg whites) and simple carbs. Avoid heavy foods." if data.goal == "beginner" else ""}
   - {"Quality proteins, healthy fats (nuts, avocado), vegetables. Lower carbs." if data.goal == "recovery" else ""}
   - {"Maintenance-level calories with VERY high protein to build muscle and lose fat at the same time. Moderate carbs, moderate fats." if data.goal == "recomposition" else ""}
   - {"Slight calorie surplus (~+10-15%) with high protein and controlled fats to gain lean muscle while minimizing fat gain." if data.goal == "lean_bulk" else ""}

Respond ONLY in this JSON format (no markdown, no backticks):
{{"items": [{{"product_name": "Exact Name", "budget_share_percent": 40, "reason": "Why this fits {data.goal} goal"}}], "summary": "One line explaining how this meal supports {data.goal}"}}"""

        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY', ''),
            session_id=f"quickmeal-{uuid.uuid4()}",
            system_message=f"You are a professional nutritionist. You MUST strictly follow {data.goal} guidelines. You are NOT a doctor: do not give medical/clinical/diagnostic advice; for health conditions advise consulting a professional. Respond ONLY in valid JSON. No markdown, no backticks, no extra text."
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=prompt))

        # Parse AI response
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            cleaned = cleaned.rsplit("```", 1)[0]
        result = json.loads(cleaned)

        ai_picks = result.get("items", result.get("meal_items", []))
        if not ai_picks:
            return {"meal_items": [], "summary": "AI returned no items. Please try again.", "totals": {}}

        # HYBRID STEP 2: Match AI picks to real products
        matched = []
        for pick in ai_picks:
            name = pick.get("product_name", "")
            product = next((p for p in products if p["name"].lower() == name.lower()), None)
            if not product:
                product = next((p for p in products if name.lower() in p["name"].lower() or p["name"].lower() in name.lower()), None)
            if product:
                share = max(5, pick.get("budget_share_percent", round(100 / len(ai_picks))))
                matched.append({"product": product, "share": share, "reason": pick.get("reason", "")})

        if not matched:
            return {"meal_items": [], "summary": "Could not match AI suggestions to menu. Try again.", "totals": {}}

        # Normalize shares to 100%
        total_share = sum(m["share"] for m in matched)
        for m in matched:
            m["share"] = m["share"] / total_share * 100

        # HYBRID STEP 3: System calculates EXACT grams from budget + stock
        budget = data.budget or 300
        enriched_items = []
        for m in matched:
            p = m["product"]
            budget_for_item = budget * m["share"] / 100
            # Calculate grams from budget: grams = (budget_for_item / cost_per_100g) * 100
            raw_grams = (budget_for_item / p["cost_per_100g"]) * 100
            # Enforce stock limit
            max_stock = p.get("available_qty_grams", 9999)
            capped_grams = min(raw_grams, max_stock - 10)  # leave 10g buffer
            # Round to nearest 5g for clean portions
            final_grams = max(10, round(capped_grams / 5) * 5)

            factor = final_grams / 100
            enriched_items.append({
                "product_id": p["id"],
                "product_name": p["name"],
                "grams": final_grams,
                "price": round(factor * p["cost_per_100g"], 2),
                "calories": round(factor * p["calories_per_100g"], 1),
                "protein": round(factor * p["protein_per_100g"], 1),
                "carbs": round(factor * p["carbs_per_100g"], 1),
                "fat": round(factor * p["fat_per_100g"], 1),
                "diet_type": p.get("diet_type", "veg"),
                "image_url": p.get("image_url"),
                "reason": m["reason"],
                "cost_per_100g": p["cost_per_100g"],
                "calories_per_100g": p["calories_per_100g"],
                "protein_per_100g": p["protein_per_100g"],
                "carbs_per_100g": p["carbs_per_100g"],
                "fat_per_100g": p["fat_per_100g"],
                "category": p.get("category", ""),
                "max_stock": int(max_stock),
            })

        # HYBRID STEP 4: Precise budget adjustment — close the gap exactly
        def recalc_item(item: dict, grams: int):
            f = grams / 100
            item["grams"] = grams
            item["price"] = round(f * item["cost_per_100g"], 2)
            item["calories"] = round(f * item["calories_per_100g"], 1)
            item["protein"] = round(f * item["protein_per_100g"], 1)
            item["carbs"] = round(f * item["carbs_per_100g"], 1)
            item["fat"] = round(f * item["fat_per_100g"], 1)

        def calc_total(items):
            t = {"price": 0, "calories": 0, "protein": 0, "carbs": 0, "fat": 0}
            for it in items:
                for k in t:
                    t[k] += it[k]
            return {k: round(v, 2) for k, v in t.items()}

        totals = calc_total(enriched_items)

        # Iterative adjustment: distribute remaining budget across items
        for _round in range(5):
            gap = round(budget - totals["price"], 2)
            if abs(gap) < 0.50:
                break
            # Pick cheapest per-gram item with stock headroom to adjust
            adjustable = [it for it in enriched_items if it["grams"] < it.get("max_stock", 9999) - 20]
            if not adjustable and gap > 0:
                adjustable = enriched_items  # fallback
            if gap > 0 and adjustable:
                # Under budget: add grams to the item with most stock headroom
                adj = max(adjustable, key=lambda x: x.get("max_stock", 9999) - x["grams"])
                extra_g = round(gap / adj["cost_per_100g"] * 100)
                new_g = min(adj["grams"] + extra_g, adj.get("max_stock", 9999) - 5)
                new_g = max(10, round(new_g))
                recalc_item(adj, new_g)
            elif gap < 0 and enriched_items:
                # Over budget: trim from most expensive item
                adj = max(enriched_items, key=lambda x: x["price"])
                trim_g = max(1, round(abs(gap) / adj["cost_per_100g"] * 100) + 1)
                new_g = max(10, adj["grams"] - trim_g)
                recalc_item(adj, new_g)
            totals = calc_total(enriched_items)

        # Final hard cap
        if totals["price"] > budget:
            adj = max(enriched_items, key=lambda x: x["price"])
            over = totals["price"] - budget
            trim_g = max(1, round(over / adj["cost_per_100g"] * 100) + 1)
            recalc_item(adj, max(10, adj["grams"] - trim_g))
            totals = calc_total(enriched_items)

        # Round totals for display
        totals = {k: round(v, 1) for k, v in totals.items()}

        # Check against user's daily targets and provide warnings
        warnings = []
        meal_percentage = {
            "calories": round((totals["calories"] / user_goals["daily_calories"]) * 100, 1),
            "protein": round((totals["protein"] / user_goals["daily_protein"]) * 100, 1),
            "carbs": round((totals["carbs"] / user_goals["daily_carbs"]) * 100, 1),
            "fat": round((totals["fat"] / user_goals["daily_fat"]) * 100, 1)
        }

        # Generate warnings if meal exceeds recommended single-meal portion (35% of daily)
        if meal_percentage["calories"] > 35:
            warnings.append(f"⚠️ This meal contains {meal_percentage['calories']}% of your daily calorie target. Consider reducing portion sizes.")
        if meal_percentage["protein"] > 40:
            warnings.append(f"⚠️ High protein content: {meal_percentage['protein']}% of your daily target in one meal.")
        if meal_percentage["carbs"] > 40:
            warnings.append(f"⚠️ High carb content: {meal_percentage['carbs']}% of your daily target in one meal.")
        if meal_percentage["fat"] > 40:
            warnings.append(f"⚠️ High fat content: {meal_percentage['fat']}% of your daily target in one meal.")

        # Add positive feedback if meal is well-balanced
        if all(25 <= pct <= 35 for pct in meal_percentage.values()):
            warnings.append("✅ This meal is well-balanced and fits perfectly within your daily targets!")

        return {
            "meal_items": enriched_items,
            "summary": result.get("summary", "AI-built meal"),
            "totals": totals,
            "diet_preference": data.diet_preference,
            "goal": data.goal,
            "warnings": warnings,
            "meal_percentage": meal_percentage,
            "user_daily_targets": user_goals
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

def strip_action_json(response: str):
    """Extract a trailing AI action JSON block ({"add":[...]} or {"action":...}) and
    ALWAYS remove it (plus any markdown code fences) from the user-facing message so
    raw structured data never leaks into the chat bubble. Returns (clean_text, actions)."""
    actions = None
    # Locate a JSON action block (must contain "add" or "action"). The trailing
    # [\s\S]*\} is greedy to the LAST '}' so nested arrays like
    # {"add":[{...},{...}]} are captured whole.
    m = re.search(r'\{[\s\S]*?(?:"add"|"action")[\s\S]*\}', response)
    if m:
        try:
            actions = json.loads(m.group(0))
        except Exception:
            actions = None
        # Remove the JSON block from the displayed message even if parsing failed,
        # so the raw object never leaks into the chat bubble.
        response = response[:m.start()] + response[m.end():]
    # Strip leftover markdown code fences / language labels (```json, ```).
    response = re.sub(r'```[a-zA-Z]*', '', response).replace('```', '').strip()
    # If the model returned ONLY a JSON block, show a friendly fallback line.
    if not response:
        response = "Here's a meal suggestion for you! 💪"
    return response, actions


@api_router.post("/ai/chat")
async def ai_chat(data: AIChatRequest, user=Depends(get_current_user)):
    """Conversational AI assistant for meal planning and nutrition advice"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Get available products (multi diet-tag match)
        _prefs = diet_prefs_to_list(data.diet_preference)
        products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(100)
        products = [ensure_product_diet_types(p) for p in products]
        if _prefs:
            products = [p for p in products if product_matches_diet(p, _prefs)]
        
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
            for p in products[:60]  # B4: larger menu window, already diet-filtered above
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
8. CRITICAL: WHENEVER you suggest one or more specific meals/items (even if the user only asked for a "suggestion" or "what should I eat"), you MUST end your reply with a single JSON block on its own final line listing those items so the app can show an "Add to cart" button: {{\"add\": [{{\"name\": \"Exact Product Name\", \"grams\": 100}}, {{\"name\": \"Another Item\", \"grams\": 150}}]}}. Use EXACT menu names and the grams you recommended. Do NOT add the JSON if you are only giving general advice with no specific items.
9. If customer says "order" or "checkout", respond with: {{\"action\": \"checkout\"}}
10. Keep Indian food culture in mind
11. IMPORTANT: You are NOT a doctor. Do NOT give medical, clinical, or diagnostic advice or treat health conditions (diabetes, BP, pregnancy, allergies, etc.). For any health condition, gently recommend consulting a qualified doctor/registered dietitian. Only give general food and menu guidance."""

        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY', ''),
            session_id=f"chat-{user['id']}-{uuid.uuid4().hex[:8]}",
            system_message=system_prompt
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=data.message))
        
        # Parse any actions from the response, then ALWAYS strip the structured
        # JSON (and any markdown code fences around it) from the user-facing text.
        response, actions = strip_action_json(response)
        
        # Reliability fallback: if the model named specific menu items with portions
        # (e.g. "Soya Chunks 100g") but did NOT emit the structured JSON, extract them
        # deterministically so the app can always show an "Add to cart" button.
        if not (actions and actions.get("add")):
            found = []
            used = set()
            low_resp = response.lower()
            for p in sorted(products, key=lambda x: -len(x["name"])):
                name = p["name"]
                idx = low_resp.find(name.lower())
                if idx == -1 or p["id"] in used:
                    continue
                window = response[idx: idx + len(name) + 25]
                gmatch = re.search(r'(\d{2,4})\s*g\b', window)
                if not gmatch:
                    continue  # only auto-add items the AI gave an explicit portion for
                used.add(p["id"])
                found.append({"name": name, "grams": int(gmatch.group(1))})
            if found:
                actions = actions or {}
                actions["add"] = found
        
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
    # Validate items are still available. Stock availability here is ADVISORY only
    # (Fix 2): read this store's live inventory_items ledger so we don't gate on the
    # frozen products.available_qty_grams. create_order does the authoritative
    # recheck at pay (raw_single_available / raw_meal_available), so an item that
    # looks low here is never silently dropped — it stays in the cart and the real
    # gate is at placement.
    store_id = order.get("store_id") or DEFAULT_STORE_ID
    cart_items = []
    unavailable = []
    for item in order.get("items", []):
        product = await db.products.find_one({"id": item["product_id"], "is_active": True}, {"_id": 0})
        if not product:
            unavailable.append(item.get("product_name"))
            continue
        ptype = item.get("product_type", "single")
        if ptype == "ready_made":
            in_stock = await raw_meal_available(store_id, item["product_id"], int(item.get("quantity", 1) or 1))
            live_qty = product.get("available_qty_grams", 0)
        else:
            inv = await db.inventory_items.find_one({"store_id": store_id, "product_id": item["product_id"]}, {"_id": 0})
            live_qty = float(inv.get("qty_on_hand", 0) or 0) if inv else product.get("available_qty_grams", 0)
            in_stock = await raw_single_available(store_id, item["product_id"], float(item.get("grams", 0) or 0))
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
            "available_qty_grams": live_qty,
            "id": product["id"],
            "name": product["name"],
        })
        if not in_stock:
            unavailable.append(item.get("product_name"))  # advisory warning, not a hard block
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
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
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

# ---------- Phase 2/3: Goal personalization (CUSTOMER APP ONLY) ----------
class DailyTargetRequest(BaseModel):
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    age: Optional[int] = None
    gender: Optional[str] = None          # male, female, other
    activity_level: Optional[str] = None  # sedentary, light, moderate, active, very_active
    target_weight_kg: Optional[float] = None
    fitness_goal: Optional[str] = None
    meals_per_day: Optional[int] = None   # Phase 3 (3-6)

class MealPlanRequest(BaseModel):
    meals_count: int = 3
    goal: Optional[str] = None
    remaining_calories: Optional[float] = None
    remaining_protein: Optional[float] = None

def _product_card(p: dict, goal: str) -> dict:
    fits, score, reason = goal_fit_for_product(p, goal)
    return {
        "id": p.get("id"), "name": p.get("name"), "image_url": p.get("image_url"),
        "calories_per_100g": p.get("calories_per_100g"), "protein_per_100g": p.get("protein_per_100g"),
        "carbs_per_100g": p.get("carbs_per_100g"), "fat_per_100g": p.get("fat_per_100g"),
        "cost_per_100g": p.get("cost_per_100g"), "fixed_price": p.get("fixed_price"), "price": p.get("price"),
        "product_type": p.get("product_type", "single"), "serving_grams": p.get("serving_grams"),
        "category": p.get("category"), "diet_types": p.get("diet_types"), "diet_type": p.get("diet_type"),
        "goal_fit": fits, "goal_fit_score": score, "goal_fit_reason": reason,
    }

@api_router.post("/user/daily-target")
async def set_daily_target(data: DailyTargetRequest, user=Depends(get_current_user)):
    """Phase 2: save body stats + compute the user's goal-adjusted daily target (kcal + macros)."""
    goal = data.fitness_goal or user.get("fitness_goal", "maintenance")
    h = data.height_cm if data.height_cm is not None else user.get("height_cm")
    w = data.weight_kg if data.weight_kg is not None else user.get("weight_kg")
    a = data.age if data.age is not None else user.get("age")
    gender = data.gender or user.get("gender")
    activity = data.activity_level or user.get("activity_level")
    twk = data.target_weight_kg if data.target_weight_kg is not None else user.get("target_weight_kg")
    if not (h and w and a):
        raise HTTPException(status_code=400, detail="height_cm, weight_kg and age are required to compute your target")
    target = compute_daily_targets(h, w, a, gender, activity, goal, twk)
    if not target:
        raise HTTPException(status_code=400, detail="Could not compute target — please check your inputs")
    saved = {
        "height_cm": float(h), "weight_kg": float(w), "age": int(a),
        "gender": gender, "activity_level": activity,
        "target_weight_kg": float(twk) if twk else None,
        "fitness_goal": goal,
        "meals_per_day": max(3, min(6, int(data.meals_per_day))) if data.meals_per_day else user.get("meals_per_day", 3),
        "daily_calories": target["daily_calories"], "daily_protein": target["daily_protein"],
        "daily_carbs": target["daily_carbs"], "daily_fat": target["daily_fat"],
    }
    await db.users.update_one({"id": user["id"]}, {"$set": saved})
    return {"message": "Daily target computed", "has_body_stats": True, **saved, **target}

@api_router.get("/user/daily-target")
async def get_daily_target(user=Depends(get_current_user)):
    """Phase 2: return stored body stats + recomputed daily target (if stats present)."""
    body = {
        "height_cm": user.get("height_cm"), "weight_kg": user.get("weight_kg"), "age": user.get("age"),
        "gender": user.get("gender"), "activity_level": user.get("activity_level"),
        "target_weight_kg": user.get("target_weight_kg"),
        "fitness_goal": user.get("fitness_goal", "maintenance"),
        "meals_per_day": user.get("meals_per_day", 3),
    }
    if not has_body_stats(user):
        return {"has_body_stats": False, **body,
                "daily_calories": user.get("daily_calories", 2000), "daily_protein": user.get("daily_protein", 100),
                "daily_carbs": user.get("daily_carbs", 250), "daily_fat": user.get("daily_fat", 65)}
    target = compute_daily_targets(body["height_cm"], body["weight_kg"], body["age"], body["gender"],
                                   body["activity_level"], body["fitness_goal"], body["target_weight_kg"])
    return {"has_body_stats": True, **body, **(target or {})}

@api_router.get("/products/goal-fit")
async def products_goal_fit(goal: Optional[str] = None, limit: int = 100, user=Depends(get_current_user)):
    """Phase 3: products annotated with goal-fit + sorted best-first for the user's goal."""
    g = goal or user.get("fitness_goal", "maintenance")
    products = await fetch_active_products()
    cards = [_product_card(p, g) for p in products]
    cards.sort(key=lambda c: (not c["goal_fit"], -c["goal_fit_score"]))
    return {"goal": g, "products": cards[:max(1, limit)]}

@api_router.post("/nutrition/meal-plan")
async def nutrition_meal_plan(data: MealPlanRequest, user=Depends(get_current_user)):
    """Phase 3: split the daily target across N meals + goal-fit dish suggestions per meal."""
    goal = data.goal or user.get("fitness_goal", "maintenance")
    # daily target: recompute from body stats when available, else stored values
    if has_body_stats(user):
        t = compute_daily_targets(user.get("height_cm"), user.get("weight_kg"), user.get("age"),
                                  user.get("gender"), user.get("activity_level"), goal,
                                  user.get("target_weight_kg")) or {}
        dc = t.get("daily_calories", 2000); dp = t.get("daily_protein", 100)
        dca = t.get("daily_carbs", 250); df = t.get("daily_fat", 65)
    else:
        dc = user.get("daily_calories", 2000); dp = user.get("daily_protein", 100)
        dca = user.get("daily_carbs", 250); df = user.get("daily_fat", 65)
    slices = split_targets_into_meals(dc, dp, dca, df, data.meals_count)
    # goal-fit dishes, sorted best-first
    products = await fetch_active_products()
    fitting = [c for c in (_product_card(p, goal) for p in products)]
    fitting.sort(key=lambda c: (not c["goal_fit"], -c["goal_fit_score"]))
    only_fit = [c for c in fitting if c["goal_fit"]] or fitting
    # distribute suggestions across meals so each meal shows different dishes
    n = len(only_fit)
    for i, s in enumerate(slices):
        s["suggestions"] = [only_fit[(i * 2 + k) % n] for k in range(min(3, n))] if n else []
    remaining_suggestions = []
    if data.remaining_calories is not None:
        remaining_suggestions = only_fit[:5]
    return {
        "goal": goal, "meals_count": len(slices),
        "daily_calories": dc, "daily_protein": dp, "daily_carbs": dca, "daily_fat": df,
        "meals": slices, "remaining_suggestions": remaining_suggestions,
        "disclaimer": TARGET_DISCLAIMER,
    }

# ---------- Phase 4: full day plan + progress + coach nudge (CUSTOMER APP ONLY) ----------
class DayPlanRequest(BaseModel):
    meals_count: int = 3
    diet_types: Optional[List[str]] = None
    goal: Optional[str] = None

class WeightLogCreate(BaseModel):
    weight_kg: float
    date: Optional[str] = None  # YYYY-MM-DD

def _resolve_daily_target(user: dict, goal: str):
    """Daily target tuple (cal, protein, carbs, fat) — recompute from body stats if present."""
    if has_body_stats(user):
        t = compute_daily_targets(user.get("height_cm"), user.get("weight_kg"), user.get("age"),
                                  user.get("gender"), user.get("activity_level"), goal,
                                  user.get("target_weight_kg")) or {}
        return (t.get("daily_calories", 2000), t.get("daily_protein", 100),
                t.get("daily_carbs", 250), t.get("daily_fat", 65))
    return (user.get("daily_calories", 2000), user.get("daily_protein", 100),
            user.get("daily_carbs", 250), user.get("daily_fat", 65))

def _plan_item(p: dict, grams: float) -> dict:
    """Cart-ready single item scaled to `grams` (rounded to 10g)."""
    grams = max(10, round(grams / 10) * 10)
    f = grams / 100.0
    cpg = float(p.get("calories_per_100g") or 0)
    ppg = float(p.get("protein_per_100g") or 0)
    cbg = float(p.get("carbs_per_100g") or 0)
    fpg = float(p.get("fat_per_100g") or 0)
    cost = float(p.get("cost_per_100g") or 0)
    return {
        "product_id": p.get("id"), "id": p.get("id"), "name": p.get("name"),
        "grams": grams, "product_type": "single", "cost_per_100g": cost,
        "calories_per_100g": cpg, "protein_per_100g": ppg, "carbs_per_100g": cbg, "fat_per_100g": fpg,
        "image_url": p.get("image_url"), "category": p.get("category"),
        "diet_type": p.get("diet_type"), "diet_types": p.get("diet_types"),
        "calories": round(cpg * f), "protein": round(ppg * f, 1),
        "carbs": round(cbg * f, 1), "fat": round(fpg * f, 1), "price": round(cost * f),
    }

@api_router.post("/nutrition/day-plan")
async def nutrition_day_plan(data: DayPlanRequest, user=Depends(get_current_user)):
    """Phase 4: auto-build a full day from the available menu to hit the user's target (kcal+protein)."""
    goal = data.goal or user.get("fitness_goal", "maintenance")
    dc, dp, dca, df = _resolve_daily_target(user, goal)
    slices = split_targets_into_meals(dc, dp, dca, df, data.meals_count)
    prefs = diet_prefs_to_list(data.diet_types)
    products = await fetch_active_products()
    # scalable single dishes that are in stock and (optionally) match the chosen diet tags
    pool = [p for p in products
            if p.get("product_type", "single") != "ready_made"
            and float(p.get("calories_per_100g") or 0) > 0
            and (not prefs or product_matches_diet(p, prefs))]
    if not pool:
        raise HTTPException(status_code=400, detail="No available dishes match this diet — try fewer diet filters.")
    protein_pool = sorted(pool, key=lambda p: -float(p.get("protein_per_100g") or 0))
    # fillers add calories without piling on protein: prefer calorie-dense, non-meat items
    filler_candidates = [p for p in pool if float(p.get("protein_per_100g") or 0) <= 18] or pool
    filler_pool = sorted(filler_candidates, key=lambda p: -float(p.get("calories_per_100g") or 0))
    meals_out = []
    tot = {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "price": 0.0}
    for i, s in enumerate(slices):
        pitem = protein_pool[i % len(protein_pool)]
        ppg = float(pitem.get("protein_per_100g") or 1) or 1
        items = [_plan_item(pitem, min(300, max(30, (s["protein"] * 100.0) / ppg)))]
        if items[0]["calories"] < s["calories"] * 0.9:
            fitem = filler_pool[i % len(filler_pool)]
            if fitem.get("id") == pitem.get("id"):
                fitem = filler_pool[(i + 1) % len(filler_pool)]
            cpg = float(fitem.get("calories_per_100g") or 1) or 1
            rem = s["calories"] - items[0]["calories"]
            items.append(_plan_item(fitem, min(500, max(20, (rem * 100.0) / cpg))))
        mcal = sum(it["calories"] for it in items)
        mpro = round(sum(it["protein"] for it in items), 1)
        mcarb = round(sum(it["carbs"] for it in items), 1)
        mfat = round(sum(it["fat"] for it in items), 1)
        mprice = sum(it["price"] for it in items)
        meals_out.append({"index": i, "label": s["label"],
                          "target_calories": s["calories"], "target_protein": s["protein"],
                          "calories": mcal, "protein": mpro, "carbs": mcarb, "fat": mfat,
                          "price": mprice, "items": items})
        tot["calories"] += mcal; tot["protein"] += mpro; tot["carbs"] += mcarb
        tot["fat"] += mfat; tot["price"] += mprice
    return {"goal": goal, "meals_count": len(meals_out),
            "daily_calories": dc, "daily_protein": dp, "daily_carbs": dca, "daily_fat": df,
            "meals": meals_out, "totals": {k: round(v, 1) for k, v in tot.items()},
            "disclaimer": TARGET_DISCLAIMER}

def _compute_progress(logs: list, user: dict) -> dict:
    logs_sorted = sorted(logs, key=lambda l: l["date"])
    out_logs = [{"date": l["date"], "weight_kg": l["weight_kg"]} for l in logs_sorted]
    points = len(logs_sorted) * 10
    dates = sorted({l["date"] for l in logs_sorted})
    streak = 0
    if dates:
        try:
            cur = datetime.strptime(dates[-1], "%Y-%m-%d").date()
            dset = set(dates)
            while cur.strftime("%Y-%m-%d") in dset:
                streak += 1
                cur = cur - timedelta(days=1)
        except Exception:
            streak = len(dates)
    start_w = out_logs[0]["weight_kg"] if out_logs else user.get("weight_kg")
    latest_w = out_logs[-1]["weight_kg"] if out_logs else user.get("weight_kg")
    change = round(latest_w - start_w, 1) if (start_w is not None and latest_w is not None) else None
    return {"logs": out_logs, "points": points, "current_streak": streak,
            "start_weight": start_w, "latest_weight": latest_w,
            "target_weight_kg": user.get("target_weight_kg"), "change": change}

@api_router.post("/user/weight-log")
async def add_weight_log(data: WeightLogCreate, user=Depends(get_current_user)):
    if not data.weight_kg or data.weight_kg < 25 or data.weight_kg > 400:
        raise HTTPException(status_code=400, detail="Please enter a valid weight in kg.")
    d = data.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.weight_logs.update_one(
        {"user_id": user["id"], "date": d},
        {"$set": {"user_id": user["id"], "date": d, "weight_kg": float(data.weight_kg),
                  "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    logs = await db.weight_logs.find({"user_id": user["id"]}, {"_id": 0}).to_list(400)
    latest = max(logs, key=lambda l: l["date"]) if logs else None
    if latest and latest["date"] == d:
        await db.users.update_one({"id": user["id"]}, {"$set": {"weight_kg": float(data.weight_kg)}})
    return _compute_progress(logs, {**user, "weight_kg": (latest["weight_kg"] if latest else user.get("weight_kg"))})

@api_router.get("/user/weight-log")
async def get_weight_log(user=Depends(get_current_user)):
    logs = await db.weight_logs.find({"user_id": user["id"]}, {"_id": 0}).to_list(400)
    return _compute_progress(logs, user)

@api_router.get("/user/coach-nudge")
async def coach_nudge(user=Depends(get_current_user)):
    """Phase 4: gentle, non-shaming nudge based on today's intake vs target. Not medical advice."""
    goal = user.get("fitness_goal", "maintenance")
    dc, dp, _dca, _df = _resolve_daily_target(user, goal)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    summary = await db.meal_history.find_one({"user_id": user["id"], "date": today}, {"_id": 0})
    cons_cal = summary.get("total_calories", 0) if summary else 0
    cons_pro = summary.get("total_protein", 0) if summary else 0
    rem_cal = round(dc - cons_cal)
    rem_pro = round(dp - cons_pro)
    if cons_cal <= 0:
        nudge, ntype, suggestion = (f"Fresh day! Aim for about {dc} kcal and {dp}g protein. You've got this.", "plan", "high-protein")
    elif cons_pro < dp * 0.6 and cons_cal >= dc * 0.4:
        nudge, ntype, suggestion = (f"You're a little low on protein today — a high-protein dish helps you reach {dp}g. No pressure!", "protein", "high-protein")
    elif rem_cal > dc * 0.5:
        nudge, ntype, suggestion = (f"You've still got room for ~{rem_cal} kcal today — a balanced meal keeps you on track.", "calories", None)
    elif rem_cal < -150:
        nudge, ntype, suggestion = ("A bit over today — totally okay. Tomorrow's a clean slate and every day counts.", "over", None)
    else:
        nudge, ntype, suggestion = ("Nicely balanced today — you're right on track. Keep it up!", "ontrack", None)
    return {"nudge": nudge, "type": ntype, "suggestion": suggestion,
            "remaining_calories": rem_cal, "remaining_protein": rem_pro,
            "daily_calories": dc, "daily_protein": dp}





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
    # Create default HQ super-admin (legacy email/password login preserved)
    admin_exists = await db.users.find_one({"email": "admin@dietcafe.com"}, {"_id": 0})
    if not admin_exists:
        admin = {
            "id": str(uuid.uuid4()),
            "email": "admin@dietcafe.com",
            "password_hash": hash_password("admin123"),
            "name": "Admin",
            "role": "super_admin",  # HQ
            "fitness_goal": "maintenance",
            "daily_calories": 2000,
            "daily_protein": 100,
            "daily_carbs": 250,
            "daily_fat": 65,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin)
    # Ensure the multi-store foundation (default store + store_manager + backfill)
    await run_store_migration()
    return {"message": "Seed data created", "products": len(seed_products)}

@api_router.get("/banners")
async def get_banners():
    """Dynamic banners from active offers + packs"""
    banners = []
    offers = await db.offers.find({"is_active": True}, {"_id": 0}).sort("created_at", -1).to_list(10)
    for o in offers:
        banners.append({
            "id": f"offer-{o['id']}",
            "type": "offer",
            "offer_id": o["id"],
            "title": o["title"],
            "subtitle": o["subtitle"],
            "color": o.get("banner_color", "#15140F"),
            "discount_value": o.get("discount_value", 0),
            "discount_type": o.get("discount_type", "percentage"),
        })
    packs = await db.packs.find({"is_active": True}, {"_id": 0}).sort("created_at", -1).to_list(10)
    for p in packs:
        banners.append({
            "id": f"pack-{p['id']}",
            "type": "pack",
            "pack_id": p["id"],
            "title": p["name"],
            "subtitle": p.get("description", ""),
            "color": p.get("banner_color", "#15140F"),
            "goal": p.get("goal", ""),
        })
    # Fallback if no offers/packs yet
    if not banners:
        banners = [
            {"id": "default-1", "type": "info", "title": "Welcome to BORAROC", "subtitle": "Eat for your goal", "color": "#15140F"},
            {"id": "default-2", "type": "info", "title": "AI Meal Planner", "subtitle": "Get personalized diet suggestions", "color": "#5B5FE0"},
        ]
    return banners

# ========== QR CODE TABLE ORDERING ==========
class TableOrderRequest(BaseModel):
    table_number: int
    items: List[Dict[str, Any]]
    special_instructions: Optional[str] = ""

async def _ensure_store_tables(store_id: str):
    """Seed default tables for a store the first time they're requested."""
    existing = await db.tables.find_one({"store_id": store_id}, {"_id": 0})
    if existing:
        return
    for i in range(1, 11):
        await db.tables.insert_one({
            "id": str(uuid.uuid4()),
            "store_id": store_id,
            "table_number": i,
            "seats": 4 if i <= 6 else 2,
            "status": "available",  # available, occupied, reserved
            "current_order_id": None,
            "qr_code": f"BORAROC-{store_id}-TABLE-{i}",
        })

@api_router.get("/tables")
async def get_tables(store_id: Optional[str] = None, user=Depends(get_optional_user)):
    """Café tables for a store. Staff are restricted to their own store scope;
    anonymous/customer callers must specify the store (defaults to the default store)."""
    if user and role_in(user, *STAFF_ROLES):
        scope = staff_store_scope(user)
        if scope is None:  # HQ
            target = store_id or DEFAULT_STORE_ID
        else:
            target = store_id or (scope[0] if scope else DEFAULT_STORE_ID)
            assert_store_allowed(user, target)
    else:
        target = store_id or DEFAULT_STORE_ID
    await _ensure_store_tables(target)
    tables = await db.tables.find({"store_id": target}, {"_id": 0}).to_list(50)
    return tables

@api_router.get("/tables/{table_number}")
async def get_table(table_number: int, store_id: Optional[str] = None):
    """Get table info by scanning QR code (within a store)."""
    sid = store_id or DEFAULT_STORE_ID
    table = await db.tables.find_one({"table_number": table_number, "store_id": sid}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    # Get current order if any
    current_order = None
    if table.get("current_order_id"):
        current_order = await db.orders.find_one({"id": table["current_order_id"]}, {"_id": 0})
    return {**table, "current_order": current_order}

@api_router.post("/tables/{table_number}/occupy")
async def occupy_table(table_number: int, store_id: Optional[str] = None, user=Depends(get_current_user)):
    """Mark table as occupied when customer scans QR"""
    sid = store_id or DEFAULT_STORE_ID
    table = await db.tables.find_one({"table_number": table_number, "store_id": sid}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    if table["status"] == "occupied" and table.get("occupied_by") != user["id"]:
        raise HTTPException(status_code=400, detail="Table already occupied by another customer")
    await db.tables.update_one(
        {"table_number": table_number, "store_id": sid},
        {"$set": {"status": "occupied", "occupied_by": user["id"], "occupied_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": f"Table {table_number} is now yours!", "table_number": table_number}

@api_router.post("/tables/{table_number}/release")
async def release_table(table_number: int, store_id: Optional[str] = None, user=Depends(get_current_user)):
    """Release table after payment"""
    sid = store_id or DEFAULT_STORE_ID
    await db.tables.update_one(
        {"table_number": table_number, "store_id": sid},
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
    
    if not is_hq(user) and user_id != user["id"]:
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
    """Customers see their own notifications; staff see their store's staff
    notifications (scoped by role — never another store's)."""
    if normalize_role(user) == "customer":
        query = {"user_id": user["id"]}
    else:
        query = store_filter(user)
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return notifications

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user=Depends(get_current_user)):
    """Mark notification as read (own notification, or a staff notification
    within the caller's store scope)."""
    notif = await db.notifications.find_one({"id": notification_id}, {"_id": 0})
    if not notif:
        return {"message": "Marked as read"}
    if normalize_role(user) == "customer":
        if notif.get("user_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    elif notif.get("store_id"):
        assert_store_allowed(user, notif.get("store_id"))
    await db.notifications.update_one({"id": notification_id}, {"$set": {"read": True}})
    return {"message": "Marked as read"}

# ========== OFFERS & BANNERS SYSTEM (Admin-Managed) ==========
class OfferCreate(BaseModel):
    title: str
    subtitle: str = ""
    discount_type: str = "percentage"  # "percentage", "flat", or "bogo" (buy-one-get-one)
    discount_value: float = 10  # 10% or ₹10
    applicable_to: str = "all"  # "all", "category", "products"
    applicable_category: Optional[str] = None  # "Protein", "Carb", etc.
    applicable_product_ids: Optional[List[str]] = []
    banner_color: str = "#15140F"
    coupon_code: Optional[str] = None
    min_order_value: float = 0
    max_discount: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool = True
    # Phase 2A — scope + usage controls (all optional, backward compatible)
    scope: str = "all"                          # "all" | "cluster" | "stores"
    store_ids: List[str] = []                    # used when scope == "stores"
    cluster_owner_id: Optional[str] = None       # area_manager whose cluster defines a "cluster" offer (set server-side)
    usage_limit_total: Optional[int] = None      # null = unlimited
    usage_limit_per_user: Optional[int] = None   # null = unlimited
    first_order_only: bool = False               # valid only on a user's first order

class OfferUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    applicable_to: Optional[str] = None
    applicable_category: Optional[str] = None
    applicable_product_ids: Optional[List[str]] = None
    banner_color: Optional[str] = None
    coupon_code: Optional[str] = None
    min_order_value: Optional[float] = None
    max_discount: Optional[float] = None
    is_active: Optional[bool] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    # Phase 2A
    scope: Optional[str] = None
    store_ids: Optional[List[str]] = None
    cluster_owner_id: Optional[str] = None
    usage_limit_total: Optional[int] = None
    usage_limit_per_user: Optional[int] = None
    first_order_only: Optional[bool] = None

# ========== PHASE 2A — shared offer/coupon validation (scope + date + usage) ==========
def compute_offer_discount(offer: dict, subtotal: float, line_items: list) -> float:
    """Discount math shared by apply-coupon, cart_quote and order placement."""
    dtype = offer.get("discount_type")
    if dtype == "bogo":
        prices = sorted([float(li.get("price", 0)) for li in (line_items or [])])
        d = prices[0] if len(prices) >= 2 else 0.0
    elif dtype == "percentage":
        d = subtotal * offer.get("discount_value", 0) / 100
        if offer.get("max_discount"):
            d = min(d, offer["max_discount"])
    else:  # flat
        d = offer.get("discount_value", 0)
        if offer.get("max_discount"):
            d = min(d, offer["max_discount"])
    return round(min(d, subtotal), 2)

async def offer_cluster_store_ids(offer: dict) -> list:
    """Stores in the cluster that owns a scope=='cluster' offer."""
    owner_id = offer.get("cluster_owner_id")
    if not owner_id:
        return []
    owner = await db.users.find_one({"id": owner_id}, {"_id": 0})
    return (owner or {}).get("cluster_store_ids") or []

async def validate_offer_for_order(offer: dict, store_id: Optional[str], user: dict,
                                   subtotal: float, line_items: list):
    """THE single coupon validator. Returns (ok: bool, discount: float, error: str|None).
    Used identically by /orders/apply-coupon, /cart/quote and order placement so
    scope/date/usage rules can never diverge. Offers with no scope field are
    treated as scope 'all' (backward compatible)."""
    now = datetime.now(timezone.utc).isoformat()
    if not offer.get("is_active", True):
        return (False, 0.0, "This coupon is not active")
    # Date window (null dates = always valid)
    if offer.get("start_date") and now < offer["start_date"]:
        return (False, 0.0, "This coupon is not active yet")
    if offer.get("end_date") and now > offer["end_date"]:
        return (False, 0.0, "This coupon has expired")
    # Scope
    scope = offer.get("scope", "all")
    sid = store_id or DEFAULT_STORE_ID
    if scope == "stores":
        if sid not in (offer.get("store_ids") or []):
            return (False, 0.0, "This coupon is not valid at this store")
    elif scope == "cluster":
        if sid not in await offer_cluster_store_ids(offer):
            return (False, 0.0, "This coupon is not valid at this store")
    # Minimum order value
    min_ov = offer.get("min_order_value", 0) or 0
    if subtotal < min_ov:
        return (False, 0.0, f"Add ₹{round(min_ov - subtotal)} more to use {offer.get('coupon_code') or 'this coupon'}")
    # First-order-only
    if offer.get("first_order_only"):
        prior = await db.orders.count_documents({"user_id": user["id"], "status": {"$ne": "cancelled"}})
        if prior >= 1:
            return (False, 0.0, "This coupon is valid on your first order only")
    # Usage limits (read from append-only coupon_redemptions)
    code = offer.get("coupon_code")
    if code:
        if offer.get("usage_limit_total") is not None:
            total_used = await db.coupon_redemptions.count_documents({"coupon_code": code})
            if total_used >= offer["usage_limit_total"]:
                return (False, 0.0, "This coupon's usage limit has been reached")
        if offer.get("usage_limit_per_user") is not None:
            mine = await db.coupon_redemptions.count_documents({"coupon_code": code, "user_id": user["id"]})
            if mine >= offer["usage_limit_per_user"]:
                return (False, 0.0, "You have already used this coupon")
    return (True, compute_offer_discount(offer, subtotal, line_items), None)

def assert_offer_manage_allowed(user: dict, scope: str, store_ids: list, cluster_owner_id: Optional[str]):
    """Authorize creating/updating an offer of the given scope for this user.
    super_admin: any. area_manager: cluster (own) or stores within own cluster.
    store_manager: stores within own store only. cashier/kitchen: 403."""
    role = normalize_role(user)
    if role not in ("super_admin", "area_manager", "store_manager"):
        raise HTTPException(status_code=403, detail="Not allowed to manage offers")
    if role == "super_admin":
        return
    if scope == "all":
        raise HTTPException(status_code=403, detail="Only HQ can create chain-wide offers")
    if scope == "cluster":
        if role != "area_manager":
            raise HTTPException(status_code=403, detail="Only area managers can create cluster offers")
        if cluster_owner_id and cluster_owner_id != user["id"]:
            raise HTTPException(status_code=403, detail="Cannot create offers for another cluster")
        return
    if scope == "stores":
        if not store_ids:
            raise HTTPException(status_code=400, detail="scope 'stores' requires store_ids")
        for sid in store_ids:
            assert_store_allowed(user, sid)   # area=own cluster, store_manager=own store
        return
    raise HTTPException(status_code=400, detail="Invalid scope")

@api_router.get("/offers")
async def get_active_offers():
    """Get all active offers for customers"""
    offers = await db.offers.find({"is_active": True}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return offers

@api_router.get("/offers/all")
async def get_all_offers(user=Depends(get_current_user)):
    """List offers the caller may manage. super_admin: all. area_manager: own
    cluster offers (cluster owner == self, or store-scoped within own cluster).
    store_manager: store-scoped offers covering own store. cashier/kitchen: 403."""
    role = normalize_role(user)
    if role not in ("super_admin", "area_manager", "store_manager"):
        raise HTTPException(status_code=403, detail="Not allowed")
    offers = await db.offers.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    if role == "super_admin":
        return offers
    scope_ids = set(staff_store_scope(user) or [])
    visible = []
    for o in offers:
        osc = o.get("scope", "all")
        if role == "area_manager" and osc == "cluster" and o.get("cluster_owner_id") == user["id"]:
            visible.append(o)
        elif osc == "stores" and (set(o.get("store_ids") or []) & scope_ids):
            visible.append(o)
    return visible

@api_router.post("/offers")
async def create_offer(data: OfferCreate, user=Depends(get_current_user)):
    """Create an offer. super_admin: any scope. area_manager: cluster (own) or
    own-cluster stores. store_manager: own store only. cashier/kitchen: 403."""
    scope = data.scope or "all"
    cluster_owner_id = data.cluster_owner_id
    if normalize_role(user) == "area_manager" and scope == "cluster":
        cluster_owner_id = user["id"]  # force cluster ownership to the creator
    if normalize_role(user) == "super_admin" and scope == "cluster" and not cluster_owner_id:
        raise HTTPException(status_code=400, detail="Cluster offers require a cluster_owner_id (area manager)")
    assert_offer_manage_allowed(user, scope, data.store_ids or [], cluster_owner_id)
    offer = {
        "id": str(uuid.uuid4()),
        **data.dict(),
        "scope": scope,
        "cluster_owner_id": cluster_owner_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"],
    }
    await db.offers.insert_one(offer)
    return {k: v for k, v in offer.items() if k != "_id"}

@api_router.put("/offers/{offer_id}")
async def update_offer(offer_id: str, data: OfferUpdate, user=Depends(get_current_user)):
    offer = await db.offers.find_one({"id": offer_id}, {"_id": 0})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    # Caller must be allowed to manage the offer's CURRENT scope...
    assert_offer_manage_allowed(user, offer.get("scope", "all"), offer.get("store_ids") or [], offer.get("cluster_owner_id"))
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    # ...and, if the scope/stores change, to manage the NEW scope too.
    new_scope = update_data.get("scope", offer.get("scope", "all"))
    new_stores = update_data.get("store_ids", offer.get("store_ids") or [])
    new_owner = update_data.get("cluster_owner_id", offer.get("cluster_owner_id"))
    if normalize_role(user) == "area_manager" and new_scope == "cluster":
        new_owner = user["id"]
        update_data["cluster_owner_id"] = new_owner
    if "scope" in update_data or "store_ids" in update_data:
        assert_offer_manage_allowed(user, new_scope, new_stores, new_owner)
    if update_data:
        await db.offers.update_one({"id": offer_id}, {"$set": update_data})
    offer = await db.offers.find_one({"id": offer_id}, {"_id": 0})
    return offer

@api_router.delete("/offers/{offer_id}")
async def delete_offer(offer_id: str, user=Depends(get_current_user)):
    offer = await db.offers.find_one({"id": offer_id}, {"_id": 0})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    assert_offer_manage_allowed(user, offer.get("scope", "all"), offer.get("store_ids") or [], offer.get("cluster_owner_id"))
    await db.offers.delete_one({"id": offer_id})
    return {"message": "Offer deleted"}

@api_router.get("/offers/{offer_id}/products")
async def get_offer_products(offer_id: str):
    """Get products applicable to an offer with discounted prices"""
    offer = await db.offers.find_one({"id": offer_id, "is_active": True}, {"_id": 0})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found or inactive")
    query = {"is_active": True}
    if offer["applicable_to"] == "category" and offer.get("applicable_category"):
        cat = offer["applicable_category"]
        query["$or"] = [{"category": cat}, {"diet_type": cat}]
    elif offer["applicable_to"] == "products" and offer.get("applicable_product_ids"):
        query["id"] = {"$in": offer["applicable_product_ids"]}
    products = await db.products.find(query, {"_id": 0}).to_list(100)
    for p in products:
        original = p["cost_per_100g"]
        if offer["discount_type"] == "percentage":
            discount = original * (offer["discount_value"] / 100)
        elif offer["discount_type"] == "bogo":
            discount = 0  # BOGO discount is applied on the cart (free 2nd unit), not per-100g price
        else:
            discount = offer["discount_value"]
        if offer.get("max_discount") and offer["discount_type"] != "bogo":
            discount = min(discount, offer["max_discount"])
        p["original_price"] = original
        p["discounted_price"] = round(max(original - discount, 0), 2)
        p["discount_amount"] = round(discount, 2)
        p["offer_id"] = offer["id"]
        p["offer_title"] = offer["title"]
        p["is_bogo"] = offer["discount_type"] == "bogo"
    return {"offer": offer, "products": products}

# ========== GOAL PACKS (Admin-Created Meal Packs) ==========
class PackItem(BaseModel):
    product_id: str
    product_name: str
    grams: float = 100

class PackCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    goal: str  # "muscle_gain", "fat_loss", "maintenance"
    diet_type: str = "both"  # "veg", "non-veg", "both"
    items: List[PackItem]
    pack_price: float
    banner_color: str = "#15140F"
    image_url: Optional[str] = None
    is_active: bool = True

class PackUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    goal: Optional[str] = None
    diet_type: Optional[str] = None
    items: Optional[List[PackItem]] = None
    pack_price: Optional[float] = None
    banner_color: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None

@api_router.get("/packs")
async def get_active_packs():
    """Get all active goal packs"""
    packs = await db.packs.find({"is_active": True}, {"_id": 0}).sort("created_at", -1).to_list(20)
    for pack in packs:
        total_cal, total_pro, total_carb, total_fat = 0, 0, 0, 0
        for item in pack.get("items", []):
            nutrition = match_nutrition(item["product_name"])
            f = item.get("grams", 100) / 100
            total_cal += nutrition["calories"] * f
            total_pro += nutrition["protein"] * f
            total_carb += nutrition["carbs"] * f
            total_fat += nutrition["fat"] * f
        pack["total_calories"] = round(total_cal)
        pack["total_protein"] = round(total_pro)
        pack["total_carbs"] = round(total_carb)
        pack["total_fat"] = round(total_fat)
    return packs

@api_router.get("/packs/all")
async def get_all_packs(user=Depends(get_current_user)):
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    return await db.packs.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)

@api_router.get("/packs/{pack_id}")
async def get_pack_detail(pack_id: str):
    pack = await db.packs.find_one({"id": pack_id}, {"_id": 0})
    if not pack:
        raise HTTPException(status_code=404, detail="Pack not found")
    enriched_items = []
    total_cal, total_pro = 0, 0
    for item in pack.get("items", []):
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0})
        if product:
            f = item.get("grams", 100) / 100
            enriched_items.append({
                **item,
                "cost_per_100g": product["cost_per_100g"],
                "calories_per_100g": product["calories_per_100g"],
                "protein_per_100g": product["protein_per_100g"],
                "carbs_per_100g": product["carbs_per_100g"],
                "fat_per_100g": product["fat_per_100g"],
                "diet_type": product.get("diet_type", "veg"),
                "image_url": product.get("image_url"),
                "calories": round(product["calories_per_100g"] * f),
                "protein": round(product["protein_per_100g"] * f, 1),
                "price": round(product["cost_per_100g"] * f, 2),
            })
            total_cal += product["calories_per_100g"] * f
            total_pro += product["protein_per_100g"] * f
    pack["items"] = enriched_items
    pack["total_calories"] = round(total_cal)
    pack["total_protein"] = round(total_pro)
    individual_total = sum(i["price"] for i in enriched_items)
    pack["individual_total"] = round(individual_total, 2)
    pack["savings"] = round(max(individual_total - pack["pack_price"], 0), 2)
    return pack

@api_router.post("/packs")
async def create_pack(data: PackCreate, user=Depends(get_current_user)):
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    pack = {
        "id": str(uuid.uuid4()),
        **data.dict(),
        "items": [i.dict() for i in data.items],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"],
    }
    await db.packs.insert_one(pack)
    del pack["_id"]
    return pack

@api_router.put("/packs/{pack_id}")
async def update_pack(pack_id: str, data: PackUpdate, user=Depends(get_current_user)):
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    update_data = {}
    for k, v in data.dict().items():
        if v is not None:
            if k == "items":
                update_data[k] = [i.dict() if hasattr(i, 'dict') else i for i in v]
            else:
                update_data[k] = v
    if update_data:
        await db.packs.update_one({"id": pack_id}, {"$set": update_data})
    pack = await db.packs.find_one({"id": pack_id}, {"_id": 0})
    if not pack:
        raise HTTPException(status_code=404, detail="Pack not found")
    return pack

@api_router.delete("/packs/{pack_id}")
async def delete_pack(pack_id: str, user=Depends(get_current_user)):
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    result = await db.packs.delete_one({"id": pack_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pack not found")
    return {"message": "Pack deleted"}

# ========== DYNAMIC BANNERS (from Offers + Packs) ==========
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
    if order["user_id"] != user["id"]:
        # Non-owner: must be staff with access to this order's store.
        if not role_in(user, *STAFF_ROLES):
            raise HTTPException(status_code=403, detail="Not authorized")
        assert_store_allowed(user, order.get("store_id"))

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
    """Update delivery driver location (store staff / HQ for the order's store)."""
    if not role_in(user, "super_admin", "area_manager", "store_manager", "cashier"):
        raise HTTPException(status_code=403, detail="Staff only")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    assert_store_allowed(user, order.get("store_id"))

    update = {
        "latitude": data.latitude,
        "longitude": data.longitude,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    await db.delivery_tracking.update_one(
        {"order_id": order_id},
        {
            "$set": {"current_location": update, "store_id": order.get("store_id"), "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"updates": update}
        },
        upsert=True
    )

    return {"message": "Location updated"}

@api_router.post("/orders/{order_id}/assign-driver")
async def assign_driver(order_id: str, driver_name: str, user=Depends(get_current_user)):
    """Assign driver to delivery order (store staff / HQ for the order's store)."""
    if not role_in(user, "super_admin", "area_manager", "store_manager", "cashier"):
        raise HTTPException(status_code=403, detail="Staff only")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    assert_store_allowed(user, order.get("store_id"))

    await db.delivery_tracking.update_one(
        {"order_id": order_id},
        {
            "$set": {
                "order_id": order_id,
                "store_id": order.get("store_id"),
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
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    
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
    
    # Low stock alerts (Fix 2: live inventory_items, store-scoped, not frozen global)
    low_stock = await low_stock_alerts(user, limit=20)
    
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
        "low_stock_alerts": [{"name": r["name"], "stock": r["qty_on_hand"]} for r in low_stock],
    }

@api_router.post("/admin/ai-insights")
async def get_ai_business_insights(user=Depends(get_current_user)):
    """Get AI-powered business insights and recommendations"""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    
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
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    
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

# ========== RAZORPAY PAYMENT ==========
class PaymentCreateRequest(BaseModel):
    order_id: str
    amount: float  # in INR

class PaymentVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    order_id: str

@api_router.post("/payments/create-order")
async def create_payment_order(data: PaymentCreateRequest, user=Depends(get_current_user)):
    """Create a Razorpay order for payment"""
    # Resolve & authorize the order; payments inherit the order's store_id.
    order = await db.orders.find_one({"id": data.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if normalize_role(user) == "customer":
        if order.get("user_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        assert_store_allowed(user, order.get("store_id"))
    order_store_id = order.get("store_id") or DEFAULT_STORE_ID
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        # Mock mode - no keys configured
        mock_order_id = f"order_mock_{uuid.uuid4().hex[:12]}"
        await db.payments.insert_one({
            "id": str(uuid.uuid4()),
            "order_id": data.order_id,
            "store_id": order_store_id,
            "user_id": user["id"],
            "razorpay_order_id": mock_order_id,
            "amount": data.amount,
            "currency": "INR",
            "status": "created",
            "mock": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {
            "razorpay_order_id": mock_order_id,
            "amount": int(data.amount * 100),
            "currency": "INR",
            "key_id": "rzp_test_mock",
            "mock": True,
        }
    try:
        import razorpay
        client_rp = razorpay.Client(auth=(key_id, key_secret))
        rp_order = client_rp.order.create({
            "amount": int(data.amount * 100),
            "currency": "INR",
            "payment_capture": 1,
            "notes": {"boraroc_order": data.order_id, "user_id": user["id"]},
        })
        await db.payments.insert_one({
            "id": str(uuid.uuid4()),
            "order_id": data.order_id,
            "store_id": order_store_id,
            "user_id": user["id"],
            "razorpay_order_id": rp_order["id"],
            "amount": data.amount,
            "currency": "INR",
            "status": "created",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {
            "razorpay_order_id": rp_order["id"],
            "amount": rp_order["amount"],
            "currency": rp_order["currency"],
            "key_id": key_id,
        }
    except Exception as e:
        logger.error(f"Razorpay order creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Payment order creation failed: {str(e)}")

@api_router.post("/payments/verify")
async def verify_payment(data: PaymentVerifyRequest, user=Depends(get_current_user)):
    """Verify Razorpay payment and update order status"""
    payment = await db.payments.find_one({"razorpay_order_id": data.razorpay_order_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.get("mock"):
        await db.payments.update_one(
            {"razorpay_order_id": data.razorpay_order_id},
            {"$set": {"status": "paid", "razorpay_payment_id": data.razorpay_payment_id, "paid_at": datetime.now(timezone.utc).isoformat()}}
        )
        await db.orders.update_one({"id": data.order_id}, {"$set": {"payment_status": "paid", "payment_method": "razorpay_mock"}})
        return {"status": "paid", "message": "Payment verified (mock mode)"}
    import razorpay
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    try:
        client_rp = razorpay.Client(auth=(key_id, key_secret))
        client_rp.utility.verify_payment_signature({
            "razorpay_order_id": data.razorpay_order_id,
            "razorpay_payment_id": data.razorpay_payment_id,
            "razorpay_signature": data.razorpay_signature,
        })
        await db.payments.update_one(
            {"razorpay_order_id": data.razorpay_order_id},
            {"$set": {"status": "paid", "razorpay_payment_id": data.razorpay_payment_id, "razorpay_signature": data.razorpay_signature, "paid_at": datetime.now(timezone.utc).isoformat()}}
        )
        await db.orders.update_one({"id": data.order_id}, {"$set": {"payment_status": "paid", "payment_method": "razorpay"}})
        return {"status": "paid", "message": "Payment verified successfully"}
    except Exception as e:
        logger.error(f"Payment verification failed: {e}")
        await db.payments.update_one({"razorpay_order_id": data.razorpay_order_id}, {"$set": {"status": "failed"}})
        raise HTTPException(status_code=400, detail="Payment verification failed")

# ========== APPLY COUPON TO ORDER ==========
@api_router.post("/orders/apply-coupon")
async def apply_coupon(
    coupon_code: str = Body(..., embed=True),
    cart_items: Optional[List[Dict[str, Any]]] = Body(None, embed=True),
    cart_total: Optional[float] = Body(None, embed=True),
    store_id: Optional[str] = Body(None, embed=True),
    user=Depends(get_current_user),
):
    """Validate a coupon and return discount details (percentage/flat/bogo).
    Uses the shared validate_offer_for_order so scope/date/usage match cart_quote.
    This is a PREVIEW only — it never records a redemption."""
    offer = await db.offers.find_one({"coupon_code": coupon_code}, {"_id": 0})
    if not offer:
        raise HTTPException(status_code=404, detail="Invalid or expired coupon code")
    items = cart_items or []
    subtotal = cart_total if cart_total is not None else round(sum(float(i.get("price", 0)) for i in items), 2)
    ok, discount, error = await validate_offer_for_order(offer, store_id, user, subtotal, items)
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    return {
        "offer_id": offer["id"],
        "title": offer["title"],
        "discount_type": offer["discount_type"],
        "discount_value": offer["discount_value"],
        "max_discount": offer.get("max_discount"),
        "min_order_value": offer.get("min_order_value", 0),
        "applicable_to": offer["applicable_to"],
        "applicable_category": offer.get("applicable_category"),
        "computed_discount": round(discount, 2),
    }

FREE_DELIVERY_THRESHOLD = 300

async def compute_authoritative_bill(items, order_type, coupon_code, tip, store_id, user):
    """THE single server-side bill. Every price comes from the store's resolved
    menu (resolve_menu_for_store / product master) — never from the client; the
    discount comes ONLY from validate_offer_for_order. Used by /cart/quote AND
    by order placement so money can never be tampered with."""
    _sid = store_id or DEFAULT_STORE_ID
    resolved = await resolve_menu_for_store(_sid)
    price_map = {r["id"]: r for r in resolved}

    line_items = []
    out_of_stock = []
    price_changes = []
    subtotal = 0.0
    cal = prot = carbs = fat = 0.0
    prep_times = []
    for it in items:
        pid = it.get("product_id") or it.get("id")
        ptype = it.get("product_type", "single")
        product = await db.products.find_one({"id": pid}, {"_id": 0}) if pid else None
        if not product or product.get("is_active") is False:
            out_of_stock.append({"product_id": pid, "name": it.get("name", "Item"), "reason": "no_longer_available"})
            continue
        resolved_item = price_map.get(pid)
        if ptype == "ready_made":
            qty = int(it.get("quantity", 1) or 1)
            serving = product.get("serving_grams", 300)
            base_unit = product.get("fixed_price") or round(product["cost_per_100g"] * serving / 100, 2)
            unit_price = resolved_item["selling_price"] if resolved_item else base_unit  # per-store price
            line_price = round(unit_price * qty, 2)
            stock_ok = await raw_meal_available(_sid, pid, qty)
            line_grams = serving * qty
            factor = (serving / 100) * qty
        else:
            grams = float(it.get("grams", 100) or 100)
            qty = 1
            stock_ok = await raw_single_available(_sid, pid, grams)
            unit_price = resolved_item["selling_price"] if resolved_item else product["cost_per_100g"]  # per-100g
            line_price = round(grams / 100 * unit_price, 2)
            line_grams = grams
            factor = grams / 100
        if not stock_ok:
            out_of_stock.append({"product_id": pid, "name": product["name"], "reason": "out_of_stock"})
            continue
        old_unit = it.get("cost_per_100g")
        if old_unit is not None and ptype == "single" and abs(float(old_unit) - unit_price) > 0.01:
            price_changes.append({"product_id": pid, "name": product["name"], "old": float(old_unit), "new": unit_price})
        subtotal += line_price
        cal += (product.get("calories_per_100g") or 0) * factor
        prot += (product.get("protein_per_100g") or 0) * factor
        carbs += (product.get("carbs_per_100g") or 0) * factor
        fat += (product.get("fat_per_100g") or 0) * factor
        if product.get("preparation_time_minutes"):
            prep_times.append(product["preparation_time_minutes"])
        line_items.append({
            "product_id": pid, "name": product["name"], "product_type": ptype,
            "grams": line_grams, "quantity": qty, "unit_price": unit_price,
            "price": line_price, "diet_type": product.get("diet_type", "veg"),
            "image_url": product.get("image_url"),
        })
    subtotal = round(subtotal, 2)

    # Coupon / offer — single shared validator (scope/date/usage enforced identically)
    discount = 0.0
    coupon_info = None
    coupon_error = None
    if coupon_code:
        offer = await db.offers.find_one({"coupon_code": coupon_code}, {"_id": 0})
        if not offer:
            coupon_error = "Invalid or expired coupon code"
        else:
            ok, disc, error = await validate_offer_for_order(offer, store_id, user, subtotal, line_items)
            if not ok:
                coupon_error = error
            else:
                discount = disc
                coupon_info = {"code": coupon_code, "title": offer["title"], "discount_type": offer["discount_type"]}

    # Delivery fee (free over threshold) + tip
    free_delivery = subtotal >= FREE_DELIVERY_THRESHOLD
    if order_type == "delivery":
        base_delivery = 30.0
        delivery_fee = 0.0 if free_delivery else base_delivery
    elif order_type == "takeaway":
        base_delivery = 10.0
        delivery_fee = 10.0
    else:
        base_delivery = 0.0
        delivery_fee = 0.0
    tip_amount = round(max(0, tip), 2) if order_type == "delivery" else 0.0

    net_food = round(max(0, subtotal - discount), 2)
    gst_amount = round(net_food * 5 / 105, 2)
    base_amount = round(net_food - gst_amount, 2)
    grand_total = round(net_food + delivery_fee + tip_amount, 2)
    free_delivery_savings = round(base_delivery - delivery_fee, 2) if order_type == "delivery" else 0
    total_savings = round(discount + free_delivery_savings, 2)

    tiers = [
        {"label": "Free Delivery", "threshold": 300},
        {"label": "₹50 OFF", "threshold": 500},
        {"label": "₹100 OFF", "threshold": 800},
        {"label": "₹150 OFF", "threshold": 1000},
    ]
    for t in tiers:
        t["unlocked"] = subtotal >= t["threshold"]
    next_tier = next((t for t in tiers if not t["unlocked"]), None)

    return {
        "line_items": line_items,
        "subtotal": subtotal,
        "item_subtotal": subtotal,         # alias used by order placement
        "discount": discount,
        "coupon": coupon_info,
        "coupon_applied": bool(coupon_info),
        "coupon_error": coupon_error,
        "delivery_fee": delivery_fee,
        "free_delivery": free_delivery,
        "tip": tip_amount,
        "gst_amount": gst_amount,
        "gst_percent": 5,
        "base_amount": base_amount,
        "net_food": net_food,
        "grand_total": grand_total,
        "total": grand_total,              # alias used by order placement
        "total_savings": total_savings,
        "macros": {"calories": round(cal), "protein": round(prot), "carbs": round(carbs), "fat": round(fat)},
        "max_prep_minutes": max(prep_times) if prep_times else 10,
        "out_of_stock": out_of_stock,
        "price_changes": price_changes,
        "tiers": tiers,
        "next_tier": next_tier,
        "free_delivery_threshold": FREE_DELIVERY_THRESHOLD,
    }

@api_router.post("/cart/quote")
async def cart_quote(
    items: List[Dict[str, Any]] = Body(...),
    order_type: str = Body("dine-in"),
    coupon_code: Optional[str] = Body(None),
    tip: float = Body(0),
    store_id: Optional[str] = Body(None),
    user=Depends(get_current_user),
):
    """Authoritative, server-side cart bill — thin wrapper over
    compute_authoritative_bill (the same math used at order placement)."""
    return await compute_authoritative_bill(items, order_type, coupon_code, tip, store_id, user)

# ========== SMART PORTION ADJUSTER ==========
@api_router.post("/ai/adjust-portions")
async def ai_adjust_portions(
    items: List[Dict[str, Any]] = Body(...),
    calorie_goal: float = Body(...),
    consumed_today: float = Body(0),
    user=Depends(get_current_user)
):
    """AI suggests portion adjustments to fit within calorie goal"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        remaining_cal = calorie_goal - consumed_today
        items_str = "\n".join([
            f"- {i['name']}: {i['grams']}g ({round(i['grams']/100 * i['calories_per_100g'])} cal, P:{round(i['grams']/100 * i['protein_per_100g'])}g)"
            for i in items
        ])
        total_cal = sum(i['grams']/100 * i['calories_per_100g'] for i in items)
        prompt = f"""You are a nutrition expert. The customer's meal has {round(total_cal)} calories but they only have {round(remaining_cal)} calories left in their daily budget.

Current meal items:
{items_str}

Adjust the gram quantities to fit within {round(remaining_cal)} calories while:
1. Keeping protein as high as possible
2. Maintaining meal satisfaction (don't reduce everything to tiny amounts)
3. Prioritize reducing high-carb/fat items before protein items
4. Keep at least 50g minimum per item

Respond ONLY in JSON: {{"adjusted_items": [{{"name": "...", "original_grams": 100, "adjusted_grams": 75, "reason": "brief reason"}}], "summary": "one line summary"}}"""

        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY', ''),
            session_id=f"adjust-{uuid.uuid4().hex[:8]}",
            system_message="You are a nutrition expert. Respond only in valid JSON."
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=prompt))
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            cleaned = cleaned.rsplit("```", 1)[0]
        result = json.loads(cleaned)
        new_total = 0
        for adj in result.get("adjusted_items", []):
            item = next((i for i in items if i["name"].lower() == adj["name"].lower()), None)
            if item:
                adj["new_calories"] = round(adj["adjusted_grams"] / 100 * item["calories_per_100g"])
                new_total += adj["new_calories"]
        result["new_total_calories"] = round(new_total)
        result["calorie_goal"] = round(remaining_cal)
        result["saved_calories"] = round(total_cal - new_total)
        return result
    except Exception as e:
        logger.error(f"AI portion adjust error: {e}")
        # Fallback: proportional reduction
        total_cal = sum(i['grams']/100 * i['calories_per_100g'] for i in items)
        remaining_cal = max(calorie_goal - consumed_today, 200)
        ratio = remaining_cal / total_cal if total_cal > 0 else 1
        adjusted = []
        for i in items:
            new_grams = max(50, round(i['grams'] * ratio / 25) * 25)
            adjusted.append({"name": i["name"], "original_grams": i["grams"], "adjusted_grams": new_grams, "reason": "Proportional reduction"})
        return {"adjusted_items": adjusted, "summary": "Portions reduced proportionally to fit your calorie goal", "new_total_calories": round(total_cal * ratio), "calorie_goal": round(remaining_cal), "saved_calories": round(total_cal * (1 - ratio))}

# ========== ENHANCED PUSH: Auto-notify on order status ==========
async def notify_order_status(order_id: str, status: str):
    """Send push notification when order status changes"""
    import httpx
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return
    user = await db.users.find_one({"id": order["user_id"]}, {"_id": 0})
    if not user or not user.get("expo_push_token"):
        return
    status_messages = {
        "accepted": ("Order accepted!", f"Order #{order_id} has been accepted and is queued"),
        "preparing": ("Your order is being prepared!", f"Order #{order_id} is now in the kitchen"),
        "ready": ("Your order is ready!", f"Order #{order_id} is ready for pickup"),
        "completed": ("Order completed!", f"Thanks for ordering! Order #{order_id}"),
        "cancelled": ("Order cancelled", f"Order #{order_id} has been cancelled"),
        "out_for_delivery": ("Out for delivery!", f"Order #{order_id} is on its way"),
    }
    if status not in status_messages:
        return
    title, body = status_messages[status]
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": title,
        "body": body,
        "type": "order_status",
        "order_id": order_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    try:
        async with httpx.AsyncClient() as hc:
            await hc.post("https://exp.host/--/api/v2/push/send", json={
                "to": user["expo_push_token"],
                "title": title,
                "body": body,
                "data": {"type": "order_status", "order_id": order_id, "status": status}
            })
    except Exception as e:
        logger.error(f"Push error: {e}")

# ========== SEED DEFAULT OFFERS & PACKS ==========
@api_router.post("/seed-offers-packs")
async def seed_offers_and_packs():
    """Seed default offers and packs for demo"""
    offers_count = await db.offers.count_documents({})
    packs_count = await db.packs.count_documents({})
    seeded = {"offers": 0, "packs": 0}
    if offers_count == 0:
        products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(20)
        protein_ids = [p["id"] for p in products if p.get("category") == "Protein"]
        default_offers = [
            {"id": str(uuid.uuid4()), "title": "Flat 20% OFF", "subtitle": "On all protein items today", "discount_type": "percentage", "discount_value": 20, "applicable_to": "category", "applicable_category": "Protein", "applicable_product_ids": [], "banner_color": "#15140F", "coupon_code": "PROTEIN20", "min_order_value": 50, "max_discount": 100, "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "title": "₹30 OFF on Carbs", "subtitle": "Fuel your workout with healthy carbs", "discount_type": "flat", "discount_value": 30, "applicable_to": "category", "applicable_category": "Carb", "applicable_product_ids": [], "banner_color": "#26251D", "coupon_code": "CARB30", "min_order_value": 100, "max_discount": None, "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "title": "Free Delivery", "subtitle": "On orders above ₹299", "discount_type": "flat", "discount_value": 30, "applicable_to": "all", "applicable_category": None, "applicable_product_ids": [], "banner_color": "#15140F", "coupon_code": "FREEDEL", "min_order_value": 299, "max_discount": 30, "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
        ]
        await db.offers.insert_many(default_offers)
        seeded["offers"] = len(default_offers)
    if packs_count == 0:
        products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(20)
        p_map = {p["name"]: p["id"] for p in products}
        default_packs = [
            {"id": str(uuid.uuid4()), "name": "Muscle Gain Pack", "description": "High-protein combo for serious gains", "goal": "muscle_gain", "diet_type": "both", "items": [
                {"product_id": p_map.get("Chicken Breast", ""), "product_name": "Chicken Breast", "grams": 200},
                {"product_id": p_map.get("Brown Rice", ""), "product_name": "Brown Rice", "grams": 150},
                {"product_id": p_map.get("Egg White", ""), "product_name": "Egg White", "grams": 150},
                {"product_id": p_map.get("Banana", ""), "product_name": "Banana", "grams": 100},
            ], "pack_price": 199, "banner_color": "#15140F", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Fat Loss Pack", "description": "Low-cal, high-protein for effective fat loss", "goal": "fat_loss", "diet_type": "both", "items": [
                {"product_id": p_map.get("Grilled Fish", ""), "product_name": "Grilled Fish", "grams": 150},
                {"product_id": p_map.get("Salad", ""), "product_name": "Salad", "grams": 200},
                {"product_id": p_map.get("Greek Yogurt", ""), "product_name": "Greek Yogurt", "grams": 100},
                {"product_id": p_map.get("Sprouts", ""), "product_name": "Sprouts", "grams": 100},
            ], "pack_price": 179, "banner_color": "#26251D", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "name": "Veg Power Pack", "description": "Pure vegetarian protein-rich meal", "goal": "muscle_gain", "diet_type": "veg", "items": [
                {"product_id": p_map.get("Paneer Tikka", ""), "product_name": "Paneer Tikka", "grams": 200},
                {"product_id": p_map.get("Quinoa", ""), "product_name": "Quinoa", "grams": 150},
                {"product_id": p_map.get("Soya Chunks", ""), "product_name": "Soya Chunks", "grams": 100},
                {"product_id": p_map.get("Almonds", ""), "product_name": "Almonds", "grams": 50},
            ], "pack_price": 249, "banner_color": "#15140F", "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()},
        ]
        await db.packs.insert_many(default_packs)
        seeded["packs"] = len(default_packs)
    return {"message": "Seeded", **seeded}

# ========== STORES (HQ-managed multi-store foundation, Phase 0) ==========
class StoreCreate(BaseModel):
    name: str
    code: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
    gst_no: Optional[str] = None
    fssai_license: Optional[str] = None
    open_hours: Optional[str] = None
    tax_settings: Optional[Dict[str, Any]] = None
    area_manager_id: Optional[str] = None
    status: str = "active"  # active | inactive

class StoreUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
    gst_no: Optional[str] = None
    fssai_license: Optional[str] = None
    open_hours: Optional[str] = None
    tax_settings: Optional[Dict[str, Any]] = None
    area_manager_id: Optional[str] = None
    status: Optional[str] = None

def _clean_store(s: dict) -> dict:
    return {k: v for k, v in s.items() if k != "_id"}

@api_router.get("/stores/public")
async def list_public_stores():
    """Public list of active stores for customer store selection (no auth)."""
    stores = await db.stores.find({"status": "active"}, {"_id": 0}).sort("name", 1).to_list(200)
    return [
        {
            "store_id": s["store_id"], "name": s.get("name"), "code": s.get("code"),
            "address": s.get("address"), "lat": s.get("lat"), "lng": s.get("lng"),
            "phone": s.get("phone"), "open_hours": s.get("open_hours"),
        }
        for s in stores
    ]

@api_router.post("/stores")
async def create_store(data: StoreCreate, user=Depends(get_current_user)):
    """HQ: create a store."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    existing = await db.stores.find_one({"code": data.code}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Store code already in use")
    store_id = f"STORE-{uuid.uuid4().hex[:8].upper()}"
    store = {
        "store_id": store_id,
        "name": data.name,
        "code": data.code,
        "address": data.address,
        "geo": {"lat": data.lat, "lng": data.lng},
        "lat": data.lat,
        "lng": data.lng,
        "phone": data.phone,
        "gst_no": data.gst_no,
        "fssai_license": data.fssai_license,
        "open_hours": data.open_hours,
        "tax_settings": data.tax_settings or {"gst_percent": 5},
        "area_manager_id": data.area_manager_id,
        "status": data.status if data.status in ("active", "inactive") else "active",
        "onboarding_status": "created",  # Phase 5C: onboarding workflow start
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.stores.insert_one(store)
    return _clean_store(store)

@api_router.get("/stores")
async def list_stores(user=Depends(get_current_user)):
    """List stores within the caller's scope (HQ: all, area_manager: cluster,
    store-bound staff: own store)."""
    if not role_in(user, *STAFF_ROLES):
        raise HTTPException(status_code=403, detail="Staff only")
    query = store_filter(user, field="store_id")
    stores = await db.stores.find(query, {"_id": 0}).sort("name", 1).to_list(200)
    return stores

@api_router.get("/stores/{store_id}")
async def get_store(store_id: str, user=Depends(get_current_user)):
    if not role_in(user, *STAFF_ROLES):
        raise HTTPException(status_code=403, detail="Staff only")
    assert_store_allowed(user, store_id)
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store

@api_router.put("/stores/{store_id}")
async def update_store(store_id: str, data: StoreUpdate, user=Depends(get_current_user)):
    """HQ: update a store."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if "lat" in updates or "lng" in updates:
        existing = await db.stores.find_one({"store_id": store_id}, {"_id": 0}) or {}
        geo = existing.get("geo") or {}
        updates["geo"] = {"lat": updates.get("lat", geo.get("lat")), "lng": updates.get("lng", geo.get("lng"))}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    result = await db.stores.update_one({"store_id": store_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    return store

@api_router.delete("/stores/{store_id}")
async def delete_store(store_id: str, user=Depends(get_current_user)):
    """HQ: deactivate a store (soft delete to preserve historical data)."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    if store_id == DEFAULT_STORE_ID:
        raise HTTPException(status_code=400, detail="Cannot delete the default store")
    result = await db.stores.update_one({"store_id": store_id}, {"$set": {"status": "inactive"}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"message": "Store deactivated"}

# ==========================================================================
# PHASE 1C — SALES AGGREGATION (store-vs-store, scope-locked)
# Sales/orders metrics ONLY (revenue = what the customer paid). This endpoint
# never reads or returns purchase cost / COGS / margin / profit — that is Phase 4.
# ==========================================================================
def _resolve_report_store_ids(user, store_ids_param: Optional[str]):
    """Decide which stores to report on, enforcing role scope.

    super_admin: any/all. area_manager: own cluster only. store_manager: own
    store only. Requesting a store outside scope -> 403.
    """
    scope = staff_store_scope(user)  # None => all stores (super_admin)
    requested = None
    if store_ids_param and store_ids_param.strip().lower() != "all":
        requested = [s.strip() for s in store_ids_param.split(",") if s.strip()]
    if requested is not None:
        if scope is not None:
            for sid in requested:
                if sid not in scope:
                    raise HTTPException(status_code=403, detail="Store outside your scope")
        return requested, scope
    return None, scope  # None => "all in scope"

@api_router.get("/reports/sales-summary")
async def sales_summary(
    user=Depends(get_current_user),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    store_ids: Optional[str] = None,
):
    """Per-store sales summary (order_count, gross_revenue, AOV, top products),
    date-filtered and role-scoped. Aggregated server-side via Mongo pipelines.
    NOTE: sales/orders metrics only — no cost/COGS/margin/profit."""
    if not role_in(user, "super_admin", "area_manager", "store_manager"):
        raise HTTPException(status_code=403, detail="Dashboard access denied")

    requested, scope = _resolve_report_store_ids(user, store_ids)
    if requested is not None:
        target_ids = requested
    elif scope is None:  # super_admin, all stores
        all_stores = await db.stores.find({}, {"_id": 0, "store_id": 1}).to_list(1000)
        target_ids = [s["store_id"] for s in all_stores]
    else:
        target_ids = list(scope)

    stores = await db.stores.find({"store_id": {"$in": target_ids}}, {"_id": 0, "store_id": 1, "name": 1}).to_list(1000)
    name_by_id = {s["store_id"]: s.get("name") for s in stores}

    # created_at is an ISO string; lexicographic compare works for ISO timestamps.
    match: Dict[str, Any] = {"store_id": {"$in": target_ids}, "status": {"$ne": "cancelled"}}
    created: Dict[str, Any] = {}
    if date_from:
        created["$gte"] = date_from
    if date_to:
        created["$lte"] = date_to + "T23:59:59.999999+00:00"
    if created:
        match["created_at"] = created

    # 1) Per-store order metrics
    metrics = await db.orders.aggregate([
        {"$match": match},
        {"$group": {"_id": "$store_id", "order_count": {"$sum": 1}, "gross_revenue": {"$sum": "$total_price"}}},
    ]).to_list(1000)
    metrics_by_id = {m["_id"]: m for m in metrics}

    # 2) Per-store top products (by qty sold) — aggregated, not pulled to app layer
    top_rows = await db.orders.aggregate([
        {"$match": match},
        {"$unwind": "$items"},
        {"$group": {
            "_id": {"store_id": "$store_id", "product_id": "$items.product_id"},
            "name": {"$first": "$items.product_name"},
            "qty": {"$sum": "$items.quantity"},
        }},
        {"$sort": {"qty": -1}},
    ]).to_list(10000)
    top_by_store: Dict[str, list] = {}
    for r in top_rows:
        sid = r["_id"]["store_id"]
        bucket = top_by_store.setdefault(sid, [])
        if len(bucket) < 5:
            bucket.append({"product_id": r["_id"]["product_id"], "name": r.get("name"), "qty": r.get("qty", 0)})

    # Consistent shape: one object per target store (incl. zero-order stores)
    result = []
    for sid in target_ids:
        m = metrics_by_id.get(sid, {})
        oc = m.get("order_count", 0)
        rev = round(m.get("gross_revenue", 0) or 0, 2)
        result.append({
            "store_id": sid,
            "store_name": name_by_id.get(sid, sid),
            "order_count": oc,
            "gross_revenue": rev,
            "avg_order_value": round(rev / oc, 2) if oc else 0,
            "top_products": top_by_store.get(sid, []),
        })
    return result

# ========== STAFF MANAGEMENT (PIN-based auth) ==========
# Roles a staff member can be created with via this endpoint. super_admin is
# bootstrapped by migration/seed; customers register via /auth/register.
STAFF_CREATE_ROLES = {"area_manager", "store_manager", "cashier", "kitchen"}

class StaffCreate(BaseModel):
    name: str
    role: str  # area_manager | store_manager | cashier | kitchen
    pin: str  # 4-6 digit PIN
    store_id: Optional[str] = None  # required for store_manager/cashier/kitchen
    cluster_store_ids: Optional[List[str]] = None  # required for area_manager

class StaffUpdate(BaseModel):
    name: Optional[str] = None
    pin: Optional[str] = None
    is_active: Optional[bool] = None
    store_id: Optional[str] = None
    cluster_store_ids: Optional[List[str]] = None

class PinLogin(BaseModel):
    pin: str

@api_router.post("/staff")
async def create_staff(data: StaffCreate, user=Depends(get_current_user)):
    """Create a staff member with a PIN and EXACTLY ONE role.

    HQ can create any staff role; a store_manager may only create cashier/kitchen
    for their own store. Store-bound roles require a store_id; area_manager
    requires a cluster (list of store_ids)."""
    creator_role = normalize_role(user)
    if creator_role not in ("super_admin", "store_manager"):
        raise HTTPException(status_code=403, detail="HQ/Store-Manager only")
    if data.role not in STAFF_CREATE_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {sorted(STAFF_CREATE_ROLES)}")
    if creator_role == "store_manager" and data.role not in ("cashier", "kitchen"):
        raise HTTPException(status_code=403, detail="Store managers can only create cashier/kitchen staff")
    if not data.pin.isdigit() or len(data.pin) < 4 or len(data.pin) > 6:
        raise HTTPException(status_code=400, detail="PIN must be 4-6 digits")

    staff_doc = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "role": data.role,
        "pin_hash": hash_password(data.pin),
        "pin_plain": data.pin,  # For admin display (in production, remove this)
        "is_active": True,
        "store_id": None,
        "cluster_store_ids": None,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Resolve & validate store assignment based on the (single) role.
    if data.role == "area_manager":
        cluster = data.cluster_store_ids or []
        if not cluster:
            raise HTTPException(status_code=400, detail="area_manager requires cluster_store_ids")
        staff_doc["cluster_store_ids"] = cluster
    else:  # store_manager / cashier / kitchen
        store_id = data.store_id if creator_role == "super_admin" else (user.get("store_id") or DEFAULT_STORE_ID)
        if not store_id:
            raise HTTPException(status_code=400, detail=f"{data.role} requires a store_id")
        assert_store_allowed(user, store_id)
        store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
        if not store:
            raise HTTPException(status_code=400, detail="Invalid store_id")
        staff_doc["store_id"] = store_id

    # PIN uniqueness
    existing = await db.users.find_one({"pin_plain": data.pin, "pin_hash": {"$exists": True}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="This PIN is already in use")

    await db.users.insert_one(staff_doc)
    return {
        "id": staff_doc["id"], "name": data.name, "role": data.role, "pin": data.pin,
        "store_id": staff_doc["store_id"], "cluster_store_ids": staff_doc["cluster_store_ids"],
        "is_active": True,
    }

@api_router.get("/staff")
async def list_staff(user=Depends(get_current_user)):
    """List staff. HQ sees all; a store_manager/area_manager sees staff within
    their store scope."""
    role = normalize_role(user)
    if role not in ("super_admin", "area_manager", "store_manager"):
        raise HTTPException(status_code=403, detail="HQ/Manager only")
    base = {"role": {"$in": ["store_manager", "cashier", "kitchen", "area_manager"]}}
    scope = staff_store_scope(user)
    if scope is not None:
        base["$or"] = [
            {"store_id": {"$in": scope}},
            {"cluster_store_ids": {"$in": scope}},
        ]
    staff = await db.users.find(base, {"_id": 0}).to_list(200)
    return [
        {
            "id": s["id"], "name": s["name"], "role": s["role"], "pin": s.get("pin_plain", "****"),
            "store_id": s.get("store_id"), "cluster_store_ids": s.get("cluster_store_ids"),
            "is_active": s.get("is_active", True), "created_at": s.get("created_at"),
        }
        for s in staff
    ]

@api_router.put("/staff/{staff_id}")
async def update_staff(staff_id: str, data: StaffUpdate, user=Depends(get_current_user)):
    """Update staff. HQ for anyone; store_manager only within their store scope."""
    role = normalize_role(user)
    if role not in ("super_admin", "store_manager"):
        raise HTTPException(status_code=403, detail="HQ/Store-Manager only")
    target = await db.users.find_one(
        {"id": staff_id, "role": {"$in": ["store_manager", "cashier", "kitchen", "area_manager"]}}, {"_id": 0}
    )
    if not target:
        raise HTTPException(status_code=404, detail="Staff not found")
    if target.get("store_id"):
        assert_store_allowed(user, target.get("store_id"))
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.pin is not None:
        if not data.pin.isdigit() or len(data.pin) < 4 or len(data.pin) > 6:
            raise HTTPException(status_code=400, detail="PIN must be 4-6 digits")
        update_data["pin_hash"] = hash_password(data.pin)
        update_data["pin_plain"] = data.pin
    if data.is_active is not None:
        update_data["is_active"] = data.is_active
    if data.store_id is not None and role == "super_admin":
        update_data["store_id"] = data.store_id
    if data.cluster_store_ids is not None and role == "super_admin":
        update_data["cluster_store_ids"] = data.cluster_store_ids
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    await db.users.update_one({"id": staff_id}, {"$set": update_data})
    return {"message": "Staff updated"}

@api_router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, user=Depends(get_current_user)):
    """Delete staff. HQ for anyone; store_manager only within their store scope."""
    role = normalize_role(user)
    if role not in ("super_admin", "store_manager"):
        raise HTTPException(status_code=403, detail="HQ/Store-Manager only")
    target = await db.users.find_one(
        {"id": staff_id, "role": {"$in": ["store_manager", "cashier", "kitchen", "area_manager"]}}, {"_id": 0}
    )
    if not target:
        raise HTTPException(status_code=404, detail="Staff not found")
    if target.get("store_id"):
        assert_store_allowed(user, target.get("store_id"))
    await db.users.delete_one({"id": staff_id})
    return {"message": "Staff deleted"}

@api_router.post("/auth/pin-login")
async def pin_login(data: PinLogin):
    """PIN-based login for store staff (store_manager/cashier/kitchen/area_manager)."""
    if not data.pin.isdigit() or len(data.pin) < 4 or len(data.pin) > 6:
        raise HTTPException(status_code=400, detail="Invalid PIN format")
    # Find staff by PIN
    staff_list = await db.users.find(
        {"role": {"$in": ["store_manager", "kitchen", "cashier", "area_manager"]}, "is_active": True}, {"_id": 0}
    ).to_list(500)
    matched_staff = None
    for s in staff_list:
        if s.get("pin_hash") and verify_password(data.pin, s["pin_hash"]):
            matched_staff = s
            break
    if not matched_staff:
        raise HTTPException(status_code=401, detail="Invalid PIN")
    token = create_token(matched_staff["id"], matched_staff["role"])
    return {
        "token": token,
        "user": {
            "id": matched_staff["id"],
            "name": matched_staff["name"],
            "role": matched_staff["role"],
            "store_id": matched_staff.get("store_id"),
            "cluster_store_ids": matched_staff.get("cluster_store_ids"),
        }
    }

# ========== ORDER PRIORITY ==========
@api_router.put("/orders/{order_id}/priority")
async def set_order_priority(order_id: str, priority: str = Body(..., embed=True), user=Depends(get_current_user)):
    """Set priority flag on order (kitchen/manager/HQ, within their store)."""
    if not role_in(user, "super_admin", "store_manager", "kitchen"):
        raise HTTPException(status_code=403, detail="Kitchen staff only")
    if priority not in ("normal", "high", "urgent"):
        raise HTTPException(status_code=400, detail="Priority must be: normal, high, urgent")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    assert_store_allowed(user, order.get("store_id"))
    await db.orders.update_one({"id": order_id}, {"$set": {"priority": priority}})
    return {"message": f"Priority set to {priority}"}

# ========== HOLD BILLS (Cashier) ==========
class HoldBillCreate(BaseModel):
    customer_name: Optional[str] = "Walk-in"
    order_type: str = "dine-in"
    items: List[Dict[str, Any]]
    coupon_code: Optional[str] = None
    coupon_discount: Optional[float] = 0

@api_router.post("/held-bills")
async def hold_bill(data: HoldBillCreate, user=Depends(get_current_user)):
    """Cashier/Manager: Save cart as a held bill (tied to the staff member's store)."""
    if not role_in(user, "super_admin", "store_manager", "cashier"):
        raise HTTPException(status_code=403, detail="Cashier/Manager only")
    store_id = user.get("store_id") or DEFAULT_STORE_ID
    bill_id = str(uuid.uuid4())
    bill = {
        "id": bill_id,
        "store_id": store_id,
        "cashier_id": user["id"],
        "cashier_name": user["name"],
        "customer_name": data.customer_name or "Walk-in",
        "order_type": data.order_type,
        "items": data.items,
        "coupon_code": data.coupon_code,
        "coupon_discount": data.coupon_discount or 0,
        "status": "held",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.held_bills.insert_one(bill)
    return {k: v for k, v in bill.items() if k != "_id"}

@api_router.get("/held-bills")
async def list_held_bills(user=Depends(get_current_user)):
    """Cashier/Manager: List held bills within the caller's store scope."""
    if not role_in(user, "super_admin", "area_manager", "store_manager", "cashier"):
        raise HTTPException(status_code=403, detail="Cashier/Manager only")
    query = {**store_filter(user), "status": "held"}
    bills = await db.held_bills.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return bills

@api_router.delete("/held-bills/{bill_id}")
async def delete_held_bill(bill_id: str, user=Depends(get_current_user)):
    """Cashier/Manager: Remove a held bill (only within the caller's store scope)."""
    if not role_in(user, "super_admin", "store_manager", "cashier"):
        raise HTTPException(status_code=403, detail="Cashier/Manager only")
    bill = await db.held_bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Held bill not found")
    assert_store_allowed(user, bill.get("store_id"))
    await db.held_bills.delete_one({"id": bill_id})
    return {"message": "Held bill removed"}

# ========== INVENTORY FOR KITCHEN ==========
@api_router.get("/inventory")
async def get_inventory(store_id: Optional[str] = None, user=Depends(get_current_user)):
    """Staff: per-store stock from inventory_items (the single source of truth —
    Fix 2; no longer products.available_qty_grams). Store-bound roles see their
    own store; area/HQ may pass ?store_id= (scoped) or get all in scope.
    cashier/kitchen never see avg_cost (stripped by _public_item)."""
    if not role_in(user, *STAFF_ROLES):
        raise HTTPException(status_code=403, detail="Staff only")
    if store_id:
        assert_store_allowed(user, store_id)
        query = {"store_id": store_id}
    else:
        query = store_filter(user)  # {} for HQ, else limited to the caller's store(s)
    items = await db.inventory_items.find(query, {"_id": 0}).sort("name", 1).to_list(5000)
    rows = []
    for it in items:
        qty = float(it.get("qty_on_hand", 0) or 0)
        rl = float(it.get("reorder_level", 0) or 0)
        if rl > 0:
            status = "in_stock" if qty > rl else "low" if qty > 0 else "out_of_stock"
        else:
            status = "in_stock" if qty > 500 else "low" if qty > 0 else "out_of_stock"
        row = {
            "id": it["id"], "product_id": it.get("product_id"), "store_id": it.get("store_id"),
            "name": it.get("name"), "category": it.get("category"), "unit": it.get("unit", "g"),
            "qty_on_hand": qty, "available_qty_grams": qty,  # legacy alias for existing UI
            "reorder_level": rl, "avg_cost": it.get("avg_cost", 0),
            "is_active": it.get("is_active", True), "status": status,
        }
        rows.append(_public_item(row, user))  # strips avg_cost for cashier/kitchen
    return rows

# ========== STOCK MANAGEMENT (Phase 3D: writes per-store inventory_items) ==========
class StockUpdateRequest(BaseModel):
    product_id: str
    quantity_grams: float  # positive to add, negative to remove
    reason: Optional[str] = ""
    store_id: Optional[str] = None  # required (falls back to the caller's own store)

@api_router.post("/inventory/update-stock")
async def update_stock(data: StockUpdateRequest, user=Depends(get_current_user)):
    """Manager/HQ: adjust a product's stock for a STORE in inventory_items (the
    single source of truth). cashier/kitchen 403. Logged via movement_log 'adjust'."""
    require_inventory_manager(user)  # super_admin / area_manager / store_manager
    store_id = data.store_id or user.get("store_id")
    if not store_id:
        raise HTTPException(status_code=400, detail="store_id is required")
    assert_store_allowed(user, store_id)
    item = await db.inventory_items.find_one({"store_id": store_id, "product_id": data.product_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found for this product in this store")
    new_qty = float(item.get("qty_on_hand", 0) or 0) + data.quantity_grams
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Cannot reduce stock below 0")
    now = datetime.now(timezone.utc).isoformat()
    await db.inventory_items.update_one({"id": item["id"], "store_id": store_id},
                                        {"$set": {"qty_on_hand": new_qty, "updated_at": now}})
    await log_movement(store_id=store_id, item_id=item["id"], product_id=data.product_id, mtype="adjust",
                       qty_delta=data.quantity_grams, qty_after=new_qty,
                       reason=data.reason or ("restock" if data.quantity_grams > 0 else "stock removed"),
                       user_id=user["id"], unit_cost_at_time=float(item.get("avg_cost", 0) or 0))
    await broadcast_event("menu_update", {"action": "stock_changed", "product_id": data.product_id}, store_id=store_id)
    return {"product_id": data.product_id, "store_id": store_id, "new_qty_grams": new_qty,
            "status": "in_stock" if new_qty > 500 else "low" if new_qty > 0 else "out_of_stock"}

@api_router.get("/inventory/stock-logs")
async def get_stock_logs(store_id: Optional[str] = None, user=Depends(get_current_user)):
    """Staff: stock movement history from movement_log (Fix 2 — the real ledger;
    no longer the legacy stock_logs collection), newest-first, store-scoped.
    cashier/kitchen never see unit_cost_at_time."""
    if not role_in(user, *STAFF_ROLES):
        raise HTTPException(status_code=403, detail="Staff only")
    if store_id:
        assert_store_allowed(user, store_id)
        query = {"store_id": store_id}
    else:
        query = store_filter(user)
    logs = await db.movement_log.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    if not can_see_cost(user):
        for l in logs:
            l.pop("unit_cost_at_time", None)
    return logs

# ========== P1: NOTIFICATIONS ==========
@api_router.get("/notifications")
async def get_notifications(user=Depends(get_current_user)):
    """Get notifications. Customers see their own; staff see their store's staff
    notifications (scoped by role)."""
    if normalize_role(user) == "customer":
        query = {"user_id": user["id"]}
    else:
        # Staff-facing notifications carry a store_id; scope to the caller's store(s).
        query = store_filter(user)
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return notifications

@api_router.put("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, user=Depends(get_current_user)):
    notif = await db.notifications.find_one({"id": notif_id}, {"_id": 0})
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    if normalize_role(user) == "customer":
        if notif.get("user_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    elif notif.get("store_id"):
        assert_store_allowed(user, notif.get("store_id"))
    await db.notifications.update_one({"id": notif_id}, {"$set": {"read": True}})
    return {"message": "Marked as read"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(user=Depends(get_current_user)):
    if normalize_role(user) == "customer":
        query = {"read": False, "user_id": user["id"]}
    else:
        query = {"read": False, **store_filter(user)}
    await db.notifications.update_many(query, {"$set": {"read": True}})
    return {"message": "All marked as read"}

# ========== P1: ORDER RECEIPT / BILL GENERATION ==========
@api_router.get("/orders/{order_id}/receipt")
async def get_order_receipt(order_id: str, user=Depends(get_current_user)):
    """Generate receipt data for an order"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # Owner customer, or staff with access to the order's store, may view the receipt.
    if normalize_role(user) == "customer":
        if order.get("user_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        assert_store_allowed(user, order.get("store_id"))
    payment = await db.payments.find_one({"order_id": order_id}, {"_id": 0})
    total = order.get("total_price", 0)
    gst_amount = order.get("gst_amount", round(total * 5 / 105, 2))
    base_amount = order.get("base_amount", round(total * 100 / 105, 2))
    receipt = {
        "cafe_name": "BORAROC",
        "cafe_tagline": "Fit your budget. Fuel your goal.",
        "order_id": order["id"],
        "order_type": order.get("order_type", "dine-in"),
        "customer_name": order.get("customer_name", order.get("user_name", "Walk-in")),
        "date": order.get("created_at", ""),
        "items": [],
        "subtotal": 0,
        "extra_charge": order.get("extra_charge", 0),
        "extra_charge_label": "Takeaway" if order.get("order_type") == "takeaway" else "Delivery" if order.get("order_type") == "delivery" else None,
        "discount": order.get("discount", 0),
        "coupon_code": order.get("coupon_code"),
        "base_amount": base_amount,
        "gst_percent": 5,
        "gst_amount": gst_amount,
        "total": total,
        "payment_mode": order.get("payment_mode", "cash"),
        "payment_status": payment.get("status", "paid") if payment else order.get("payment_status", "paid"),
        "nutrition_summary": {
            "calories": order.get("total_calories", 0),
            "protein": order.get("total_protein", 0),
            "carbs": order.get("total_carbs", 0),
            "fat": order.get("total_fat", 0),
        },
        "status": order.get("status", "pending"),
    }
    subtotal = 0
    for item in order.get("items", []):
        line = {
            "name": item.get("product_name", ""),
            "quantity": f"{item.get('grams', 0)}g" if item.get("product_type") != "ready_made" else f"x{item.get('quantity', 1)}",
            "price": item.get("price", 0),
            "calories": item.get("calories", 0),
        }
        receipt["items"].append(line)
        subtotal += item.get("price", 0)
    receipt["subtotal"] = round(subtotal, 2)
    return receipt

# ========== P1: KITCHEN ORDERS FOR KITCHEN/CASHIER ROLES ==========
@api_router.get("/orders/active")
async def active_orders(user=Depends(get_current_user)):
    """Staff: Get active orders within the caller's store scope."""
    if not role_in(user, *STAFF_ROLES):
        raise HTTPException(status_code=403, detail="Staff only")
    query = {**store_filter(user), "status": {"$in": ["pending", "accepted", "preparing", "ready"]}}
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", 1).to_list(100)
    return orders

# ========== P2: SHIFT MANAGEMENT ==========
class ShiftCreate(BaseModel):
    staff_id: str
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    notes: Optional[str] = ""

class ShiftUpdate(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[str] = None  # scheduled, active, completed, cancelled
    notes: Optional[str] = None

@api_router.post("/shifts")
async def create_shift(data: ShiftCreate, user=Depends(get_current_user)):
    """HQ/Store-Manager: Create a shift for store-bound staff (scoped to their store)."""
    if not role_in(user, "super_admin", "store_manager"):
        raise HTTPException(status_code=403, detail="HQ/Store-Manager only")
    staff = await db.users.find_one(
        {"id": data.staff_id, "role": {"$in": ["store_manager", "kitchen", "cashier"]}}, {"_id": 0}
    )
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    store_id = staff.get("store_id") or DEFAULT_STORE_ID
    assert_store_allowed(user, store_id)
    shift_id = str(uuid.uuid4())
    shift = {
        "id": shift_id,
        "store_id": store_id,
        "staff_id": data.staff_id,
        "staff_name": staff["name"],
        "staff_role": staff["role"],
        "date": data.date,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "status": "scheduled",
        "notes": data.notes or "",
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.shifts.insert_one(shift)
    return {k: v for k, v in shift.items() if k != "_id"}

@api_router.get("/shifts")
async def list_shifts(date: Optional[str] = None, user=Depends(get_current_user)):
    """Staff: List shifts. Managers/HQ see their store(s); line staff see their own."""
    if not role_in(user, *STAFF_ROLES):
        raise HTTPException(status_code=403, detail="Staff only")
    query: Dict[str, Any] = dict(store_filter(user))
    if date:
        query["date"] = date
    if normalize_role(user) in ("kitchen", "cashier"):
        query["staff_id"] = user["id"]
    shifts = await db.shifts.find(query, {"_id": 0}).sort("date", -1).to_list(100)
    return shifts

@api_router.put("/shifts/{shift_id}")
async def update_shift(shift_id: str, data: ShiftUpdate, user=Depends(get_current_user)):
    """HQ/Store-Manager: Update shift (within their store scope)."""
    if not role_in(user, "super_admin", "store_manager"):
        raise HTTPException(status_code=403, detail="HQ/Store-Manager only")
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    assert_store_allowed(user, shift.get("store_id"))
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.shifts.update_one({"id": shift_id}, {"$set": update_data})
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    return shift

@api_router.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: str, user=Depends(get_current_user)):
    """HQ/Store-Manager: Delete shift (within their store scope)."""
    if not role_in(user, "super_admin", "store_manager"):
        raise HTTPException(status_code=403, detail="HQ/Store-Manager only")
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    assert_store_allowed(user, shift.get("store_id"))
    await db.shifts.delete_one({"id": shift_id})
    return {"message": "Shift deleted"}

# ========== P2: LOYALTY / REWARDS ==========
@api_router.get("/loyalty/points")
async def get_loyalty_points(user=Depends(get_current_user)):
    """Get user's loyalty points"""
    loyalty = await db.loyalty.find_one({"user_id": user["id"]}, {"_id": 0})
    if not loyalty:
        loyalty = {
            "user_id": user["id"],
            "points": 0,
            "total_earned": 0,
            "total_redeemed": 0,
            "tier": "Bronze",
            "history": []
        }
    # Calculate tier
    total = loyalty.get("total_earned", 0)
    tier = "Bronze" if total < 500 else "Silver" if total < 1500 else "Gold" if total < 5000 else "Platinum"
    loyalty["tier"] = tier
    return loyalty

@api_router.post("/loyalty/earn")
async def earn_loyalty_points(order_id: str = Body(..., embed=True), user=Depends(get_current_user)):
    """Earn points from an order (1 point per ₹10 spent)"""
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # Check if already earned
    existing = await db.loyalty.find_one({"user_id": user["id"], "history.order_id": order_id}, {"_id": 0})
    if existing:
        return {"message": "Points already earned for this order"}
    points = max(1, int(order.get("total_price", 0) / 10))
    await db.loyalty.update_one(
        {"user_id": user["id"]},
        {
            "$inc": {"points": points, "total_earned": points},
            "$push": {"history": {"order_id": order_id, "points": points, "type": "earned", "date": datetime.now(timezone.utc).isoformat()}}
        },
        upsert=True
    )
    return {"points_earned": points, "message": f"Earned {points} points!"}

@api_router.post("/loyalty/redeem")
async def redeem_loyalty_points(points: int = Body(..., embed=True), user=Depends(get_current_user)):
    """Redeem loyalty points (10 points = ₹1 discount)"""
    loyalty = await db.loyalty.find_one({"user_id": user["id"]}, {"_id": 0})
    if not loyalty or loyalty.get("points", 0) < points:
        raise HTTPException(status_code=400, detail="Insufficient points")
    if points < 50:
        raise HTTPException(status_code=400, detail="Minimum 50 points to redeem")
    discount = round(points / 10, 2)
    await db.loyalty.update_one(
        {"user_id": user["id"]},
        {
            "$inc": {"points": -points, "total_redeemed": points},
            "$push": {"history": {"points": -points, "discount": discount, "type": "redeemed", "date": datetime.now(timezone.utc).isoformat()}}
        }
    )
    return {"points_redeemed": points, "discount": discount, "message": f"Redeemed {points} points for ₹{discount} discount"}

# ========== P2: WEEKLY MEAL PLANNING ==========
class MealPlanCreate(BaseModel):
    name: str
    goal: str  # fat_loss, muscle_gain, maintenance
    diet_preference: str  # veg, non-veg, both
    days: List[Dict[str, Any]]  # [{day: "Monday", meals: [{product_id, product_name, grams, meal_type}]}]

@api_router.post("/meal-plans")
async def create_meal_plan(data: MealPlanCreate, user=Depends(get_current_user)):
    """Create a weekly meal plan"""
    plan_id = str(uuid.uuid4())
    plan = {
        "id": plan_id,
        "user_id": user["id"],
        "name": data.name,
        "goal": data.goal,
        "diet_preference": data.diet_preference,
        "days": data.days,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.meal_plans.insert_one(plan)
    return {k: v for k, v in plan.items() if k != "_id"}

@api_router.get("/meal-plans")
async def list_meal_plans(user=Depends(get_current_user)):
    """Get user's meal plans"""
    plans = await db.meal_plans.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return plans

@api_router.post("/ai/generate-meal-plan")
async def ai_generate_meal_plan(
    goal: str = Body(...),
    diet_preference: str = Body(...),
    budget_per_day: Optional[float] = Body(None),
    user=Depends(get_current_user)
):
    """AI generates a weekly meal plan"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(100)
        products = [ensure_product_diet_types(p) for p in products]
        _prefs = diet_prefs_to_list(diet_preference)
        filtered_products = [p for p in products if not _prefs or product_matches_diet(p, _prefs)]
        menu_str = "\n".join([f"- {p['name']}: ₹{p['cost_per_100g']}/100g | {p['calories_per_100g']}cal, P:{p['protein_per_100g']}g per 100g" for p in filtered_products[:25]])
        budget_str = f"Daily budget: ₹{budget_per_day}" if budget_per_day else "No budget limit"
        
        prompt = f"""Create a 7-day meal plan for a customer with goal: {goal}, diet: {diet_preference}.
{budget_str}

Available menu items:
{menu_str}

For each day (Monday-Sunday), suggest 2-3 meals (lunch/dinner/snack) using ONLY items from the menu above.

Respond in JSON:
{{"plan_name": "...", "days": [{{"day": "Monday", "meals": [{{"meal_type": "lunch", "items": [{{"product_name": "Exact Name", "grams": 150}}], "summary": "Brief"}}]}}]}}"""

        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY', ''),
            session_id=f"mealplan-{uuid.uuid4()}",
            system_message="You are a nutrition expert. Respond in valid JSON only. You are NOT a doctor: never give medical/clinical/diagnostic advice; for health conditions advise consulting a professional."
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=prompt))
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            cleaned = cleaned.rsplit("```", 1)[0]
        result = json.loads(cleaned)
        
        # Enrich with product data
        for day in result.get("days", []):
            for meal in day.get("meals", []):
                for item in meal.get("items", []):
                    product = next((p for p in filtered_products if p["name"].lower() == item["product_name"].lower()), None)
                    if not product:
                        product = next((p for p in filtered_products if item["product_name"].lower() in p["name"].lower()), None)
                    if product:
                        f = item.get("grams", 100) / 100
                        item["product_id"] = product["id"]
                        item["price"] = round(f * product["cost_per_100g"], 2)
                        item["calories"] = round(f * product["calories_per_100g"], 1)
                        item["protein"] = round(f * product["protein_per_100g"], 1)
        return result
    except Exception as e:
        logger.error(f"AI meal plan error: {e}")
        return {"plan_name": "Default Plan", "days": [], "error": "AI unavailable, please try again"}

@api_router.delete("/meal-plans/{plan_id}")
async def delete_meal_plan(plan_id: str, user=Depends(get_current_user)):
    result = await db.meal_plans.delete_one({"id": plan_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meal plan not found")
    return {"message": "Meal plan deleted"}

# ========== P2: DAILY STREAK TRACKER ==========
@api_router.get("/streak")
async def get_streak(user=Depends(get_current_user)):
    """Get user's daily ordering streak"""
    streak_data = await db.streaks.find_one({"user_id": user["id"]}, {"_id": 0})
    if not streak_data:
        return {"current_streak": 0, "longest_streak": 0, "last_order_date": None, "total_orders": 0}
    return streak_data

@api_router.post("/streak/update")
async def update_streak(user=Depends(get_current_user)):
    """Update streak after placing an order"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    
    streak_data = await db.streaks.find_one({"user_id": user["id"]}, {"_id": 0})
    if not streak_data:
        streak_data = {"user_id": user["id"], "current_streak": 0, "longest_streak": 0, "last_order_date": None, "total_orders": 0}
    
    last_date = streak_data.get("last_order_date")
    if last_date == today:
        return streak_data  # Already counted today
    
    if last_date == yesterday:
        streak_data["current_streak"] = streak_data.get("current_streak", 0) + 1
    else:
        streak_data["current_streak"] = 1
    
    streak_data["last_order_date"] = today
    streak_data["total_orders"] = streak_data.get("total_orders", 0) + 1
    streak_data["longest_streak"] = max(streak_data.get("longest_streak", 0), streak_data["current_streak"])
    
    await db.streaks.update_one(
        {"user_id": user["id"]},
        {"$set": streak_data},
        upsert=True
    )
    return {k: v for k, v in streak_data.items() if k != "_id"}

# ========== P2: KITCHEN TICKET (Print-friendly data) ==========
@api_router.get("/orders/{order_id}/kitchen-ticket")
async def get_kitchen_ticket(order_id: str, user=Depends(get_current_user)):
    """Get print-friendly kitchen ticket data (staff, within their store scope)."""
    if not role_in(user, *STAFF_ROLES):
        raise HTTPException(status_code=403, detail="Staff only")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    assert_store_allowed(user, order.get("store_id"))
    ticket = {
        "order_id": order["id"],
        "order_type": order.get("order_type", "dine-in"),
        "customer": order.get("user_name", "Walk-in"),
        "time": order.get("created_at", ""),
        "priority": order.get("priority", "normal"),
        "items": [],
        "special_notes": order.get("notes", ""),
        "table": order.get("table_number"),
        "status": order.get("status", "pending"),
    }
    max_prep = 0
    for item in order.get("items", []):
        prep = 0
        prod = await db.products.find_one({"id": item.get("product_id")}, {"_id": 0})
        if prod and prod.get("preparation_time_minutes"):
            prep = prod["preparation_time_minutes"]
            max_prep = max(max_prep, prep)
        ticket_item = {
            "name": item.get("product_name", ""),
            "quantity": f"{item.get('grams', 0)}g" if item.get("product_type") != "ready_made" else f"x{item.get('quantity', 1)} plates",
            "preparation_time_minutes": prep,
        }
        # Include ingredient breakdown for ready-made items
        if item.get("ingredients_breakdown"):
            ticket_item["ingredients"] = [
                {"name": ing["name"], "grams": ing.get("total_grams", ing.get("grams_per_serving", 0))}
                for ing in item["ingredients_breakdown"]
            ]
        if item.get("customized_ingredients"):
            ticket_item["customized"] = True
            ticket_item["custom_ingredients"] = item["customized_ingredients"]
        ticket["items"].append(ticket_item)
    ticket["total_preparation_time_minutes"] = max_prep  # B5: longest item prep drives the ticket ETA
    return ticket

# ==========================================================================
# PHASE 3A — RAW INVENTORY: item master + inward/GRN + append-only movement log
# Raw materials only, per store. Ready-made meals are recipes (not stocked).
# Cost (avg_cost / purchase_price / valuation) is NEVER returned to cashier or
# kitchen, and never crosses cluster scope. This phase is ADDITIVE: the live
# sale path (orders / cart_quote / check_ready_made_stock) is untouched.
# ==========================================================================
INVENTORY_UNITS = {"g", "kg", "ml", "l", "pcs"}
MOVEMENT_TYPES = {"inward", "sale", "discard", "transfer_in", "transfer_out", "adjust"}
INVENTORY_MANAGER_ROLES = ("super_admin", "area_manager", "store_manager")

def can_see_cost(user) -> bool:
    """Only managers/HQ may see purchase cost & valuation — never cashier/kitchen."""
    return normalize_role(user) in INVENTORY_MANAGER_ROLES

def _public_item(item: dict, user) -> dict:
    """Strip cost fields for roles that may not see them (cashier/kitchen)."""
    out = {k: v for k, v in item.items() if k != "_id"}
    if not can_see_cost(user):
        out.pop("avg_cost", None)
    return out

def require_inventory_manager(user):
    if normalize_role(user) not in INVENTORY_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Inventory managers only")

async def low_stock_alerts(user, limit: int = 50) -> List[dict]:
    """Low / out-of-stock raws from inventory_items (Fix 2 — the live single source
    of truth; no longer the frozen products.available_qty_grams), scoped to the
    caller's store(s) via store_filter. Same low/out rule as GET /inventory
    (reorder_level if set, else the 500g threshold). Cost is stripped for
    cashier/kitchen via _public_item. The 'available_qty_grams' alias is kept so
    existing UI keeps reading the field it expects."""
    items = await db.inventory_items.find(store_filter(user), {"_id": 0}).to_list(5000)
    rows = []
    for it in items:
        qty = float(it.get("qty_on_hand", 0) or 0)
        rl = float(it.get("reorder_level", 0) or 0)
        threshold = rl if rl > 0 else 500
        if qty > threshold:
            continue  # in stock — not an alert
        row = {
            "id": it.get("id"), "product_id": it.get("product_id"), "store_id": it.get("store_id"),
            "name": it.get("name"), "category": it.get("category"),
            "qty_on_hand": qty, "available_qty_grams": qty,  # legacy alias for existing UI
            "reorder_level": rl, "avg_cost": it.get("avg_cost", 0),
            "status": "low" if qty > 0 else "out_of_stock",
        }
        rows.append(_public_item(row, user))  # strips avg_cost for cashier/kitchen
    rows.sort(key=lambda r: r["qty_on_hand"])
    return rows[:limit]

async def log_movement(*, store_id, item_id, product_id, mtype, qty_delta, qty_after,
                       reason, user_id, ref_id=None, unit_cost_at_time=None):
    """The single append-only movement_log writer. Reused by every movement type
    (3A inward; 3B discard/transfer; 3C sale)."""
    entry = {
        "id": str(uuid.uuid4()),
        "store_id": store_id, "item_id": item_id, "product_id": product_id,
        "type": mtype, "qty_delta": qty_delta, "qty_after": qty_after,
        "reason": reason, "ref_id": ref_id, "unit_cost_at_time": unit_cost_at_time,
        "user_id": user_id, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.movement_log.insert_one(entry)
    return {k: v for k, v in entry.items() if k != "_id"}

class InventoryItemCreate(BaseModel):
    name: str
    unit: str = "g"
    category: Optional[str] = None
    product_id: Optional[str] = None   # null for pure raw (oil/spice)
    qty_on_hand: float = 0
    avg_cost: float = 0
    reorder_level: float = 0
    shelf_life_days: Optional[int] = None
    suppliers: Optional[List[str]] = []
    is_active: bool = True

class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    reorder_level: Optional[float] = None
    shelf_life_days: Optional[int] = None
    suppliers: Optional[List[str]] = None
    is_active: Optional[bool] = None
    # qty_on_hand / avg_cost are NOT edited here — use inward (or adjust in 3B).

class InwardRequest(BaseModel):
    item_id: Optional[str] = None
    product_id: Optional[str] = None
    qty: float
    purchase_price: float   # PER UNIT cost
    supplier: Optional[str] = None
    invoice_no: Optional[str] = None
    note: Optional[str] = None

@api_router.post("/inventory/{store_id}/items")
async def create_inventory_item(store_id: str, data: InventoryItemCreate, user=Depends(get_current_user)):
    """Create a raw inventory item for a store (managers; scope-checked)."""
    require_inventory_manager(user)
    assert_store_allowed(user, store_id)
    if data.unit not in INVENTORY_UNITS:
        raise HTTPException(status_code=400, detail=f"unit must be one of {sorted(INVENTORY_UNITS)}")
    if data.product_id:
        product = await db.products.find_one({"id": data.product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if product.get("product_type") == "ready_made":
            raise HTTPException(status_code=400, detail="Ready-made meals are recipes, not stocked items")
        dup = await db.inventory_items.find_one({"store_id": store_id, "product_id": data.product_id}, {"_id": 0})
        if dup:
            raise HTTPException(status_code=400, detail="Inventory item for this product already exists in this store")
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "id": str(uuid.uuid4()),
        "store_id": store_id,
        "product_id": data.product_id,
        "name": data.name,
        "unit": data.unit,
        "category": data.category,
        "qty_on_hand": float(data.qty_on_hand or 0),
        "avg_cost": float(data.avg_cost or 0),
        "reorder_level": float(data.reorder_level or 0),
        "shelf_life_days": data.shelf_life_days,
        "suppliers": data.suppliers or [],
        "is_active": data.is_active,
        "created_at": now,
        "updated_at": now,
    }
    await db.inventory_items.insert_one(item)
    return _public_item(item, user)

@api_router.put("/inventory/{store_id}/items/{item_id}")
async def update_inventory_item(store_id: str, item_id: str, data: InventoryItemUpdate, user=Depends(get_current_user)):
    """Update raw item metadata (managers; scope-checked). Qty/cost change only via inward."""
    require_inventory_manager(user)
    assert_store_allowed(user, store_id)
    item = await db.inventory_items.find_one({"id": item_id, "store_id": store_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if "unit" in updates and updates["unit"] not in INVENTORY_UNITS:
        raise HTTPException(status_code=400, detail="Invalid unit")
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.inventory_items.update_one({"id": item_id, "store_id": store_id}, {"$set": updates})
    item = await db.inventory_items.find_one({"id": item_id, "store_id": store_id}, {"_id": 0})
    return _public_item(item, user)

@api_router.get("/inventory/{store_id}/items")
async def list_inventory_items(store_id: str, user=Depends(get_current_user)):
    """List a store's raw items. Managers see cost; cashier/kitchen see qty only."""
    if not role_in(user, *STAFF_ROLES):
        raise HTTPException(status_code=403, detail="Staff only")
    assert_store_allowed(user, store_id)
    items = await db.inventory_items.find({"store_id": store_id}, {"_id": 0}).sort("name", 1).to_list(2000)
    return [_public_item(i, user) for i in items]

@api_router.post("/inventory/{store_id}/inward")
async def inventory_inward(store_id: str, data: InwardRequest, user=Depends(get_current_user)):
    """Stock inward / GRN. Weighted-average cost; appends a movement_log 'inward'."""
    require_inventory_manager(user)
    assert_store_allowed(user, store_id)
    if data.qty is None or data.qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")
    if data.purchase_price is None or data.purchase_price < 0:
        raise HTTPException(status_code=400, detail="purchase_price must be >= 0")
    query = {"store_id": store_id}
    if data.item_id:
        query["id"] = data.item_id
    elif data.product_id:
        query["product_id"] = data.product_id
    else:
        raise HTTPException(status_code=400, detail="item_id or product_id is required")
    item = await db.inventory_items.find_one(query, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found in this store")

    old_qty = float(item.get("qty_on_hand", 0) or 0)
    old_avg = float(item.get("avg_cost", 0) or 0)
    new_qty = old_qty + data.qty
    new_avg = ((old_qty * old_avg) + (data.qty * data.purchase_price)) / new_qty if new_qty > 0 else 0
    now = datetime.now(timezone.utc).isoformat()
    await db.inventory_items.update_one(
        {"id": item["id"], "store_id": store_id},
        {"$set": {"qty_on_hand": new_qty, "avg_cost": round(new_avg, 4),
                  "last_inward_at": now, "last_inward_by": user["id"], "updated_at": now}},
    )
    await log_movement(
        store_id=store_id, item_id=item["id"], product_id=item.get("product_id"),
        mtype="inward", qty_delta=data.qty, qty_after=new_qty,
        reason=data.note or f"GRN {data.invoice_no or ''}".strip() or "Stock inward",
        user_id=user["id"], ref_id=data.invoice_no, unit_cost_at_time=data.purchase_price,
    )
    updated = await db.inventory_items.find_one({"id": item["id"], "store_id": store_id}, {"_id": 0})
    return _public_item(updated, user)

@api_router.get("/inventory/{store_id}/movements")
async def list_movement_log(store_id: str, user=Depends(get_current_user)):
    """Read-only movement log for a store (managers; scope-checked)."""
    require_inventory_manager(user)
    assert_store_allowed(user, store_id)
    logs = await db.movement_log.find({"store_id": store_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    if not can_see_cost(user):  # defensive; managers only reach here anyway
        for l in logs:
            l.pop("unit_cost_at_time", None)
    return logs

@api_router.get("/inventory/{store_id}/valuation")
async def inventory_valuation(store_id: str, user=Depends(get_current_user)):
    """Stock valuation (qty * avg_cost) per item + store total. Cost-restricted."""
    require_inventory_manager(user)  # cashier/kitchen -> 403
    assert_store_allowed(user, store_id)
    items = await db.inventory_items.find({"store_id": store_id}, {"_id": 0}).to_list(2000)
    rows = []
    total = 0.0
    for i in items:
        val = round(float(i.get("qty_on_hand", 0) or 0) * float(i.get("avg_cost", 0) or 0), 2)
        total += val
        rows.append({"item_id": i["id"], "name": i["name"], "qty_on_hand": i.get("qty_on_hand", 0),
                     "avg_cost": i.get("avg_cost", 0), "value": val})
    return {"store_id": store_id, "items": rows, "total_valuation": round(total, 2)}

@api_router.get("/inventory/{store_id}/low-stock")
async def inventory_low_stock(store_id: str, user=Depends(get_current_user)):
    """Items at or below reorder level (staff; cost stripped for cashier/kitchen)."""
    if not role_in(user, *STAFF_ROLES):
        raise HTTPException(status_code=403, detail="Staff only")
    assert_store_allowed(user, store_id)
    items = await db.inventory_items.find({"store_id": store_id}, {"_id": 0}).to_list(2000)
    low = [i for i in items if float(i.get("qty_on_hand", 0) or 0) <= float(i.get("reorder_level", 0) or 0)]
    return [_public_item(i, user) for i in low]

async def run_inventory_migration():
    """Idempotent: for each active store x active SINGLE product, seed an
    inventory_items row (qty from available_qty_grams, unit 'g', avg_cost 0).
    Ready-made products are recipes and get NO stock row. Does not alter
    product.available_qty_grams."""
    stores = await db.stores.find({"status": {"$ne": "inactive"}}, {"_id": 0, "store_id": 1}).to_list(1000)
    products = await db.products.find(
        {"$or": [{"product_type": {"$ne": "ready_made"}}, {"product_type": {"$exists": False}}]},
        {"_id": 0, "id": 1, "name": 1, "category": 1, "available_qty_grams": 1, "is_active": 1},
    ).to_list(5000)
    created = 0
    for s in stores:
        sid = s["store_id"]
        for p in products:
            if not p.get("is_active", True):
                continue
            exists = await db.inventory_items.find_one({"store_id": sid, "product_id": p["id"]}, {"_id": 0})
            if exists:
                continue
            now = datetime.now(timezone.utc).isoformat()
            await db.inventory_items.insert_one({
                "id": str(uuid.uuid4()), "store_id": sid, "product_id": p["id"],
                "name": p.get("name", ""), "unit": "g", "category": p.get("category"),
                "qty_on_hand": float(p.get("available_qty_grams", 0) or 0), "avg_cost": 0.0,
                "reorder_level": 0.0, "shelf_life_days": None, "suppliers": [],
                "is_active": True, "created_at": now, "updated_at": now,
            })
            created += 1
    logger.info(f"[migration] inventory seed complete (+{created} items)")
    return created

@api_router.post("/admin/migrate-inventory")
async def admin_migrate_inventory(user=Depends(get_current_user)):
    """HQ: (re-)run the raw-inventory seed migration (idempotent)."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    created = await run_inventory_migration()
    return {"message": "Inventory migration complete", "created": created}

# ==========================================================================
# PHASE 3B — Discard (meal-explode + raw-direct), store-to-store transfer,
# manual adjust. Reuses 3A inventory_items + log_movement. Sale path untouched.
# ==========================================================================
HQ_VALUE_THRESHOLD = 2000.0  # >= needs HQ/area escalation

async def explode_to_raw(target_type: str, ref_id: str, qty: float, store_id: str):
    """Expand a target into the raw inventory_items it consumes from THIS store.

    Returns [{item, grams, unit_cost}]. Shared by discard (3B) and sale (3C).
    - target_type 'meal': ready_made product.ingredients[] -> each raw via
      ingredient.raw_item_id OR ingredient.product_id; grams = grams_per_serving*qty.
    - target_type 'raw': a single raw item -> [{that item, qty}].
    Missing raw rows are skipped gracefully (never crash, never block)."""
    out = []
    if target_type == "meal":
        product = await db.products.find_one({"id": ref_id}, {"_id": 0})
        if not product:
            return out
        for ing in product.get("ingredients", []):
            item = None
            if ing.get("raw_item_id"):
                item = await db.inventory_items.find_one({"store_id": store_id, "id": ing["raw_item_id"]}, {"_id": 0})
            if not item and ing.get("product_id"):
                item = await db.inventory_items.find_one({"store_id": store_id, "product_id": ing["product_id"]}, {"_id": 0})
            if not item:
                continue  # graceful skip — tracking not set up for this raw
            grams = float(ing.get("grams_per_serving", 0) or 0) * qty
            out.append({"item": item, "grams": grams, "unit_cost": float(item.get("avg_cost", 0) or 0)})
    else:  # raw
        item = await db.inventory_items.find_one({"store_id": store_id, "id": ref_id}, {"_id": 0})
        if not item:
            item = await db.inventory_items.find_one({"store_id": store_id, "product_id": ref_id}, {"_id": 0})
        if item:
            out.append({"item": item, "grams": float(qty), "unit_cost": float(item.get("avg_cost", 0) or 0)})
    return out

def _explode_value(exploded: list) -> float:
    return round(sum(e["grams"] * e["unit_cost"] for e in exploded), 2)

async def _apply_stock_deltas(exploded: list, store_id: str, mtype: str, reason: str, user_id: str, ref_id: str):
    """Deduct each exploded raw from stock and append one movement per raw."""
    for e in exploded:
        item = e["item"]
        new_qty = float(item.get("qty_on_hand", 0) or 0) - e["grams"]
        await db.inventory_items.update_one(
            {"id": item["id"], "store_id": store_id},
            {"$set": {"qty_on_hand": new_qty, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        await log_movement(store_id=store_id, item_id=item["id"], product_id=item.get("product_id"),
                           mtype=mtype, qty_delta=-e["grams"], qty_after=new_qty, reason=reason,
                           user_id=user_id, ref_id=ref_id, unit_cost_at_time=e["unit_cost"])

# ---------- Discards ----------
class DiscardCreate(BaseModel):
    store_id: str
    target_type: str            # "meal" | "raw"
    product_id: Optional[str] = None   # for meal
    item_id: Optional[str] = None      # for raw
    qty: float
    reason: str
    photo_url: Optional[str] = None

class DecisionRequest(BaseModel):
    action: str                 # "approve" | "reject"
    note: Optional[str] = None

@api_router.post("/discards")
async def raise_discard(data: DiscardCreate, user=Depends(get_current_user)):
    """Raise a discard (store_manager or kitchen, own store). Stock NOT deducted;
    value computed now; routed to area (and HQ if value >= threshold)."""
    if normalize_role(user) not in ("store_manager", "kitchen"):
        raise HTTPException(status_code=403, detail="Only store managers or kitchen may raise discards")
    assert_store_allowed(user, data.store_id)
    if data.target_type not in ("meal", "raw"):
        raise HTTPException(status_code=400, detail="target_type must be 'meal' or 'raw'")
    if data.qty is None or data.qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")
    ref = data.product_id if data.target_type == "meal" else data.item_id
    if not ref:
        raise HTTPException(status_code=400, detail="product_id (meal) or item_id (raw) is required")
    exploded = await explode_to_raw(data.target_type, ref, data.qty, data.store_id)
    value = _explode_value(exploded)
    now = datetime.now(timezone.utc).isoformat()
    discard = {
        "id": str(uuid.uuid4()),
        "store_id": data.store_id,
        "target_type": data.target_type,
        "product_id": data.product_id,
        "item_id": data.item_id,
        "qty": data.qty,
        "reason": data.reason,
        "photo_url": data.photo_url,
        "value": value,
        "status": "pending",
        "hq_required": value >= HQ_VALUE_THRESHOLD,
        "raised_by": user["id"],
        "raised_at": now,
        "approved_by": None,
        "decided_at": None,
        "hq_approved_by": None,
        "hq_decided_at": None,
    }
    await db.discards.insert_one(discard)
    return {k: v for k, v in discard.items() if k != "_id"}

@api_router.get("/discards/{store_id}")
async def list_discards(store_id: str, user=Depends(get_current_user)):
    """List discards for a store (managers; scope-checked)."""
    require_inventory_manager(user)
    assert_store_allowed(user, store_id)
    return await db.discards.find({"store_id": store_id}, {"_id": 0}).sort("raised_at", -1).to_list(1000)

@api_router.put("/discards/{discard_id}/decide")
async def decide_discard(discard_id: str, data: DecisionRequest, user=Depends(get_current_user)):
    """Approve/reject a discard. area_manager (own cluster) decides; high-value
    (>= threshold) needs super_admin to finalize after area approval. The raiser
    can never self-approve. On final approve, recipe/raw is exploded & deducted."""
    role = normalize_role(user)
    if role not in ("area_manager", "super_admin"):
        raise HTTPException(status_code=403, detail="Only area managers or HQ may decide discards")
    discard = await db.discards.find_one({"id": discard_id}, {"_id": 0})
    if not discard:
        raise HTTPException(status_code=404, detail="Discard not found")
    if discard["status"] in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Discard already decided")
    assert_store_allowed(user, discard["store_id"])
    if user["id"] == discard.get("raised_by"):
        raise HTTPException(status_code=403, detail="Raiser cannot decide their own discard")
    now = datetime.now(timezone.utc).isoformat()

    if data.action == "reject":
        await db.discards.update_one({"id": discard_id}, {"$set": {
            "status": "rejected", "approved_by": user["id"], "decided_at": now, "decision_note": data.note}})
        return await db.discards.find_one({"id": discard_id}, {"_id": 0})
    if data.action != "approve":
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    # High-value: area approval only escalates to pending_hq; HQ finalizes.
    if discard.get("hq_required"):
        if role == "area_manager":
            if discard["status"] != "pending":
                raise HTTPException(status_code=400, detail="Awaiting HQ approval")
            await db.discards.update_one({"id": discard_id}, {"$set": {
                "status": "pending_hq", "approved_by": user["id"], "decided_at": now}})
            return await db.discards.find_one({"id": discard_id}, {"_id": 0})
        # super_admin finalizes (from pending or pending_hq)

    # Finalize: explode & deduct
    ref = discard.get("product_id") if discard["target_type"] == "meal" else discard.get("item_id")
    exploded = await explode_to_raw(discard["target_type"], ref, discard["qty"], discard["store_id"])
    await _apply_stock_deltas(exploded, discard["store_id"], "discard",
                              f"discard:{discard['reason']} (raised_by {discard['raised_by']})",
                              user["id"], discard["id"])
    finalize = {"status": "approved", "decided_at": now}
    if discard.get("hq_required") and role == "super_admin":
        finalize["hq_approved_by"] = user["id"]
        finalize["hq_decided_at"] = now
        if not discard.get("approved_by"):
            finalize["approved_by"] = user["id"]
    else:
        finalize["approved_by"] = user["id"]
    await db.discards.update_one({"id": discard_id}, {"$set": finalize})
    return await db.discards.find_one({"id": discard_id}, {"_id": 0})

# ---------- Store-to-store transfer (raw only) ----------
class TransferCreate(BaseModel):
    from_store_id: str
    to_store_id: str
    item_id: Optional[str] = None
    product_id: Optional[str] = None
    qty: float

@api_router.post("/transfers")
async def request_transfer(data: TransferCreate, user=Depends(get_current_user)):
    """Request a raw transfer (store_manager of the SOURCE store, or HQ)."""
    role = normalize_role(user)
    if role not in ("store_manager", "super_admin"):
        raise HTTPException(status_code=403, detail="Only the source store manager or HQ may request transfers")
    assert_store_allowed(user, data.from_store_id)
    if data.from_store_id == data.to_store_id:
        raise HTTPException(status_code=400, detail="from and to stores must differ")
    if data.qty is None or data.qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")
    query = {"store_id": data.from_store_id}
    if data.item_id:
        query["id"] = data.item_id
    elif data.product_id:
        query["product_id"] = data.product_id
    else:
        raise HTTPException(status_code=400, detail="item_id or product_id is required")
    src = await db.inventory_items.find_one(query, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Source inventory item not found")
    now = datetime.now(timezone.utc).isoformat()
    transfer = {
        "id": str(uuid.uuid4()),
        "from_store_id": data.from_store_id,
        "to_store_id": data.to_store_id,
        "item_id": src["id"],
        "product_id": src.get("product_id"),
        "qty": data.qty,
        "status": "requested",
        "requested_by": user["id"],
        "requested_at": now,
        "approved_by": None,
        "decided_at": None,
    }
    await db.transfers.insert_one(transfer)
    return {k: v for k, v in transfer.items() if k != "_id"}

@api_router.put("/transfers/{transfer_id}/decide")
async def decide_transfer(transfer_id: str, data: DecisionRequest, user=Depends(get_current_user)):
    """Approve/reject a transfer. Same-cluster -> area_manager (cluster covers
    BOTH stores); cross-cluster -> super_admin only. On approve: source down,
    dest up, dest avg_cost re-weighted; both legs logged."""
    role = normalize_role(user)
    if role not in ("area_manager", "super_admin"):
        raise HTTPException(status_code=403, detail="Only area managers or HQ may decide transfers")
    t = await db.transfers.find_one({"id": transfer_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if t["status"] in ("approved", "rejected", "completed"):
        raise HTTPException(status_code=400, detail="Transfer already decided")
    # Cross-cluster check: area_manager must own BOTH stores; else HQ-only.
    if role == "area_manager":
        scope = set(staff_store_scope(user) or [])
        if not ({t["from_store_id"], t["to_store_id"]} <= scope):
            raise HTTPException(status_code=403, detail="Cross-cluster transfer requires HQ")
    now = datetime.now(timezone.utc).isoformat()
    if data.action == "reject":
        await db.transfers.update_one({"id": transfer_id}, {"$set": {
            "status": "rejected", "approved_by": user["id"], "decided_at": now}})
        return await db.transfers.find_one({"id": transfer_id}, {"_id": 0})
    if data.action != "approve":
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    src = await db.inventory_items.find_one({"id": t["item_id"], "store_id": t["from_store_id"]}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Source item no longer exists")
    qty = t["qty"]
    src_avg = float(src.get("avg_cost", 0) or 0)
    # Source leg
    src_new = float(src.get("qty_on_hand", 0) or 0) - qty
    await db.inventory_items.update_one({"id": src["id"], "store_id": t["from_store_id"]},
                                        {"$set": {"qty_on_hand": src_new, "updated_at": now}})
    await log_movement(store_id=t["from_store_id"], item_id=src["id"], product_id=src.get("product_id"),
                       mtype="transfer_out", qty_delta=-qty, qty_after=src_new,
                       reason=f"transfer to {t['to_store_id']}", user_id=user["id"], ref_id=t["id"],
                       unit_cost_at_time=src_avg)
    # Destination leg (find or create the dest raw row)
    dest = None
    if src.get("product_id"):
        dest = await db.inventory_items.find_one({"store_id": t["to_store_id"], "product_id": src["product_id"]}, {"_id": 0})
    if not dest:
        dest = await db.inventory_items.find_one({"store_id": t["to_store_id"], "name": src["name"]}, {"_id": 0})
    if not dest:
        dest = {
            "id": str(uuid.uuid4()), "store_id": t["to_store_id"], "product_id": src.get("product_id"),
            "name": src["name"], "unit": src.get("unit", "g"), "category": src.get("category"),
            "qty_on_hand": 0.0, "avg_cost": 0.0, "reorder_level": 0.0, "shelf_life_days": None,
            "suppliers": [], "is_active": True,
            "created_at": now, "updated_at": now,
        }
        await db.inventory_items.insert_one(dict(dest))
    dest_old_qty = float(dest.get("qty_on_hand", 0) or 0)
    dest_old_avg = float(dest.get("avg_cost", 0) or 0)
    dest_new_qty = dest_old_qty + qty
    dest_new_avg = ((dest_old_qty * dest_old_avg) + (qty * src_avg)) / dest_new_qty if dest_new_qty > 0 else 0
    await db.inventory_items.update_one({"id": dest["id"], "store_id": t["to_store_id"]},
                                        {"$set": {"qty_on_hand": dest_new_qty, "avg_cost": round(dest_new_avg, 4), "updated_at": now}})
    await log_movement(store_id=t["to_store_id"], item_id=dest["id"], product_id=dest.get("product_id"),
                       mtype="transfer_in", qty_delta=qty, qty_after=dest_new_qty,
                       reason=f"transfer from {t['from_store_id']}", user_id=user["id"], ref_id=t["id"],
                       unit_cost_at_time=src_avg)
    await db.transfers.update_one({"id": transfer_id}, {"$set": {
        "status": "completed", "approved_by": user["id"], "decided_at": now}})
    return await db.transfers.find_one({"id": transfer_id}, {"_id": 0})

# list endpoint — added for UI rendering 2026-06-10
@api_router.get("/transfers")
async def list_transfers(store_id: Optional[str] = None, status: Optional[str] = None,
                         user=Depends(get_current_user)):
    """Read-only list of transfers, scoped like POST /transfers + decide. Managers
    only (cashier/kitchen -> 403); store_manager sees transfers touching their store
    (from OR to), area_manager their cluster, super_admin all. Newest-first."""
    if normalize_role(user) not in INVENTORY_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Inventory managers only")
    q = {}
    if store_id:
        assert_store_allowed(user, store_id)
        q["$or"] = [{"from_store_id": store_id}, {"to_store_id": store_id}]
    else:
        scope = staff_store_scope(user)  # None => all stores (HQ)
        if scope is not None:
            q["$or"] = [{"from_store_id": {"$in": scope}}, {"to_store_id": {"$in": scope}}]
    if status:
        q["status"] = status
    return await db.transfers.find(q, {"_id": 0}).sort("requested_at", -1).to_list(1000)

# ---------- Manual adjustment ----------
class AdjustRequest(BaseModel):
    item_id: Optional[str] = None
    product_id: Optional[str] = None
    new_qty: float
    reason: str

@api_router.put("/inventory/{store_id}/adjust")
async def adjust_inventory(store_id: str, data: AdjustRequest, user=Depends(get_current_user)):
    """Manual stock correction (reason REQUIRED). Small variance (< threshold):
    store_manager/area/HQ apply directly and the entry is flagged for review.
    Large variance (>= threshold): only area_manager/HQ may apply."""
    require_inventory_manager(user)
    assert_store_allowed(user, store_id)
    if not (data.reason and data.reason.strip()):
        raise HTTPException(status_code=400, detail="reason is required for an adjustment")
    query = {"store_id": store_id}
    if data.item_id:
        query["id"] = data.item_id
    elif data.product_id:
        query["product_id"] = data.product_id
    else:
        raise HTTPException(status_code=400, detail="item_id or product_id is required")
    item = await db.inventory_items.find_one(query, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    old_qty = float(item.get("qty_on_hand", 0) or 0)
    variance = float(data.new_qty) - old_qty
    variance_value = abs(variance) * float(item.get("avg_cost", 0) or 0)
    large = variance_value >= HQ_VALUE_THRESHOLD
    if large and normalize_role(user) == "store_manager":
        raise HTTPException(status_code=403, detail="Large adjustment requires area manager approval")
    now = datetime.now(timezone.utc).isoformat()
    await db.inventory_items.update_one({"id": item["id"], "store_id": store_id},
                                        {"$set": {"qty_on_hand": float(data.new_qty), "updated_at": now}})
    mv = await log_movement(store_id=store_id, item_id=item["id"], product_id=item.get("product_id"),
                            mtype="adjust", qty_delta=variance, qty_after=float(data.new_qty),
                            reason=f"adjust:{data.reason}", user_id=user["id"],
                            unit_cost_at_time=float(item.get("avg_cost", 0) or 0))
    # Flag small (directly-applied) adjustments for area/HQ review.
    await db.movement_log.update_one({"id": mv["id"]}, {"$set": {"flagged_for_review": (not large)}})
    updated = await db.inventory_items.find_one({"id": item["id"], "store_id": store_id}, {"_id": 0})
    return {"item": _public_item(updated, user), "variance": round(variance, 4),
            "variance_value": round(variance_value, 2), "flagged_for_review": (not large)}

# ==========================================================================
# PHASE 3C — Auto-decrement on sale via recipe + availability-from-raw +
# physical count + reorder. Reuses 3A inventory_items/log_movement and 3B
# explode_to_raw. This is the ONLY block that touches the live order path.
# ==========================================================================
async def raw_meal_available(store_id: str, product_id: str, units: float) -> bool:
    """Can `units` of a ready_made meal be made from THIS store's raw stock?
    Graceful: ingredients with no tracked raw row don't block the sale."""
    exploded = await explode_to_raw("meal", product_id, units, store_id)
    for e in exploded:
        if float(e["item"].get("qty_on_hand", 0) or 0) < e["grams"]:
            return False
    return True

async def raw_single_available(store_id: str, product_id: str, grams: float) -> bool:
    """Loose/single availability from THIS store's raw stock. Untracked = allowed."""
    item = await db.inventory_items.find_one({"store_id": store_id, "product_id": product_id}, {"_id": 0})
    if not item:
        return True  # graceful: tracking not set up -> don't block
    return float(item.get("qty_on_hand", 0) or 0) >= grams

async def decrement_stock_for_order(order: dict, user_id: str):
    """Decrement raw inventory for a placed order, scoped to order.store_id, via
    explode_to_raw. Idempotent per order_id; graceful when a raw row is missing."""
    oid = order["id"]
    sid = order.get("store_id") or DEFAULT_STORE_ID
    # Idempotency: never decrement the same order twice (dup/reorder safe)
    if await db.movement_log.count_documents({"ref_id": oid, "type": "sale"}) > 0:
        return
    for it in order.get("items", []):
        pid = it.get("product_id")
        if not pid:
            continue
        if it.get("product_type") == "ready_made":
            units = int(it.get("quantity", 1) or 1)
            exploded = await explode_to_raw("meal", pid, units, sid)
        else:
            grams = float(it.get("grams", 0) or 0)
            exploded = await explode_to_raw("raw", pid, grams, sid)
        if exploded:
            await _apply_stock_deltas(exploded, sid, "sale", f"sale:{oid}", user_id, oid)

# ---------- Physical count / reconciliation ----------
class CountLine(BaseModel):
    item_id: Optional[str] = None
    product_id: Optional[str] = None
    counted_qty: float

class CountRequest(BaseModel):
    counts: List[CountLine]

@api_router.post("/inventory/{store_id}/count")
async def physical_count(store_id: str, data: CountRequest, user=Depends(get_current_user)):
    """Reconcile counted vs system qty per raw -> adjustment (movement 'adjust',
    reason 'physical_count'); large variance (>= threshold) flagged for area/HQ."""
    require_inventory_manager(user)
    assert_store_allowed(user, store_id)
    now = datetime.now(timezone.utc).isoformat()
    results = []
    for line in data.counts:
        q = {"store_id": store_id}
        if line.item_id:
            q["id"] = line.item_id
        elif line.product_id:
            q["product_id"] = line.product_id
        else:
            continue
        item = await db.inventory_items.find_one(q, {"_id": 0})
        if not item:
            results.append({"item_id": line.item_id, "product_id": line.product_id, "status": "not_found"})
            continue
        system_qty = float(item.get("qty_on_hand", 0) or 0)
        variance = float(line.counted_qty) - system_qty
        variance_value = abs(variance) * float(item.get("avg_cost", 0) or 0)
        flagged = variance_value >= HQ_VALUE_THRESHOLD
        await db.inventory_items.update_one({"id": item["id"], "store_id": store_id},
                                            {"$set": {"qty_on_hand": float(line.counted_qty), "updated_at": now}})
        mv = await log_movement(store_id=store_id, item_id=item["id"], product_id=item.get("product_id"),
                                mtype="adjust", qty_delta=variance, qty_after=float(line.counted_qty),
                                reason="physical_count", user_id=user["id"],
                                unit_cost_at_time=float(item.get("avg_cost", 0) or 0))
        await db.movement_log.update_one({"id": mv["id"]}, {"$set": {"flagged_for_review": flagged, "source": "physical_count"}})
        results.append({"item_id": item["id"], "variance": round(variance, 4),
                        "variance_value": round(variance_value, 2), "flagged_for_review": flagged})
    return {"store_id": store_id, "results": results}

@api_router.get("/inventory/{store_id}/reorder")
async def inventory_reorder(store_id: str, user=Depends(get_current_user)):
    """Raws at/below reorder level with a simple par-stock suggested qty.
    Cost-restricted (cashier/kitchen 403)."""
    require_inventory_manager(user)
    assert_store_allowed(user, store_id)
    items = await db.inventory_items.find({"store_id": store_id}, {"_id": 0}).to_list(2000)
    rows = []
    for i in items:
        qty = float(i.get("qty_on_hand", 0) or 0)
        rl = float(i.get("reorder_level", 0) or 0)
        if rl > 0 and qty <= rl:
            rows.append({
                "item_id": i["id"], "name": i["name"], "unit": i.get("unit", "g"),
                "qty_on_hand": qty, "reorder_level": rl,
                "suggested_qty": round(max(rl * 2 - qty, 0), 2),  # par-stock to 2x reorder
                "avg_cost": i.get("avg_cost", 0),
            })
    return {"store_id": store_id, "items": rows}

# ==========================================================================
# PHASE 4A — Costing + P&L + report endpoints (READ-ONLY analytics)
# COGS comes from movement_log 'sale' (unit_cost_at_time), falling back to a
# live explode_to_raw at current avg_cost. Cost is HQ/area/store-manager only;
# never cashier/kitchen, never cross-scope. Consolidated is super_admin only.
# ==========================================================================
def _created_range(date_from: Optional[str], date_to: Optional[str]) -> dict:
    rng = {}
    if date_from:
        rng["$gte"] = date_from
    if date_to:
        rng["$lte"] = date_to + "T23:59:59.999999+00:00"
    return rng

async def _report_targets(user, store_ids_param: Optional[str]):
    """Resolve + authorize the store set for a report. cashier/kitchen -> 403."""
    if not role_in(user, "super_admin", "area_manager", "store_manager"):
        raise HTTPException(status_code=403, detail="Reports access denied")
    requested, scope = _resolve_report_store_ids(user, store_ids_param)
    if requested is not None:
        return requested
    if scope is None:
        rows = await db.stores.find({}, {"_id": 0, "store_id": 1}).to_list(1000)
        return [s["store_id"] for s in rows]
    return list(scope)

def order_revenue(o: dict) -> float:
    return float(o.get("item_subtotal") if o.get("item_subtotal") is not None else o.get("total_price", 0) or 0)

def order_discount(o: dict) -> float:
    return float(o.get("discount", 0) or 0)

async def order_cogs(order: dict) -> float:
    """COGS for an order. Authoritative = sum of movement_log 'sale' (abs
    qty_delta * unit_cost_at_time) for ref_id == order id. Fallback (untracked)
    = explode each line at current avg_cost."""
    oid = order["id"]
    rows = await db.movement_log.find({"ref_id": oid, "type": "sale"}, {"_id": 0}).to_list(5000)
    if rows:
        return round(sum(abs(r.get("qty_delta", 0) or 0) * float(r.get("unit_cost_at_time", 0) or 0) for r in rows), 2)
    sid = order.get("store_id") or DEFAULT_STORE_ID
    total = 0.0
    for it in order.get("items", []):
        pid = it.get("product_id")
        if not pid:
            continue
        if it.get("product_type") == "ready_made":
            exploded = await explode_to_raw("meal", pid, int(it.get("quantity", 1) or 1), sid)
        else:
            exploded = await explode_to_raw("raw", pid, float(it.get("grams", 0) or 0), sid)
        total += sum(e["grams"] * e["unit_cost"] for e in exploded)
    return round(total, 2)

def order_profit(order: dict, cogs: float) -> float:
    return round(order_revenue(order) - order_discount(order) - cogs, 2)

def _blank_bucket():
    return {"revenue": 0.0, "discounts": 0.0, "cogs": 0.0, "order_count": 0, "wastage": 0.0}

def _finalize_bucket(b: dict) -> dict:
    revenue = round(b["revenue"], 2)
    discounts = round(b["discounts"], 2)
    cogs = round(b["cogs"], 2)
    gross_profit = round(revenue - discounts - cogs, 2)
    wastage = round(b.get("wastage", 0.0), 2)
    return {
        "revenue": revenue, "discounts": discounts, "cogs": cogs,
        "gross_profit": gross_profit,
        "margin_pct": round(gross_profit / revenue * 100, 2) if revenue else 0,
        "order_count": b["order_count"],
        "avg_order_value": round(revenue / b["order_count"], 2) if b["order_count"] else 0,
        "wastage": wastage,
        "net_contribution": round(gross_profit - wastage, 2),
    }

async def _compute_pnl(target_ids, date_from, date_to, granularity="total"):
    """Per-store P&L (optionally monthly). Returns {store_id: {...store totals,
    'store_name', optional 'months': [...]}}."""
    name_rows = await db.stores.find({"store_id": {"$in": target_ids}}, {"_id": 0, "store_id": 1, "name": 1}).to_list(1000)
    name_by_id = {s["store_id"]: s.get("name") for s in name_rows}

    omatch = {"store_id": {"$in": target_ids}, "status": {"$ne": "cancelled"}}
    rng = _created_range(date_from, date_to)
    if rng:
        omatch["created_at"] = rng
    orders = await db.orders.find(omatch, {"_id": 0}).to_list(100000)

    # Authoritative COGS from movement_log 'sale'
    oids = [o["id"] for o in orders]
    cogs_by_oid = {}
    if oids:
        sale_rows = await db.movement_log.find({"type": "sale", "ref_id": {"$in": oids}}, {"_id": 0}).to_list(200000)
        for r in sale_rows:
            cogs_by_oid[r["ref_id"]] = cogs_by_oid.get(r["ref_id"], 0.0) + abs(r.get("qty_delta", 0) or 0) * float(r.get("unit_cost_at_time", 0) or 0)

    # Approved-discard wastage in range (by decided_at)
    dmatch = {"store_id": {"$in": target_ids}, "status": "approved"}
    drng = _created_range(date_from, date_to)
    if drng:
        dmatch["decided_at"] = drng
    discards = await db.discards.find(dmatch, {"_id": 0}).to_list(100000)

    per_store = {sid: {"total": _blank_bucket(), "months": {}} for sid in target_ids}
    for o in orders:
        sid = o.get("store_id")
        if sid not in per_store:
            continue
        cogs = cogs_by_oid.get(o["id"])
        if cogs is None:
            cogs = await order_cogs(o)  # fallback
        rev = order_revenue(o)
        disc = order_discount(o)
        for tgt in (per_store[sid]["total"], per_store[sid]["months"].setdefault((o.get("created_at") or "")[:7], _blank_bucket())):
            tgt["revenue"] += rev
            tgt["discounts"] += disc
            tgt["cogs"] += cogs
            tgt["order_count"] += 1
    for d in discards:
        sid = d.get("store_id")
        if sid not in per_store:
            continue
        per_store[sid]["total"]["wastage"] += float(d.get("value", 0) or 0)
        per_store[sid]["months"].setdefault((d.get("decided_at") or "")[:7], _blank_bucket())["wastage"] += float(d.get("value", 0) or 0)

    out = {}
    for sid in target_ids:
        store_obj = {"store_id": sid, "store_name": name_by_id.get(sid, sid), **_finalize_bucket(per_store[sid]["total"])}
        if granularity == "monthly":
            store_obj["months"] = [
                {"month": m, **_finalize_bucket(b)} for m, b in sorted(per_store[sid]["months"].items())
            ]
        out[sid] = store_obj
    return out

@api_router.get("/reports/pnl")
async def reports_pnl(
    user=Depends(get_current_user),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    store_ids: Optional[str] = None,
    granularity: str = "total",
):
    """Per-store P&L: revenue, discounts, COGS, gross_profit, margin%, wastage,
    net_contribution (= gross_profit - wastage). granularity 'monthly' buckets by
    calendar month. Scope-guarded; cashier/kitchen 403."""
    target_ids = await _report_targets(user, store_ids)
    pnl = await _compute_pnl(target_ids, date_from, date_to, "monthly" if granularity == "monthly" else "total")
    return [pnl[sid] for sid in target_ids]

@api_router.get("/reports/pnl/consolidated")
async def reports_pnl_consolidated(
    user=Depends(get_current_user),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
):
    """Company-wide P&L + per-store rollup. super_admin ONLY."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="Consolidated P&L is HQ only")
    rows = await db.stores.find({}, {"_id": 0, "store_id": 1}).to_list(1000)
    target_ids = [s["store_id"] for s in rows]
    pnl = await _compute_pnl(target_ids, date_from, date_to, "total")
    stores = [pnl[sid] for sid in target_ids]
    company = {"revenue": 0.0, "discounts": 0.0, "cogs": 0.0, "wastage": 0.0, "order_count": 0}
    for s in stores:
        company["revenue"] += s["revenue"]; company["discounts"] += s["discounts"]
        company["cogs"] += s["cogs"]; company["wastage"] += s["wastage"]; company["order_count"] += s["order_count"]
    gp = company["revenue"] - company["discounts"] - company["cogs"]
    company["gross_profit"] = round(gp, 2)
    company["margin_pct"] = round(gp / company["revenue"] * 100, 2) if company["revenue"] else 0
    company["net_contribution"] = round(gp - company["wastage"], 2)
    for k in ("revenue", "discounts", "cogs", "wastage"):
        company[k] = round(company[k], 2)
    return {"company": company, "stores": stores}

@api_router.get("/reports/ranking")
async def reports_ranking(
    user=Depends(get_current_user),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    store_ids: Optional[str] = None,
):
    """Store-vs-store ranking by gross_profit and by revenue. super_admin/area
    only (store_manager has a single store -> 403)."""
    if normalize_role(user) == "store_manager":
        raise HTTPException(status_code=403, detail="Ranking needs multiple stores")
    target_ids = await _report_targets(user, store_ids)
    pnl = await _compute_pnl(target_ids, date_from, date_to, "total")
    stores = [pnl[sid] for sid in target_ids]
    by_profit = sorted(stores, key=lambda s: s["gross_profit"], reverse=True)
    by_revenue = sorted(stores, key=lambda s: s["revenue"], reverse=True)
    return {
        "by_gross_profit": by_profit,
        "by_revenue": by_revenue,
        "top_by_profit": by_profit[0] if by_profit else None,
        "bottom_by_profit": by_profit[-1] if by_profit else None,
    }

@api_router.get("/reports/items")
async def reports_items(
    user=Depends(get_current_user),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    store_ids: Optional[str] = None,
):
    """Item-wise qty + revenue + COGS + profit, plus top sellers per category.
    COGS per sold product via explode_to_raw at current avg_cost. Scope-guarded."""
    target_ids = await _report_targets(user, store_ids)
    omatch = {"store_id": {"$in": target_ids}, "status": {"$ne": "cancelled"}}
    rng = _created_range(date_from, date_to)
    if rng:
        omatch["created_at"] = rng
    orders = await db.orders.find(omatch, {"_id": 0}).to_list(100000)

    prods = await db.products.find({}, {"_id": 0, "id": 1, "category": 1}).to_list(5000)
    cat_by_id = {p["id"]: p.get("category") for p in prods}

    agg = {}  # product_id -> {name, qty, revenue, cogs}
    cogs_cache = {}  # (store_id, product_id, type, unit) per-unit cost cache
    for o in orders:
        sid = o.get("store_id")
        for it in o.get("items", []):
            pid = it.get("product_id")
            if not pid:
                continue
            row = agg.setdefault(pid, {"product_id": pid, "name": it.get("product_name"), "qty": 0.0, "revenue": 0.0, "cogs": 0.0, "category": cat_by_id.get(pid)})
            is_meal = it.get("product_type") == "ready_made"
            units = int(it.get("quantity", 1) or 1) if is_meal else 1
            qty = units if is_meal else float(it.get("grams", 0) or 0)
            row["qty"] += qty
            row["revenue"] += float(it.get("price", 0) or 0)
            # per-unit COGS for this product at this store (cache to avoid repeat explode)
            key = (sid, pid, is_meal)
            if key not in cogs_cache:
                exploded = await explode_to_raw("meal" if is_meal else "raw", pid, 1 if is_meal else 1, sid)
                cogs_cache[key] = sum(e["grams"] * e["unit_cost"] for e in exploded)  # cost per unit (meal) or per gram (raw)
            row["cogs"] += cogs_cache[key] * (units if is_meal else float(it.get("grams", 0) or 0))

    items = []
    for r in agg.values():
        r["qty"] = round(r["qty"], 2); r["revenue"] = round(r["revenue"], 2)
        r["cogs"] = round(r["cogs"], 2); r["profit"] = round(r["revenue"] - r["cogs"], 2)
        items.append(r)
    items.sort(key=lambda x: x["revenue"], reverse=True)
    top_by_category = {}
    for r in items:
        cat = r.get("category") or "Uncategorized"
        top_by_category.setdefault(cat, [])
        if len(top_by_category[cat]) < 5:
            top_by_category[cat].append({"product_id": r["product_id"], "name": r["name"], "qty": r["qty"], "revenue": r["revenue"]})
    return {"items": items, "top_by_category": top_by_category}

@api_router.get("/reports/inventory")
async def reports_inventory(
    store_id: str,
    user=Depends(get_current_user),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
):
    """Per-store inventory report: valuation, wastage, consumption, purchases.
    Cost-restricted (cashier/kitchen 403)."""
    require_inventory_manager(user)
    assert_store_allowed(user, store_id)
    items = await db.inventory_items.find({"store_id": store_id}, {"_id": 0}).to_list(5000)
    valuation = round(sum(float(i.get("qty_on_hand", 0) or 0) * float(i.get("avg_cost", 0) or 0) for i in items), 2)

    drng = _created_range(date_from, date_to)
    dmatch = {"store_id": store_id, "status": "approved"}
    if drng:
        dmatch["decided_at"] = drng
    discards = await db.discards.find(dmatch, {"_id": 0}).to_list(100000)
    wastage = round(sum(float(d.get("value", 0) or 0) for d in discards), 2)

    mrng = _created_range(date_from, date_to)
    base = {"store_id": store_id}
    if mrng:
        base["created_at"] = mrng
    sale_moves = await db.movement_log.find({**base, "type": "sale"}, {"_id": 0}).to_list(200000)
    consumption = round(sum(abs(m.get("qty_delta", 0) or 0) * float(m.get("unit_cost_at_time", 0) or 0) for m in sale_moves), 2)

    inward_moves = await db.movement_log.find({**base, "type": "inward"}, {"_id": 0}).to_list(200000)
    purchases_by_item = {}
    purchase_total = 0.0
    for m in inward_moves:
        v = (m.get("qty_delta", 0) or 0) * float(m.get("unit_cost_at_time", 0) or 0)
        purchase_total += v
        b = purchases_by_item.setdefault(m.get("item_id"), {"item_id": m.get("item_id"), "product_id": m.get("product_id"), "qty": 0.0, "value": 0.0})
        b["qty"] += (m.get("qty_delta", 0) or 0); b["value"] += v
    for b in purchases_by_item.values():
        b["qty"] = round(b["qty"], 2); b["value"] = round(b["value"], 2)
    return {
        "store_id": store_id,
        "valuation": valuation,
        "wastage": wastage,
        "consumption": consumption,
        "purchases": {"total": round(purchase_total, 2), "by_item": list(purchases_by_item.values())},
    }

@api_router.get("/reports/audit-log")
async def reports_audit_log(
    store_id: str,
    user=Depends(get_current_user),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    types: Optional[str] = None,
):
    """Read-only merged audit trail (movement_log + discards + transfers) for a
    store. Append-only sources; no mutation. Scope-guarded; cashier/kitchen 403."""
    if not role_in(user, "super_admin", "area_manager", "store_manager"):
        raise HTTPException(status_code=403, detail="Audit log access denied")
    assert_store_allowed(user, store_id)
    rng = _created_range(date_from, date_to)
    mq = {"store_id": store_id}
    if rng:
        mq["created_at"] = rng
    if types:
        wanted = [t.strip() for t in types.split(",") if t.strip()]
        if wanted:
            mq["type"] = {"$in": wanted}
    movements = await db.movement_log.find(mq, {"_id": 0}).sort("created_at", -1).to_list(5000)
    entries = [{"source": "movement_log", "at": m.get("created_at"), "type": m.get("type"),
                "user_id": m.get("user_id"), "ref_id": m.get("ref_id"), "item_id": m.get("item_id"),
                "qty_delta": m.get("qty_delta"), "reason": m.get("reason")} for m in movements]
    # Include discards/transfers (decision audit) for the store/range
    dq = {"store_id": store_id}
    if rng:
        dq["raised_at"] = rng
    for d in await db.discards.find(dq, {"_id": 0}).to_list(5000):
        entries.append({"source": "discards", "at": d.get("decided_at") or d.get("raised_at"), "type": "discard",
                        "user_id": d.get("approved_by") or d.get("raised_by"), "ref_id": d.get("id"),
                        "status": d.get("status"), "value": d.get("value")})
    tq = {"$or": [{"from_store_id": store_id}, {"to_store_id": store_id}]}
    for t in await db.transfers.find(tq, {"_id": 0}).to_list(5000):
        entries.append({"source": "transfers", "at": t.get("decided_at") or t.get("requested_at"), "type": "transfer",
                        "user_id": t.get("approved_by") or t.get("requested_by"), "ref_id": t.get("id"),
                        "status": t.get("status")})
    entries.sort(key=lambda e: e.get("at") or "", reverse=True)
    return {"store_id": store_id, "entries": entries}

# ==========================================================================
# PHASE 4B — Report exports (Excel + PDF). Reuse the SAME 4A builders so the
# numbers can never diverge, and inherit their cost/scope guards (the 4A
# functions raise 403 themselves). READ-ONLY.
# ==========================================================================
async def _fetch_report(report: str, user, date_from, date_to, store_ids, granularity):
    """Call the matching 4A endpoint function directly (same data + same guards)."""
    if report == "pnl":
        return await reports_pnl(user=user, date_from=date_from, date_to=date_to, store_ids=store_ids, granularity=granularity)
    if report == "consolidated":
        return await reports_pnl_consolidated(user=user, date_from=date_from, date_to=date_to)
    if report == "ranking":
        return await reports_ranking(user=user, date_from=date_from, date_to=date_to, store_ids=store_ids)
    if report == "items":
        return await reports_items(user=user, date_from=date_from, date_to=date_to, store_ids=store_ids)
    if report == "inventory":
        if not store_ids:
            raise HTTPException(status_code=400, detail="store_ids (a single store_id) is required for the inventory report")
        return await reports_inventory(store_id=store_ids, user=user, date_from=date_from, date_to=date_to)
    if report == "audit-log":
        if not store_ids:
            raise HTTPException(status_code=400, detail="store_ids (a single store_id) is required for the audit-log report")
        return await reports_audit_log(store_id=store_ids, user=user, date_from=date_from, date_to=date_to)
    raise HTTPException(status_code=404, detail="Unknown report")

def _report_to_sheets(report: str, data):
    """Normalize a report payload into [(sheet_title, [row_dict,...])]."""
    if report == "pnl":
        stores = data or []
        main = [{k: v for k, v in s.items() if k != "months"} for s in stores]
        sheets = [("P&L", main)]
        monthly = []
        for s in stores:
            for m in (s.get("months") or []):
                monthly.append({"store_id": s["store_id"], "store_name": s["store_name"], **m})
        if monthly:
            sheets.append(("Monthly", monthly))
        return sheets
    if report == "consolidated":
        return [("Company", [data["company"]]), ("Stores", data["stores"])]
    if report == "ranking":
        return [("By Gross Profit", data["by_gross_profit"]), ("By Revenue", data["by_revenue"])]
    if report == "items":
        return [("Items", data["items"])]
    if report == "inventory":
        summary = [{"valuation": data["valuation"], "wastage": data["wastage"],
                    "consumption": data["consumption"], "purchase_total": data["purchases"]["total"]}]
        return [("Summary", summary), ("Purchases", data["purchases"]["by_item"])]
    if report == "audit-log":
        return [("Audit", data["entries"])]
    return [("Report", data if isinstance(data, list) else [data])]

def _cell(v):
    if isinstance(v, (dict, list)):
        return json.dumps(v, default=str)
    return v

def _build_xlsx(sheets) -> bytes:
    import openpyxl
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for title, rows in sheets:
        ws = wb.create_sheet((title or "Sheet")[:31])
        if rows:
            headers = list(rows[0].keys())
            for r in rows:
                for k in r.keys():
                    if k not in headers:
                        headers.append(k)
            ws.append(headers)
            for r in rows:
                ws.append([_cell(r.get(h)) for h in headers])
        else:
            ws.append(["(no data)"])
    bio = io.BytesIO()
    wb.save(bio)
    return bio.getvalue()

def _build_pdf(title: str, meta: str, sheets) -> bytes:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4))
    styles = getSampleStyleSheet()
    elems = [Paragraph(title, styles["Title"]), Paragraph(meta, styles["Normal"]), Spacer(1, 12)]
    for stitle, rows in sheets:
        elems.append(Paragraph(stitle, styles["Heading2"]))
        if rows:
            headers = list(rows[0].keys())
            table_data = [headers] + [[str(_cell(r.get(h, ""))) for h in headers] for r in rows]
            t = Table(table_data)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#15140F")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ]))
            elems.append(t)
        else:
            elems.append(Paragraph("(no data)", styles["Normal"]))
        elems.append(Spacer(1, 12))
    doc.build(elems)
    return buf.getvalue()

def _scope_meta(report, date_from, date_to, store_ids):
    return f"Range: {date_from or 'all'} to {date_to or 'now'} | Scope: {store_ids or 'in-scope stores'}"

@api_router.get("/reports/{report}/export.xlsx")
async def export_report_xlsx(
    report: str,
    user=Depends(get_current_user),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    store_ids: Optional[str] = None,
    granularity: str = "total",
):
    """Excel export of a 4A report (same builder, same scope guards)."""
    data = await _fetch_report(report, user, date_from, date_to, store_ids, granularity)
    content = _build_xlsx(_report_to_sheets(report, data))
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{report}.xlsx"'},
    )

@api_router.get("/reports/{report}/export.pdf")
async def export_report_pdf(
    report: str,
    user=Depends(get_current_user),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    store_ids: Optional[str] = None,
    granularity: str = "total",
):
    """PDF export of a 4A report (same builder, same scope guards)."""
    data = await _fetch_report(report, user, date_from, date_to, store_ids, granularity)
    content = _build_pdf(f"BORAROC — {report} report", _scope_meta(report, date_from, date_to, store_ids),
                         _report_to_sheets(report, data))
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{report}.pdf"'},
    )

# ==========================================================================
# PHASE 5A — Day open/close + cash reconciliation + stock snapshots +
# per-cashier/shift sales. Reuses inventory_items + orders. A closed day is
# immutable. Cost/store scope enforced; kitchen has no access.
# ==========================================================================
class DayOpenRequest(BaseModel):
    opening_cash_float: float = 0
    business_date: Optional[str] = None
    notes: Optional[str] = None

class DayCloseRequest(BaseModel):
    closing_cash_counted: float
    payouts: float = 0
    notes: Optional[str] = None

async def _inventory_snapshot(store_id: str):
    items = await db.inventory_items.find({"store_id": store_id}, {"_id": 0, "id": 1, "qty_on_hand": 1}).to_list(5000)
    return [{"item_id": i["id"], "qty_on_hand": float(i.get("qty_on_hand", 0) or 0)} for i in items]

async def _cash_sales_in_window(store_id: str, start_iso: str, end_iso: str) -> float:
    q = {"store_id": store_id, "payment_mode": "cash", "status": {"$ne": "cancelled"},
         "created_at": {"$gte": start_iso, "$lte": end_iso}}
    orders = await db.orders.find(q, {"_id": 0, "total_price": 1}).to_list(100000)
    return round(sum(float(o.get("total_price", 0) or 0) for o in orders), 2)

@api_router.post("/stores/{store_id}/day/open")
async def open_business_day(store_id: str, data: DayOpenRequest, user=Depends(get_current_user)):
    """Open the business day (store_manager or cashier, own store). Captures the
    opening cash float + a snapshot of current inventory. One open day per store."""
    if normalize_role(user) not in ("store_manager", "cashier"):
        raise HTTPException(status_code=403, detail="Store manager or cashier only")
    assert_store_allowed(user, store_id)
    existing = await db.business_days.find_one({"store_id": store_id, "status": "open"}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="A business day is already open for this store")
    now = datetime.now(timezone.utc).isoformat()
    day = {
        "id": str(uuid.uuid4()),
        "store_id": store_id,
        "business_date": data.business_date or now[:10],
        "status": "open",
        "opened_by": user["id"],
        "opened_at": now,
        "opening_cash_float": float(data.opening_cash_float or 0),
        "opening_stock_snapshot": await _inventory_snapshot(store_id),
        "closed_by": None, "closed_at": None,
        "closing_cash_counted": None, "closing_stock_snapshot": None,
        "expected_cash": None, "cash_variance": None,
        "payouts": 0, "notes": data.notes,
    }
    await db.business_days.insert_one(day)
    return {k: v for k, v in day.items() if k != "_id"}

@api_router.post("/stores/{store_id}/day/close")
async def close_business_day(store_id: str, data: DayCloseRequest, user=Depends(get_current_user)):
    """Close the open business day (store_manager only). Computes expected cash =
    opening float + cash sales in window - payouts, and the variance vs counted."""
    if normalize_role(user) != "store_manager":
        raise HTTPException(status_code=403, detail="Only the store manager may close the day")
    assert_store_allowed(user, store_id)
    day = await db.business_days.find_one({"store_id": store_id, "status": "open"}, {"_id": 0})
    if not day:
        raise HTTPException(status_code=400, detail="No open business day for this store")
    now = datetime.now(timezone.utc).isoformat()
    cash_sales = await _cash_sales_in_window(store_id, day["opened_at"], now)
    payouts = float(data.payouts or 0)
    expected_cash = round(float(day.get("opening_cash_float", 0) or 0) + cash_sales - payouts, 2)
    cash_variance = round(float(data.closing_cash_counted) - expected_cash, 2)
    await db.business_days.update_one({"id": day["id"]}, {"$set": {
        "status": "closed", "closed_by": user["id"], "closed_at": now,
        "closing_cash_counted": float(data.closing_cash_counted),
        "closing_stock_snapshot": await _inventory_snapshot(store_id),
        "cash_sales": cash_sales, "payouts": payouts,
        "expected_cash": expected_cash, "cash_variance": cash_variance,
        "close_notes": data.notes,
    }})
    return await db.business_days.find_one({"id": day["id"]}, {"_id": 0})

def _strip_day_for_cashier(day: dict) -> dict:
    """Cashier sees own-shift cash, not the store reconciliation / P&L."""
    hidden = ("expected_cash", "cash_variance", "opening_stock_snapshot", "closing_stock_snapshot")
    return {k: v for k, v in day.items() if k not in hidden}

@api_router.get("/stores/{store_id}/day/{business_date}")
async def get_business_day(store_id: str, business_date: str, user=Depends(get_current_user)):
    """Read a day's record + reconciliation. store_mgr/area/HQ see variance;
    cashier sees own-shift cash only. kitchen 403."""
    role = normalize_role(user)
    if role not in ("super_admin", "area_manager", "store_manager", "cashier"):
        raise HTTPException(status_code=403, detail="No access")
    assert_store_allowed(user, store_id)
    day = await db.business_days.find_one({"store_id": store_id, "business_date": business_date}, {"_id": 0})
    if not day:
        raise HTTPException(status_code=404, detail="No business day for that date")
    return _strip_day_for_cashier(day) if role == "cashier" else day

@api_router.get("/stores/{store_id}/shifts/summary")
async def shift_sales_summary(
    store_id: str,
    user=Depends(get_current_user),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
):
    """Per-cashier walk-in sales (order_count, revenue, by payment_mode).
    store_mgr/area/HQ see all cashiers; a cashier sees only their own totals;
    kitchen 403."""
    role = normalize_role(user)
    if role not in ("super_admin", "area_manager", "store_manager", "cashier"):
        raise HTTPException(status_code=403, detail="No access")
    assert_store_allowed(user, store_id)
    match = {"store_id": store_id, "order_source": "walk_in", "status": {"$ne": "cancelled"}}
    rng = {}
    if date_from:
        rng["$gte"] = date_from
    if date_to:
        rng["$lte"] = date_to + "T23:59:59.999999+00:00"
    if rng:
        match["created_at"] = rng
    if role == "cashier":
        match["user_id"] = user["id"]  # own totals only
    orders = await db.orders.find(match, {"_id": 0, "user_id": 1, "total_price": 1, "payment_mode": 1}).to_list(100000)
    by_user = {}
    for o in orders:
        uid = o.get("user_id")
        b = by_user.setdefault(uid, {"cashier_id": uid, "order_count": 0, "revenue": 0.0, "by_payment_mode": {}})
        b["order_count"] += 1
        b["revenue"] += float(o.get("total_price", 0) or 0)
        pm = o.get("payment_mode", "cash")
        b["by_payment_mode"][pm] = round(b["by_payment_mode"].get(pm, 0.0) + float(o.get("total_price", 0) or 0), 2)
    # attach names
    uids = [u for u in by_user.keys() if u]
    users = await db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    name_by_id = {u["id"]: u.get("name") for u in users}
    rows = []
    for uid, b in by_user.items():
        b["cashier_name"] = name_by_id.get(uid)
        b["revenue"] = round(b["revenue"], 2)
        rows.append(b)
    rows.sort(key=lambda r: r["revenue"], reverse=True)
    return {"store_id": store_id, "cashiers": rows}

# ==========================================================================
# PHASE 5B — Refund / void (reason + audit + stock reversal) + GST invoice.
# Reuses explode_to_raw + log_movement + inventory_items. Mirrors the discard
# raise/finalize pattern. Cost is never exposed to cashier/kitchen; the invoice
# shows selling + tax only (never purchase cost).
# ==========================================================================
class RefundRequest(BaseModel):
    reason: str
    amount: Optional[float] = None                    # partial; default = full order total
    lines: Optional[List[Dict[str, Any]]] = None      # partial: [{product_id, grams?|units?}]

class VoidRequest(BaseModel):
    reason: str

def _reversal_lines(order: dict, provided: Optional[list]) -> list:
    """Lines (with qty) to re-add to stock: provided partial lines, else all items."""
    out = []
    if provided:
        for l in provided:
            pid = l.get("product_id")
            it = next((i for i in order.get("items", []) if i.get("product_id") == pid), None)
            ptype = (it or {}).get("product_type", "single")
            if ptype == "ready_made":
                out.append({"product_id": pid, "product_type": "ready_made", "units": int(l.get("units", 1) or 1)})
            else:
                out.append({"product_id": pid, "product_type": "single", "grams": float(l.get("grams", 0) or 0)})
        return out
    for it in order.get("items", []):
        pid = it.get("product_id")
        if not pid:
            continue
        if it.get("product_type") == "ready_made":
            out.append({"product_id": pid, "product_type": "ready_made", "units": int(it.get("quantity", 1) or 1)})
        else:
            out.append({"product_id": pid, "product_type": "single", "grams": float(it.get("grams", 0) or 0)})
    return out

async def _readd_stock_for_order(order: dict, lines: list, user_id: str) -> bool:
    """Re-add raw stock for refunded lines via explode_to_raw; log 'refund'
    (positive). Idempotent: if any 'refund' movement exists for this order, skip."""
    if await db.movement_log.count_documents({"ref_id": order["id"], "type": "refund"}) > 0:
        return False
    sid = order.get("store_id") or DEFAULT_STORE_ID
    now = datetime.now(timezone.utc).isoformat()
    reversed_any = False
    for line in lines:
        if line["product_type"] == "ready_made":
            exploded = await explode_to_raw("meal", line["product_id"], line["units"], sid)
        else:
            exploded = await explode_to_raw("raw", line["product_id"], line["grams"], sid)
        for e in exploded:
            new_qty = float(e["item"].get("qty_on_hand", 0) or 0) + e["grams"]
            await db.inventory_items.update_one({"id": e["item"]["id"], "store_id": sid},
                                                {"$set": {"qty_on_hand": new_qty, "updated_at": now}})
            await log_movement(store_id=sid, item_id=e["item"]["id"], product_id=e["item"].get("product_id"),
                               mtype="refund", qty_delta=e["grams"], qty_after=new_qty,
                               reason=f"refund:{order['id']}", user_id=user_id, ref_id=order["id"],
                               unit_cost_at_time=e["unit_cost"])
            reversed_any = True
    return reversed_any

async def _execute_reversal(order, kind, amount, reason, lines, user, existing_rec=None):
    """Reverse stock once + set order status + write/complete the audit record."""
    reversed_ok = await _readd_stock_for_order(order, _reversal_lines(order, lines), user["id"])
    new_status = "voided" if kind == "void" else "refunded"
    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one({"id": order["id"]}, {"$set": {
        "status": new_status, "refunded_amount": amount, "refund_reason": reason,
        "refunded_by": user["id"], "refunded_at": now}})
    if existing_rec:
        await db.refunds.update_one({"id": existing_rec["id"]}, {"$set": {
            "status": "completed", "finalized_by": user["id"], "finalized_at": now, "stock_reversed": reversed_ok}})
        rec = await db.refunds.find_one({"id": existing_rec["id"]}, {"_id": 0})
    else:
        rec = {
            "id": str(uuid.uuid4()), "order_id": order["id"], "store_id": order.get("store_id"),
            "kind": kind, "amount": amount, "reason": reason, "lines": lines,
            "status": "completed", "flagged": amount >= HQ_VALUE_THRESHOLD,
            "raised_by": user["id"], "raised_at": now, "finalized_by": user["id"], "finalized_at": now,
            "stock_reversed": reversed_ok,
        }
        await db.refunds.insert_one(rec)
        rec = {k: v for k, v in rec.items() if k != "_id"}
    return {"order_id": order["id"], "status": new_status, "stock_reversed": reversed_ok, "refund": rec}

async def _raise_or_execute(order, kind, amount, reason, lines, user):
    """cashier -> raise a pending record (store_manager finalizes); manager/HQ -> execute now."""
    role = normalize_role(user)
    if role == "cashier":
        now = datetime.now(timezone.utc).isoformat()
        rec = {
            "id": str(uuid.uuid4()), "order_id": order["id"], "store_id": order.get("store_id"),
            "kind": kind, "amount": amount, "reason": reason, "lines": lines,
            "status": "pending", "flagged": amount >= HQ_VALUE_THRESHOLD,
            "raised_by": user["id"], "raised_at": now, "finalized_by": None, "finalized_at": None,
            "stock_reversed": False,
        }
        await db.refunds.insert_one(rec)
        return {"order_id": order["id"], "status": "pending", "refund": {k: v for k, v in rec.items() if k != "_id"}}
    return await _execute_reversal(order, kind, amount, reason, lines, user)

@api_router.post("/orders/{order_id}/refund")
async def refund_order(order_id: str, data: RefundRequest, user=Depends(get_current_user)):
    """Refund (full or partial). Reason REQUIRED. store_manager/HQ execute (reverse
    stock once); cashier raises a pending record for the store_manager to finalize."""
    if normalize_role(user) not in ("cashier", "store_manager", "super_admin"):
        raise HTTPException(status_code=403, detail="Cashier/Store-Manager/HQ only")
    if not (data.reason and data.reason.strip()):
        raise HTTPException(status_code=400, detail="reason is required")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    assert_store_allowed(user, order.get("store_id"))
    if order.get("status") in ("refunded", "voided"):
        raise HTTPException(status_code=400, detail="Order already refunded/voided")
    amount = data.amount if data.amount is not None else float(order.get("total_price", 0) or 0)
    return await _raise_or_execute(order, "refund", amount, data.reason, data.lines, user)

@api_router.post("/orders/{order_id}/void")
async def void_order(order_id: str, data: VoidRequest, user=Depends(get_current_user)):
    """Void an unfulfilled order. Reason REQUIRED. Same role pattern as refund."""
    if normalize_role(user) not in ("cashier", "store_manager", "super_admin"):
        raise HTTPException(status_code=403, detail="Cashier/Store-Manager/HQ only")
    if not (data.reason and data.reason.strip()):
        raise HTTPException(status_code=400, detail="reason is required")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    assert_store_allowed(user, order.get("store_id"))
    if order.get("status") in ("refunded", "voided"):
        raise HTTPException(status_code=400, detail="Order already refunded/voided")
    amount = float(order.get("total_price", 0) or 0)
    return await _raise_or_execute(order, "void", amount, data.reason, data.lines if hasattr(data, "lines") else None, user)

@api_router.post("/refunds/{refund_id}/finalize")
async def finalize_refund(refund_id: str, user=Depends(get_current_user)):
    """Finalize a pending refund/void. store_manager/HQ only — cashier 403."""
    if normalize_role(user) not in ("store_manager", "super_admin"):
        raise HTTPException(status_code=403, detail="Only the store manager or HQ may finalize")
    rec = await db.refunds.find_one({"id": refund_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Refund not found")
    if rec.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Already finalized")
    assert_store_allowed(user, rec.get("store_id"))
    order = await db.orders.find_one({"id": rec["order_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return await _execute_reversal(order, rec.get("kind", "refund"), rec.get("amount"), rec.get("reason"),
                                   rec.get("lines"), user, existing_rec=rec)

# list endpoint — added for UI rendering 2026-06-10
@api_router.get("/refunds")
async def list_refunds(store_id: Optional[str] = None, status: Optional[str] = None,
                       flagged: Optional[bool] = None, user=Depends(get_current_user)):
    """Read-only list of refund/void records, scoped like the refund handlers.
    cashier/store_manager -> own store, area_manager -> cluster, super_admin -> all
    (kitchen -> 403). Cost fields stripped via _public_item. Newest-first."""
    if normalize_role(user) not in ("cashier", "store_manager", "area_manager", "super_admin"):
        raise HTTPException(status_code=403, detail="Cashier/Store-Manager/Area/HQ only")
    if store_id:
        assert_store_allowed(user, store_id)
        q = {"store_id": store_id}
    else:
        q = store_filter(user)  # {} for HQ, else {store_id: {$in: scope}}
    if status:
        q["status"] = status
    if flagged is not None:
        q["flagged"] = flagged
    rows = await db.refunds.find(q, {"_id": 0}).sort("raised_at", -1).to_list(1000)
    return [_public_item(r, user) for r in rows]

@api_router.get("/orders/{order_id}/invoice")
async def order_invoice(order_id: str, user=Depends(get_current_user)):
    """GST invoice (read-only). Customer owns their order; staff within store
    scope (cashier ok). Selling + tax only — never purchase cost."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if normalize_role(user) == "customer":
        if order.get("user_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        assert_store_allowed(user, order.get("store_id"))
    store = await db.stores.find_one({"store_id": order.get("store_id")}, {"_id": 0}) or {}
    total = float(order.get("total_price", 0) or 0)
    gst_amount = order.get("gst_amount", round(total * 5 / 105, 2))
    base_amount = order.get("base_amount", round(total * 100 / 105, 2))
    cgst = round(gst_amount / 2, 2)
    sgst = round(gst_amount - cgst, 2)  # intra-state 50/50
    items = [{
        "name": i.get("product_name"),
        "qty": (f"x{i.get('quantity', 1)}" if i.get("product_type") == "ready_made" else f"{i.get('grams', 0)}g"),
        "amount": i.get("price", 0),
    } for i in order.get("items", [])]
    return {
        "invoice_no": f"INV-{order['id']}",
        "date": order.get("created_at"),
        "store": {"name": store.get("name"), "gst_no": store.get("gst_no"),
                  "fssai_license": store.get("fssai_license"), "address": store.get("address")},
        "customer": {"name": order.get("customer_name") or order.get("user_name"),
                     "gstin": order.get("gstin"), "business_name": order.get("business_name")},
        "items": items,
        "taxable_value": base_amount,
        "gst_percent": order.get("gst_percent", 5),
        "cgst": cgst, "sgst": sgst, "gst_amount": gst_amount,
        "total": total,
        "status": order.get("status"),
    }

# PHASE 5C — Store onboarding workflow + go-live gating (HQ-driven).
# Ordered steps: created -> catalog_priced -> staff_assigned -> compliance_done
# -> live. Compliance (GST + FSSAI) is a HARD gate for go-live.
# ==========================================================================
ONBOARDING_ORDER = ["created", "catalog_priced", "staff_assigned", "compliance_done", "live"]

class OnboardingAdvanceRequest(BaseModel):
    accept_master_prices: bool = False  # when advancing to catalog_priced without per-store overrides

async def _onboarding_checklist(store: dict):
    sid = store["store_id"]
    override_count = await db.product_overrides.count_documents({"store_id": sid})
    catalog_priced = override_count > 0 or bool(store.get("accept_master_prices"))
    sm_count = await db.users.count_documents({"role": "store_manager", "store_id": sid})
    staff_assigned = bool(store.get("area_manager_id")) and sm_count >= 1
    compliance_done = bool((store.get("gst_no") or "").strip()) and bool((store.get("fssai_license") or "").strip())
    return {
        "created": {"step": "created", "done": True, "detail": None},
        "catalog_priced": {"step": "catalog_priced", "done": catalog_priced,
                           "detail": f"{override_count} per-store price(s)" if catalog_priced else "Set per-store prices or accept master prices"},
        "staff_assigned": {"step": "staff_assigned", "done": staff_assigned,
                           "detail": None if staff_assigned else "Assign an area manager + at least one store manager"},
        "compliance_done": {"step": "compliance_done", "done": compliance_done,
                            "detail": None if compliance_done else "GST number and FSSAI license are required"},
        "live": {"step": "live", "done": store.get("onboarding_status") == "live", "detail": None},
    }

@api_router.get("/stores/onboarding/pending")
async def onboarding_pending(user=Depends(get_current_user)):
    """HQ: stores not yet live (onboarding pending)."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    stores = await db.stores.find({"onboarding_status": {"$ne": "live"}}, {"_id": 0}).to_list(1000)
    return [{"store_id": s["store_id"], "name": s.get("name"), "code": s.get("code"),
             "onboarding_status": s.get("onboarding_status", "created")} for s in stores]

@api_router.get("/stores/{store_id}/onboarding")
async def get_onboarding(store_id: str, user=Depends(get_current_user)):
    """Onboarding status + checklist. super_admin any; area_manager/store_manager
    read within their scope; cashier/kitchen 403."""
    if normalize_role(user) not in ("super_admin", "area_manager", "store_manager"):
        raise HTTPException(status_code=403, detail="No access")
    assert_store_allowed(user, store_id)
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    checklist = await _onboarding_checklist(store)
    return {
        "store_id": store_id,
        "onboarding_status": store.get("onboarding_status", "created"),
        "checklist": [checklist[s] for s in ONBOARDING_ORDER],
    }

@api_router.post("/stores/{store_id}/onboarding/advance")
async def advance_onboarding(store_id: str, data: OnboardingAdvanceRequest, user=Depends(get_current_user)):
    """HQ only: advance the store to the next onboarding step if its gate passes.
    (Going live uses /go-live.)"""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only — onboarding transitions are super_admin")
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    cur = store.get("onboarding_status", "created")
    idx = ONBOARDING_ORDER.index(cur)
    if cur == "live":
        raise HTTPException(status_code=400, detail="Store is already live")
    nxt = ONBOARDING_ORDER[idx + 1]
    if nxt == "live":
        raise HTTPException(status_code=400, detail="Use POST /stores/{id}/go-live to take the store live")
    if nxt == "catalog_priced" and data.accept_master_prices:
        await db.stores.update_one({"store_id": store_id}, {"$set": {"accept_master_prices": True}})
        store["accept_master_prices"] = True
    checklist = await _onboarding_checklist(store)
    gate = checklist[nxt]
    if not gate["done"]:
        raise HTTPException(status_code=400, detail=f"Cannot advance to {nxt}: {gate['detail']}")
    await db.stores.update_one({"store_id": store_id}, {"$set": {"onboarding_status": nxt}})
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    return {"store_id": store_id, "onboarding_status": store.get("onboarding_status")}

@api_router.post("/stores/{store_id}/go-live")
async def go_live(store_id: str, user=Depends(get_current_user)):
    """HQ only: take a store live. HARD GATE — GST number AND FSSAI license must
    be present, else 400."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only — go-live is super_admin")
    store = await db.stores.find_one({"store_id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    if not ((store.get("gst_no") or "").strip() and (store.get("fssai_license") or "").strip()):
        raise HTTPException(status_code=400, detail="Compliance incomplete: GST number and FSSAI license are required to go live")
    await db.stores.update_one({"store_id": store_id}, {"$set": {"onboarding_status": "live"}})
    return {"store_id": store_id, "onboarding_status": "live"}

# Demo staff PINs, one per staff role, for role-separation testing.
# NOTE: pin_plain storage + fixed demo PINs are a pre-launch security concern
# (see PR note). Demo PINs must be removed/rotated before real launch.
_DEMO_STAFF = [
    {"role": "area_manager",  "name": "Demo Area Manager",  "pin": "550010"},
    {"role": "cashier",       "name": "Demo Cashier",       "pin": "550020"},
    {"role": "kitchen",       "name": "Demo Kitchen",       "pin": "550030"},
]

async def _free_pin(preferred: str) -> Optional[str]:
    """Return `preferred` if unused, else the next free PIN in its +0..+5 range
    (mirrors the 550001..550005 loop in run_store_migration)."""
    base = int(preferred)
    for candidate in [str(base + i) for i in range(0, 6)]:
        if not await db.users.find_one({"pin_plain": candidate}, {"_id": 0}):
            return candidate
    return None

@api_router.post("/admin/seed-demo-staff")
async def admin_seed_demo_staff(user=Depends(get_current_user)):
    """HQ only: idempotently ensure one demo login per staff role for the default
    store (area_manager / cashier / kitchen). The store_manager (PIN 550001) is
    created by run_store_migration and is left untouched. Returns demo creds so
    the owner can log in as each role. Does not auto-run on boot."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")

    creds = []
    for spec in _DEMO_STAFF:
        role = spec["role"]
        # Idempotent: one demo user per role for the default store.
        if role == "area_manager":
            existing = await db.users.find_one(
                {"role": "area_manager", "cluster_store_ids": DEFAULT_STORE_ID}, {"_id": 0})
        else:
            existing = await db.users.find_one(
                {"role": role, "store_id": DEFAULT_STORE_ID}, {"_id": 0})
        if existing:
            creds.append({"role": role, "pin": existing.get("pin_plain", "****"),
                          "store_id": existing.get("store_id"),
                          "cluster_store_ids": existing.get("cluster_store_ids")})
            continue

        pin = await _free_pin(spec["pin"])
        if not pin:
            continue  # no free PIN in range; skip rather than collide
        doc = {
            "id": str(uuid.uuid4()),
            "name": spec["name"],
            "role": role,
            "pin_hash": hash_password(pin),
            "pin_plain": pin,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if role == "area_manager":
            doc["cluster_store_ids"] = [DEFAULT_STORE_ID]
        else:
            doc["store_id"] = DEFAULT_STORE_ID
        await db.users.insert_one(doc)
        logger.info(f"[demo] created {role} (PIN {pin})")
        creds.append({"role": role, "pin": pin,
                      "store_id": doc.get("store_id"),
                      "cluster_store_ids": doc.get("cluster_store_ids")})

    return {"message": "Demo staff ensured", "default_store_id": DEFAULT_STORE_ID,
            "demo_staff": creds}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,  # A4: from ALLOWED_ORIGINS env (dev fallback ["*"])
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== MULTI-STORE MIGRATION (idempotent, backward-compatible) ==========
STORE_SCOPED_COLLECTIONS = [
    "orders", "payments", "held_bills", "tables", "shifts", "stock_logs", "delivery_tracking",
]

async def ensure_default_store():
    existing = await db.stores.find_one({"store_id": DEFAULT_STORE_ID}, {"_id": 0})
    if existing:
        return existing
    store = {
        "store_id": DEFAULT_STORE_ID,
        "name": "BORAROC Main Store",
        "code": "MAIN",
        "address": None,
        "geo": {"lat": 28.6139, "lng": 77.2090},
        "lat": 28.6139, "lng": 77.2090,
        "phone": None, "gst_no": None, "fssai_license": None,
        "open_hours": None,
        "tax_settings": {"gst_percent": 5},
        "area_manager_id": None,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.stores.insert_one(store)
    return store

async def run_store_migration():
    """Create the default store and assign all existing single-store data to it.
    Maps the legacy 'admin' role to 'super_admin' and ensures a default
    store_manager exists. Safe to run repeatedly."""
    await ensure_default_store()

    # Legacy HQ admin -> super_admin
    await db.users.update_many({"role": "admin"}, {"$set": {"role": "super_admin"}})

    # Store-bound staff missing a store_id -> default store
    await db.users.update_many(
        {"role": {"$in": ["store_manager", "cashier", "kitchen"]}, "store_id": {"$exists": False}},
        {"$set": {"store_id": DEFAULT_STORE_ID}},
    )
    await db.users.update_many(
        {"role": {"$in": ["store_manager", "cashier", "kitchen"]}, "store_id": None},
        {"$set": {"store_id": DEFAULT_STORE_ID}},
    )

    # Backfill store_id on store-scoped operational collections
    for coll in STORE_SCOPED_COLLECTIONS:
        await db[coll].update_many(
            {"store_id": {"$exists": False}}, {"$set": {"store_id": DEFAULT_STORE_ID}}
        )

    # Staff-facing notifications (the 'kitchen' sentinel) -> default store
    await db.notifications.update_many(
        {"store_id": {"$exists": False}, "user_id": "kitchen"},
        {"$set": {"store_id": DEFAULT_STORE_ID}},
    )

    # Ensure a store_manager exists for the default store
    sm = await db.users.find_one({"role": "store_manager", "store_id": DEFAULT_STORE_ID}, {"_id": 0})
    if not sm:
        pin = None
        for candidate in ["550001", "550002", "550003", "550004", "550005"]:
            if not await db.users.find_one({"pin_plain": candidate}, {"_id": 0}):
                pin = candidate
                break
        if pin:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "name": "Default Store Manager",
                "role": "store_manager",
                "store_id": DEFAULT_STORE_ID,
                "pin_hash": hash_password(pin),
                "pin_plain": pin,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"[migration] created default store_manager (PIN {pin})")
    logger.info("[migration] multi-store migration complete")

@api_router.post("/admin/migrate-multistore")
async def admin_migrate_multistore(user=Depends(get_current_user)):
    """HQ: (re-)run the multi-store migration."""
    if not is_hq(user):
        raise HTTPException(status_code=403, detail="HQ only")
    await run_store_migration()
    return {"message": "Migration complete", "default_store_id": DEFAULT_STORE_ID}

@app.on_event("startup")
async def on_startup():
    # A5: TTL index so OTP documents auto-expire and survive restarts
    try:
        await db.otp_codes.create_index("expires_at", expireAfterSeconds=0)
        logger.info("[startup] otp_codes TTL index ensured")
    except Exception as e:
        logger.error(f"[startup] index error: {e}")
    # Phase 1A: one override per (store, product)
    try:
        await db.product_overrides.create_index([("store_id", 1), ("product_id", 1)], unique=True)
        logger.info("[startup] product_overrides unique index ensured")
    except Exception as e:
        logger.error(f"[startup] override index error: {e}")
    # Phase 2A: coupon redemption counters
    try:
        await db.coupon_redemptions.create_index("coupon_code")
        await db.coupon_redemptions.create_index([("coupon_code", 1), ("user_id", 1)])
        logger.info("[startup] coupon_redemptions indexes ensured")
    except Exception as e:
        logger.error(f"[startup] coupon_redemptions index error: {e}")
    # Phase 3A: one inventory row per (store, product) for sold raws
    try:
        await db.inventory_items.create_index(
            [("store_id", 1), ("product_id", 1)], unique=True,
            partialFilterExpression={"product_id": {"$type": "string"}},
        )
        await db.movement_log.create_index([("store_id", 1), ("created_at", -1)])
        logger.info("[startup] inventory indexes ensured")
    except Exception as e:
        logger.error(f"[startup] inventory index error: {e}")
    # Multi-store foundation: ensure default store + migrate legacy data
    try:
        await run_store_migration()
    except Exception as e:
        logger.error(f"[startup] store migration error: {e}")
    # Phase 3A: seed raw inventory rows from existing single products
    try:
        await run_inventory_migration()
    except Exception as e:
        logger.error(f"[startup] inventory migration error: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# ========== WRAP FASTAPI WITH SOCKET.IO (Part C real-time) ==========
# Supervisor imports `server:app`; this final ASGI app serves both REST (/api/*) and WS (/api/socket.io).
app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="/api/socket.io")
