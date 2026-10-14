"""
Core infrastructure tests — currently covers production settings validation.
"""

import importlib
import os
import sys
from unittest import mock

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

_PRODUCTION_MODULE = "config.settings.production"

# Base env that satisfies all production requirements — individual tests
# override specific keys to exercise each validation path.
# JWT_SIGNING_KEY must be present and must differ from DJANGO_SECRET_KEY.
_VALID_ENV = {
    "DJANGO_SECRET_KEY": "x" * 50,
    "JWT_SIGNING_KEY": "y" * 50,
    "DJANGO_ALLOWED_HOSTS": "example.com",
    "CORS_ALLOWED_ORIGINS": "",
}


def _load_production(extra_env: dict):
    """
    Force-reload the production settings module under a controlled environment.

    The module is removed from sys.modules before each load so the validation
    code in the module body runs fresh.  base.py is intentionally kept in
    sys.modules (it never needs to be re-evaluated — we only test the
    production-specific checks).
    """
    sys.modules.pop(_PRODUCTION_MODULE, None)
    env = {**_VALID_ENV, **extra_env}
    with mock.patch.dict(os.environ, env):
        return importlib.import_module(_PRODUCTION_MODULE)


class ProductionSettingsValidationTests(SimpleTestCase):
    """
    Verify that production.py raises ImproperlyConfigured for unsafe or
    missing configuration values, and loads cleanly when valid values are
    supplied.
    """

    def tearDown(self):
        # Always evict the module so one test's cached import doesn't hide
        # another test's validation failure.
        sys.modules.pop(_PRODUCTION_MODULE, None)

    # ---- SECRET_KEY ----

    def test_missing_secret_key_raises(self):
        """Empty DJANGO_SECRET_KEY must be rejected."""
        with self.assertRaises(ImproperlyConfigured):
            _load_production({"DJANGO_SECRET_KEY": ""})

    def test_unsafe_default_key_raises(self):
        """The base.py default placeholder must be rejected."""
        with self.assertRaises(ImproperlyConfigured):
            _load_production(
                {"DJANGO_SECRET_KEY": "unsafe-default-key-change-in-production"}
            )

    def test_dotenv_placeholder_key_raises(self):
        """The .env.example placeholder must be rejected."""
        with self.assertRaises(ImproperlyConfigured):
            _load_production({"DJANGO_SECRET_KEY": "change-me-before-production"})

    # ---- ALLOWED_HOSTS ----

    def test_empty_allowed_hosts_raises(self):
        """Empty DJANGO_ALLOWED_HOSTS must be rejected."""
        with self.assertRaises(ImproperlyConfigured):
            _load_production({"DJANGO_ALLOWED_HOSTS": ""})

    def test_whitespace_only_allowed_hosts_raises(self):
        """Whitespace-only DJANGO_ALLOWED_HOSTS must be rejected."""
        with self.assertRaises(ImproperlyConfigured):
            _load_production({"DJANGO_ALLOWED_HOSTS": "   "})

    # ---- valid configuration ----

    def test_valid_config_loads_cleanly(self):
        """A fully valid environment must load without error."""
        mod = _load_production({})
        self.assertFalse(mod.DEBUG)

    def test_allowed_hosts_parsed_correctly(self):
        """Comma-separated DJANGO_ALLOWED_HOSTS is split into a list."""
        mod = _load_production({"DJANGO_ALLOWED_HOSTS": "example.com,www.example.com"})
        self.assertIn("example.com", mod.ALLOWED_HOSTS)
        self.assertIn("www.example.com", mod.ALLOWED_HOSTS)

    def test_jwt_signing_key_applied_to_simple_jwt(self):
        """SIMPLE_JWT signing key must equal JWT_SIGNING_KEY, not DJANGO_SECRET_KEY."""
        jwt_key = "jwt-key-" + "z" * 42
        mod = _load_production({"JWT_SIGNING_KEY": jwt_key})
        self.assertEqual(mod.SIMPLE_JWT["SIGNING_KEY"], jwt_key)
        # Must NOT equal DJANGO_SECRET_KEY
        self.assertNotEqual(mod.SIMPLE_JWT["SIGNING_KEY"], mod.SECRET_KEY)

    def test_simple_jwt_dict_is_new_object(self):
        """
        production.py must not mutate base.py's SIMPLE_JWT dict.
        Mutation would corrupt the signing key for any other settings module
        sharing the same Python process (e.g. test.py).
        """
        import config.settings.base as base_settings

        original_key = base_settings.SIMPLE_JWT["SIGNING_KEY"]
        _load_production({})
        # base module's dict must be unchanged
        self.assertEqual(base_settings.SIMPLE_JWT["SIGNING_KEY"], original_key)

    # ---- HTTPS / security flags ----

    def test_ssl_redirect_enabled(self):
        mod = _load_production({})
        self.assertTrue(mod.SECURE_SSL_REDIRECT)

    def test_secure_cookies_enabled(self):
        mod = _load_production({})
        self.assertTrue(mod.SESSION_COOKIE_SECURE)
        self.assertTrue(mod.CSRF_COOKIE_SECURE)

    def test_hsts_configured(self):
        mod = _load_production({})
        self.assertGreaterEqual(mod.SECURE_HSTS_SECONDS, 31_536_000)
        self.assertTrue(mod.SECURE_HSTS_INCLUDE_SUBDOMAINS)

    def test_cors_allow_all_origins_is_false(self):
        mod = _load_production({})
        self.assertFalse(mod.CORS_ALLOW_ALL_ORIGINS)

    def test_cors_origins_parsed_from_env(self):
        mod = _load_production(
            {"CORS_ALLOWED_ORIGINS": "https://app.example.com,https://www.example.com"}
        )
        self.assertIn("https://app.example.com", mod.CORS_ALLOWED_ORIGINS)
        self.assertIn("https://www.example.com", mod.CORS_ALLOWED_ORIGINS)

    def test_cors_empty_env_gives_empty_list(self):
        mod = _load_production({"CORS_ALLOWED_ORIGINS": ""})
        self.assertEqual(mod.CORS_ALLOWED_ORIGINS, [])

    # ---- JWT_SIGNING_KEY ----

    def test_missing_jwt_signing_key_raises(self):
        """Empty JWT_SIGNING_KEY must be rejected."""
        with self.assertRaises(ImproperlyConfigured):
            _load_production({"JWT_SIGNING_KEY": ""})

    def test_placeholder_jwt_signing_key_raises(self):
        """Known placeholder values must be rejected for JWT_SIGNING_KEY."""
        for placeholder in (
            "unsafe-default-key-change-in-production",
            "change-me-before-production",
        ):
            with self.subTest(placeholder=placeholder):
                with self.assertRaises(ImproperlyConfigured):
                    _load_production({"JWT_SIGNING_KEY": placeholder})

    def test_jwt_signing_key_equal_to_secret_key_raises(self):
        """JWT_SIGNING_KEY must differ from DJANGO_SECRET_KEY."""
        shared = "a" * 50
        with self.assertRaises(ImproperlyConfigured):
            _load_production({"DJANGO_SECRET_KEY": shared, "JWT_SIGNING_KEY": shared})

    def test_jwt_signing_key_not_in_simple_jwt_equals_secret_key(self):
        """SIMPLE_JWT['SIGNING_KEY'] must not equal SECRET_KEY in production."""
        mod = _load_production({})
        self.assertNotEqual(mod.SIMPLE_JWT["SIGNING_KEY"], mod.SECRET_KEY)

    # ---- access token lifetime ----

    def test_access_token_lifetime_is_15_minutes(self):
        """Access token lifetime must be 15 minutes in production."""
        from datetime import timedelta
        mod = _load_production({})
        self.assertEqual(mod.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"], timedelta(minutes=15))
