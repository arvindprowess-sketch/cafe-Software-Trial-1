"""Round 4 FIX 3 — cart free-delivery tiers (Option A: remove fake tiers).

In-process (mongomock). Verifies:
  - /cart/quote returns exactly ONE tier, the free-delivery one, driven by the
    admin free_delivery_threshold setting (no ₹50/₹100/₹150 "OFF" tiers).
  - next_tier surfaces the real threshold below it, and is None once unlocked.
  - changing the setting moves both the tier threshold AND the free-delivery
    cutoff together (they can't drift apart).

Run:  pytest backend/tests/test_cart_tiers_round4.py
"""
import os
import asyncio

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "round4_tiers_test")
os.environ.setdefault("JWT_SECRET", "test_secret_key_at_least_32_chars_long_xx")

import pytest
import httpx
from mongomock_motor import AsyncMongoMockClient

import server
from _authv2 import hq_token


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


class Ctx:
    pass


@pytest.fixture(scope="module")
def ctx():
    server.client = AsyncMongoMockClient()
    server.db = server.client[os.environ["DB_NAME"]]
    server._invalidate_settings_cache()
    transport = httpx.ASGITransport(app=server.app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")

    async def build():
        c = Ctx()
        c.client = client
        await client.post("/api/seed")
        c.hq = await hq_token()
        c.store = (await client.post("/api/stores", json={"name": "A", "code": "AAA"},
                                     headers=auth(c.hq))).json()["store_id"]
        c.product = (await client.get("/api/products")).json()[0]
        return c

    c = run(build())
    yield c
    run(client.aclose())


async def quote_at(ctx, target_subtotal, order_type="delivery"):
    cost = ctx.product["cost_per_100g"]
    grams = max(10, round(target_subtotal / cost * 100))
    body = {"items": [{"product_id": ctx.product["id"], "grams": grams,
                       "cost_per_100g": cost}],
            "order_type": order_type, "store_id": ctx.store}
    return (await ctx.client.post("/api/cart/quote", json=body, headers=auth(ctx.hq))).json()


async def set_threshold(ctx, value):
    r = await ctx.client.put("/api/admin/settings", json={"free_delivery_threshold": value},
                             headers=auth(ctx.hq))
    assert r.status_code == 200, r.text


def test_single_setting_driven_tier_no_fake_offs(ctx):
    async def go():
        q = await quote_at(ctx, 100)  # below default threshold
        thr = q["free_delivery_threshold"]
        assert len(q["tiers"]) == 1, q["tiers"]
        assert q["tiers"][0]["label"] == "Free Delivery"
        assert q["tiers"][0]["threshold"] == thr
        # no fake spend tiers anywhere
        assert not any("OFF" in (t["label"] or "") for t in q["tiers"])
        # below threshold -> nudge points at the real cutoff
        assert q["next_tier"] and q["next_tier"]["threshold"] == thr
        assert q["free_delivery"] is False
    run(go())


def test_next_tier_none_once_unlocked(ctx):
    async def go():
        thr = (await quote_at(ctx, 100))["free_delivery_threshold"]
        q = await quote_at(ctx, thr * 1.5)
        assert q["free_delivery"] is True
        assert q["next_tier"] is None
    run(go())


def test_threshold_change_moves_tier_and_cutoff_together(ctx):
    async def go():
        await set_threshold(ctx, 250)
        try:
            below = await quote_at(ctx, 200)
            assert below["free_delivery_threshold"] == 250
            assert below["next_tier"]["threshold"] == 250
            assert below["free_delivery"] is False
            above = await quote_at(ctx, 300)
            assert above["free_delivery"] is True and above["next_tier"] is None
        finally:
            await set_threshold(ctx, 300)  # restore for isolation
    run(go())
