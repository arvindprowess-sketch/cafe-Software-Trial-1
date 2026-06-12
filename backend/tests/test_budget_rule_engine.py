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
            totals = body["totals"]
            # never overspends; the gap only stays open when the kcal ceiling or
            # the per-item portion caps bind (budget is no longer force-stuffed)
            assert totals["price"] <= budget + 0.55, (budget, totals)
            assert body["budget_unspent"] >= 0
            if budget - totals["price"] > 0.55:
                capped = all(it["grams"] >= 250 for it in body["meal_items"])
                assert totals["calories"] >= body["kcal_ceiling"] * 0.9 or capped, (budget, body)


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


class TestKcalCeilingHelper:
    """Unit tests for _meal_kcal_ceiling — pure parsing, no LLM, no HTTP."""

    def test_parses_upper_bound_of_band_string(self):
        assert server._meal_kcal_ceiling("700-1000 kcal per meal") == 1000.0

    def test_goal_key_lookup(self):
        assert server._meal_kcal_ceiling("muscle_gain") == 1000.0
        assert server._meal_kcal_ceiling("fat_loss") == 600.0
        assert server._meal_kcal_ceiling("lean_bulk") == 850.0

    def test_missing_goal_falls_back_to_maintenance(self):
        assert server._meal_kcal_ceiling("no_such_goal") == server._meal_kcal_ceiling("maintenance") == 700.0
        assert server._meal_kcal_ceiling(None) == 700.0

    def test_unparseable_band_defaults_900(self, monkeypatch):
        monkeypatch.setitem(server.GOAL_GUIDELINES, "weird", {"target_calories": "ad libitum"})
        assert server._meal_kcal_ceiling("weird") == 900.0


class TestPortionAndKcalCaps:
    """Per-meal kcal ceiling + per-item gram caps + cap-aware budget fill."""

    GLOBAL_GRAM_CAP = max(server.GRAM_CAP.values())  # 300 — no slot can exceed this

    def test_muscle_gain_cheap_base_capped(self, ctx):
        # Cheap, high-stock base must not balloon; ceiling(=1000) and budget hold.
        seed_menu(MENU + [product("White Rice", "veg", 10, 130, 2.5, 28, 0.5, stock=100000)])
        for _ in range(5):
            body = quick_meal(ctx, goal="muscle_gain", budget=500.0).json()
            assert body["meal_items"]
            for it in body["meal_items"]:
                assert it["grams"] <= self.GLOBAL_GRAM_CAP, it
            assert body["kcal_ceiling"] == 1000.0
            assert body["totals"]["calories"] <= 1000.0, body["totals"]
            assert body["totals"]["price"] <= 500.0 + 0.55, body["totals"]

    def test_fat_loss_ceiling_beats_budget(self, ctx):
        seed_menu(MENU)
        for _ in range(5):
            body = quick_meal(ctx, goal="fat_loss", budget=500.0).json()
            assert body["meal_items"]
            assert body["kcal_ceiling"] == 600.0
            assert body["totals"]["calories"] <= 600.0, body["totals"]
            assert body["budget_unspent"] > 0, body  # budget NOT force-spent

    def test_lean_bulk_ceiling_parses_850(self, ctx):
        seed_menu(MENU)
        body = quick_meal(ctx, goal="lean_bulk", budget=800.0).json()
        assert body["kcal_ceiling"] == 850.0
        assert body["totals"]["calories"] <= 850.0, body["totals"]

    def test_veg_only_caps_applied(self, ctx):
        seed_menu(MENU)
        for _ in range(5):
            body = quick_meal(ctx, goal="muscle_gain", budget=500.0, diet="veg").json()
            assert len(body["meal_items"]) >= 1
            for it in body["meal_items"]:
                assert it["diet_type"] != "non-veg", it["product_name"]
                # protein-slot cap is 300g and no slot allows more
                assert it["grams"] <= self.GLOBAL_GRAM_CAP, it
            assert body["totals"]["calories"] <= body["kcal_ceiling"]

    def test_tiny_budget_still_valid(self, ctx):
        # Budget so low only one item really fits — min 10g, no crash.
        seed_menu([product("Grilled Chicken", "non-veg", 60, 150, 27, 0, 4)])
        body = quick_meal(ctx, goal="maintenance", budget=15.0).json()
        assert len(body["meal_items"]) >= 1
        for it in body["meal_items"]:
            assert it["grams"] >= 10, it
        assert "budget_unspent" in body and body["budget_unspent"] >= 0

    def test_response_keeps_contract_and_no_slot_leak(self, ctx):
        seed_menu(MENU)
        body = quick_meal(ctx, goal="muscle_gain", budget=400.0).json()
        assert TOP_KEYS <= set(body.keys())
        assert {"kcal_ceiling", "budget_unspent"} <= set(body.keys())
        for it in body["meal_items"]:
            assert ITEM_KEYS <= set(it.keys())
            assert "slot" not in it  # internal field stripped
            assert it["reason"]  # AI disabled -> template language layer still fills it
