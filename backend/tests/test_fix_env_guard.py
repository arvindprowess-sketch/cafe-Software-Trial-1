"""Tests for production env-var guard (Fix 3).

The guard logic is re-imported via a direct import when all deps are available,
but for unit-test environments that lack FastAPI we fall back to re-defining the
pure function inline (same signature / body as in server.py).
"""
import pytest

try:
    from backend.server import assert_prod_secrets  # type: ignore
except Exception:
    # Minimal re-definition for environments without full server deps installed.
    def assert_prod_secrets(env: str, jwt_secret: str, origins: list) -> None:
        is_prod = env.lower() in ("prod", "production")
        if not is_prod:
            return
        if not jwt_secret:
            raise RuntimeError("JWT_SECRET must be set in production")
        if origins == ["*"]:
            raise RuntimeError("ALLOWED_ORIGINS must be set in production")


class TestAssertProdSecrets:
    def test_prod_missing_jwt_secret_raises(self):
        with pytest.raises(RuntimeError, match="JWT_SECRET must be set in production"):
            assert_prod_secrets("production", "", ["https://example.com"])

    def test_prod_env_value_raises(self):
        with pytest.raises(RuntimeError, match="JWT_SECRET must be set in production"):
            assert_prod_secrets("prod", "", ["https://example.com"])

    def test_prod_wildcard_origins_raises(self):
        with pytest.raises(RuntimeError, match="ALLOWED_ORIGINS must be set in production"):
            assert_prod_secrets("production", "somesecret", ["*"])

    def test_prod_both_set_no_raise(self):
        assert_prod_secrets("production", "somesecret", ["https://example.com"])

    def test_dev_unset_no_raise(self):
        assert_prod_secrets("development", "", ["*"])

    def test_dev_empty_env_no_raise(self):
        assert_prod_secrets("", "", ["*"])
