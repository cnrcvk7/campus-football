"""
Test settings — uses SQLite in-memory so tests run without a live PostgreSQL instance.
Usage: python manage.py test --settings=config.settings.test
"""
from .base import *  # noqa: F401, F403

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
