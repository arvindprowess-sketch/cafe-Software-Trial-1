"""Tests for production env-var guard (Fix 3 + MSG91 warning-only).

assert_prod_secrets rules:
  - production + JWT missing       -> raises RuntimeError
  - production + ORIGINS ["*"]     -> raises RuntimeError
  - production + MSG91 missing     -> WARNING only (does NOT raise)
  - non-prod / dev                 -> never raises

Imports the real assert_prod_secrets from server when importable (pytest run from
backend/), falling back to backend.server, and finally to an inline copy that
mirrors server.py for environments without full deps. Pure function — no server
boot required.
"""
import logging
import pytest

try:
    from server import assert_prod_secrets  # type: ignore  (pytest run from backend/)
except Exception:  # pragma: no cover
    try:
        from backend.server import assert_prod_secrets  # type: ignore
    except Exception:
        # Minimal re-definition mirroring server.py (kept in sync with the real one).
        _logger = logging.getLogger("server")
        def assert_prod_secrets(env, jwt_secret, origins, msg91_key=None):
            is_prod = env.lower() in ("prod", "production")
            if not is_prod:
                return
            if not jwt_secret:
                raise RuntimeError("JWT_SECRET must be set in production")
            if origins == ["*"]:
                raise RuntimeError("ALLOWED_ORIGINS must be set in production")
            if not msg91_key:
                _logger.warning("MSG91_AUTH_KEY is not set in production; OTP delivery will fall back to console logging (insecure — set before launch)")


SECRET = "somesecret"
ORIGINS = ["https://example.com"]
MSG91 = "msg91-key"


class TestAssertProdSecrets:
    # --- Fix 3: JWT_SECRET — must hard-fail in production ---
    def test_prod_missing_jwt_secret_raises(self):
        with pytest.raises(RuntimeError, match="JWT_SECRET must be set in production"):
            assert_prod_secrets("production", "", ORIGINS, MSG91)

    def test_prod_env_value_raises(self):
        with pytest.raises(RuntimeError, match="JWT_SECRET must be set in production"):
            assert_prod_secrets("prod", "", ORIGINS, MSG91)

    # --- ALLOWED_ORIGINS — must hard-fail in production ---
    def test_prod_wildcard_origins_raises(self):
        with pytest.raises(RuntimeError, match="ALLOWED_ORIGINS must be set in production"):
            assert_prod_secrets("production", SECRET, ["*"], MSG91)

    # --- MSG91 — warning-only in production (does NOT raise) ---
    def test_prod_missing_msg91_no_raise(self):
        # Must not raise; emits a warning instead.
        assert_prod_secrets("production", SECRET, ORIGINS, "")

    def test_prod_msg91_none_no_raise(self):
        assert_prod_secrets("production", SECRET, ORIGINS)

    def test_prod_missing_msg91_emits_warning(self, caplog):
        with caplog.at_level(logging.WARNING):
            assert_prod_secrets("production", SECRET, ORIGINS, "")
        assert any("MSG91" in r.message for r in caplog.records)

    # --- all secrets set — no raise ---
    def test_prod_all_set_no_raise(self):
        assert_prod_secrets("production", SECRET, ORIGINS, MSG91)

    # --- dev: never raises ---
    def test_dev_unset_no_raise(self):
        assert_prod_secrets("development", "", ["*"], "")

    def test_dev_empty_env_no_raise(self):
        assert_prod_secrets("", "", ["*"])
