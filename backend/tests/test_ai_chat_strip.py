"""Regression: AI chat must never leak the structured action JSON into the chat
bubble, regardless of how the LLM formats it (fenced, bare, malformed, none)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server import strip_action_json  # noqa: E402


def _has_leak(msg: str) -> bool:
    return ("{" in msg) or ("}" in msg) or ("```" in msg)


def test_fenced_json_block_is_stripped():
    raw = (
        "For a cutting meal:\n- Chicken Breast 200g\n\n"
        "```json\n{\"add\": [{\"name\": \"Chicken Breast\", \"grams\": 200}]}\n```"
    )
    msg, actions = strip_action_json(raw)
    assert not _has_leak(msg)
    assert actions and actions["add"][0]["name"] == "Chicken Breast"


def test_bare_json_on_last_line():
    raw = "Try this combo!\n{\"add\": [{\"name\": \"Dal\", \"grams\": 150}]}"
    msg, actions = strip_action_json(raw)
    assert msg == "Try this combo!"
    assert actions["add"][0]["grams"] == 150


def test_checkout_action():
    raw = "Sure, taking you to checkout.\n{\"action\": \"checkout\"}"
    msg, actions = strip_action_json(raw)
    assert not _has_leak(msg)
    assert actions["action"] == "checkout"


def test_json_only_response_gets_fallback_text():
    raw = "{\"add\": [{\"name\": \"Paneer\", \"grams\": 100}]}"
    msg, actions = strip_action_json(raw)
    assert not _has_leak(msg)
    assert msg  # non-empty friendly fallback
    assert actions["add"][0]["name"] == "Paneer"


def test_malformed_json_still_stripped():
    raw = "Here you go:\n{\"add\": [{\"name\": \"Eggs\" grams: 100]}"
    msg, actions = strip_action_json(raw)
    assert not _has_leak(msg)
    assert actions is None  # parse failed -> deterministic fallback handles items


def test_plain_advice_unchanged():
    raw = "Just eat more protein and veggies, you are doing great!"
    msg, actions = strip_action_json(raw)
    assert msg == raw
    assert actions is None
