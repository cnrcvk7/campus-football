"""
Local SQLite settings — useful for running management commands (seed_skills, etc.)
without a live PostgreSQL instance.

Usage:
    python manage.py migrate --settings=config.settings.local_sqlite
    python manage.py seed_skills --settings=config.settings.local_sqlite
"""

from .base import *  # noqa: F401, F403

DEBUG = True

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "local.sqlite3",
    }
}

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
