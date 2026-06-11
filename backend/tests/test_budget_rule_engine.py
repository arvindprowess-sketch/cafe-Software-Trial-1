"""Budget-meal rule engine — deterministic selection, AI = language layer only.

In-process (mongomock_motor). AI_ENABLED=false so the language layer always uses
the per-goal templates; the meal must never depend on an LLM call.

Run:  pytest backend/tests/test_budget_rule_engine.py
"""
import os
import asyncio
import uuid

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "budget_rule_engine_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")
os.environ["AI_ENABLED"] = "false"

import httpx
from mongomock_motor import AsyncMongoMockClient

import server


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def product(name, diet_type, cost, cal, protein, carbs, fat, stock=100000):
    return {
        "id": str(uuid.uuid4()), "name": name, "product_type": "single",
        "diet_type": diet_type, "is_active": True,
        "cost_per_100g": cost, "calories_per_100g": cal, "protein_per_100g": protein,
        "carbs_per_100g": carbs, "fat_per_100g": fat, "available_qty_grams": stock,
    }


MENU = [
    product("Grilled Chicken", "non-veg", 60, 150, 27, 0, 4),
    product("Paneer Tikka", "veg", 50, 200, 18, 5, 12),
    product("Sprouts Bowl", "veg", 35, 60, 6, 10, 1),
    product("Green Salad", "veg", 30, 40, 2, 6, 0.5),
    product("Brown Rice", "veg", 20, 130, 3, 28, 1),
    product("Bread Toast", "veg", 15, 250, 8, 48, 3),
]

ITEM_KEYS = {
    "product_id", "product_name", "grams", "price", "calories", "protein", "carbs",
    "fat", "diet_type", "image_url", "reason", "cost_per_100g", "calories_per_100g",
    "protein_per_100g", "carbs_per_100g", "fat_per_100g", "category", "max_stock",
}
TOP_KEYS = {"meal_items", "summary", "totals", "diet_preference", "goal",
            "warnings", "meal_percentage", "user_daily_targets"}


class Ctx:
    pass


@pytest.fixture(scope="module")
def ctx():
    server.client = AsyncMongoMockClient()
    server.db = server.client[os.environ["DB_NAME"]]
    transport = httpx.ASGITransport(app=server.app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")

    async def build():
        c = Ctx()
        c.client = client
        r = (await client.post("/api/auth/register", json={
            "email": "qm@test.com", "password": "p", "name": "QM", "role": "customer"})).json()
        c.cust = r["token"]
        return c

    c = run(build())
    yield c
    run(client.aclose())


def seed_menu(items):
    async def go():
        await server.db.products.delete_many({})
        if items:
            await server.db.products.insert_many([dict(i) for i in items])
    run(go())


def quick_meal(ctx, goal="maintenance", budget=300.0, diet="both"):
    return run(ctx.client.post("/api/ai/quick-meal", headers=auth(ctx.cust),
                               json={"goal": goal, "budget": budget, "diet_preference": diet}))


class TestResponseContract:
    def test_shape_identical_to_contract(self, ctx):
        seed_menu(MENU)
        r = quick_meal(ctx)
        assert r.status_code == 200, r.text
        body = r.json()
        assert TOP_KEYS <= set(body.keys())
        assert 3 <= len(body["meal_items"]) <= 5
        for it in body["meal_items"]:
            assert ITEM_KEYS <= set(it.keys()), it.keys()
            assert it["reason"]  # template fallback fills it (AI disabled)
        assert body["summary"]
        assert {"price", "calories", "protein", "carbs", "fat"} <= set(body["totals"].keys())

    def test_totals_price_close_to_budget(self, ctx):
        seed_menu(MENU)
        for budget in (200.0, 300.0, 500.0):
            body = quick_meal(ctx, goal="maintenance", budget=budget).json()
            # gap-close target is <₹0.50; totals are display-rounded to 1 decimal
            assert abs(budget - body["totals"]["price"]) <= 0.55, (budget, body["totals"])


class TestGoalRules:
    def test_fat_loss_skips_avoid_items_when_alternatives_exist(self, ctx):
        seed_menu(MENU)
        for _ in range(8):  # selection is random among top scorers — try repeatedly
            body = quick_meal(ctx, goal="fat_loss", budget=300.0).json()
            names = " ".join(it["product_name"].lower() for it in body["meal_items"])
            assert "rice" not in names and "bread" not in names, names
            assert body["meal_items"]

    def test_veg_pref_excludes_non_veg(self, ctx):
        seed_menu(MENU)
        for _ in range(8):
            body = quick_meal(ctx, goal="muscle_gain", budget=300.0, diet="veg").json()
            assert body["meal_items"]
            for it in body["meal_items"]:
                assert it["diet_type"] != "non-veg", it["product_name"]


class TestStockAndDegraded:
    def test_stock_cap_respected(self, ctx):
        seed_menu([
            product("Grilled Chicken", "non-veg", 60, 150, 27, 0, 4, stock=150),
            product("Paneer Tikka", "veg", 50, 200, 18, 5, 12, stock=150),
            product("Green Salad", "veg", 30, 40, 2, 6, 0.5, stock=150),
            product("Brown Rice", "veg", 20, 130, 3, 28, 1, stock=150),
        ])
        # Budget far beyond what the stock allows — every item must stay capped.
        body = quick_meal(ctx, goal="muscle_gain", budget=2000.0).json()
        assert body["meal_items"]
        for it in body["meal_items"]:
            assert it["grams"] <= it["max_stock"] - 5, it

    def test_two_product_menu_degrades(self, ctx):
        seed_menu(MENU[:2])
        body = quick_meal(ctx, goal="maintenance", budget=300.0).json()
        assert 1 <= len(body["meal_items"]) <= 2
        for it in body["meal_items"]:
            assert ITEM_KEYS <= set(it.keys())

    def test_empty_menu_empty_response(self, ctx):
        seed_menu([])
        body = quick_meal(ctx).json()
        assert body == {"meal_items": [], "summary": "No products available for your preference.", "totals": {}}
