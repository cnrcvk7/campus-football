"""
Test settings — uses SQLite in-memory so tests run without a live PostgreSQL instance.
Usage: python manage.py test --settings=config.settings.test
"""
from .base import *  # noqa: F401, F403

SECRET_KEY = "django-insecure-test-only-campus-football-secret-key-for-ci-only-00000"

# base.py sets SIMPLE_JWT["SIGNING_KEY"] = SECRET_KEY at import time, so we
# must update it explicitly here after overriding SECRET_KEY.
SIMPLE_JWT["SIGNING_KEY"] = SECRET_KEY  # noqa: F405

DEBUG = False

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
