"""
Test settings — uses PostgreSQL when the project's database env vars are set,
otherwise falls back to SQLite in-memory so local runs work without Postgres.

Usage:
    python manage.py test --settings=config.settings.test
"""
import os

from .base import *  # noqa: F401, F403

SECRET_KEY = "django-insecure-test-only-campus-football-secret-key-for-ci-only-00000"

# base.py sets SIMPLE_JWT["SIGNING_KEY"] = SECRET_KEY at import time, so we
# must update it explicitly here after overriding SECRET_KEY.
SIMPLE_JWT["SIGNING_KEY"] = SECRET_KEY  # noqa: F405

DEBUG = False

# Use PostgreSQL when POSTGRES_HOST points to a local address (CI or explicit
# local Postgres), not when it is the Docker-internal hostname loaded from .env.
# This keeps ``python manage.py test --settings=config.settings.test`` using
# fast SQLite by default, while CI (which sets POSTGRES_HOST=localhost) and
# explicit overrides get real PostgreSQL.
_pg_host = os.environ.get("POSTGRES_HOST", "")
_use_pg = _pg_host in ("localhost", "127.0.0.1") and os.environ.get("POSTGRES_DB")

if _use_pg:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("POSTGRES_DB", "campus_football_test"),
            "USER": os.environ.get("POSTGRES_USER", "postgres"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "postgres"),
            "HOST": _pg_host,
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }

# Silence password hashing to speed up tests
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# Use a no-op cache by default so throttles are inactive in all non-throttle
# tests.  Throttle-specific test classes override this with @override_settings
# to use a real LocMemCache for their isolated assertions.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.dummy.DummyCache",
    }
}
