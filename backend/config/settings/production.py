"""
Production settings for Campus Football.

Usage:
    DJANGO_SETTINGS_MODULE=config.settings.production

All security-sensitive values MUST be supplied as environment variables.
See docs/PRODUCTION_DEPLOY.md for the full list and how to generate them.
"""

import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401, F403

# ---------------------------------------------------------------------------
# Debug — hard off in production
# ---------------------------------------------------------------------------
DEBUG = False

# ---------------------------------------------------------------------------
# Secret key — must be set, must not be a known placeholder
# ---------------------------------------------------------------------------
_KNOWN_PLACEHOLDERS = {
    "",
    "unsafe-default-key-change-in-production",
    "change-me-before-production",
}

_SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if _SECRET_KEY in _KNOWN_PLACEHOLDERS:
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be set to a strong, unique value in production. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(50))\""
    )
SECRET_KEY = _SECRET_KEY  # noqa: F811 — intentional override of base.py value

# Re-declare SIMPLE_JWT as a new dict so we don't mutate the base module's
# dict in place.  Mutating in place would affect any other settings module
# that already imported SIMPLE_JWT from base (e.g. test.py in the same
# process).
SIMPLE_JWT = {**SIMPLE_JWT, "SIGNING_KEY": SECRET_KEY}  # noqa: F405

# ---------------------------------------------------------------------------
# Allowed hosts — must be set, must not be empty
# ---------------------------------------------------------------------------
_ALLOWED_HOSTS_RAW = os.environ.get("DJANGO_ALLOWED_HOSTS", "")
if not _ALLOWED_HOSTS_RAW.strip():
    raise ImproperlyConfigured(
        "DJANGO_ALLOWED_HOSTS must be set in production "
        "(e.g. 'example.com,www.example.com')."
    )
ALLOWED_HOSTS = [h.strip() for h in _ALLOWED_HOSTS_RAW.split(",") if h.strip()]  # noqa: F811

# ---------------------------------------------------------------------------
# HTTPS / secure cookie settings
#
# Assumption: a reverse proxy (nginx, Caddy, AWS ALB, etc.) terminates TLS
# and forwards the original protocol via the X-Forwarded-Proto header.
# Only deploy behind a proxy that sets this header safely and strips any
# client-supplied X-Forwarded-Proto values.
# ---------------------------------------------------------------------------
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

SECURE_HSTS_SECONDS = 31_536_000        # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True              # submit to hstspreload.org only after stable

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# ---------------------------------------------------------------------------
# CORS — explicit allow-list; no wildcard origins in production
#
# Set CORS_ALLOWED_ORIGINS to a comma-separated list of scheme+host origins,
# e.g. "https://app.example.com,https://www.example.com"
# An empty value means no cross-origin requests are allowed (safe default).
# ---------------------------------------------------------------------------
_CORS_RAW = os.environ.get("CORS_ALLOWED_ORIGINS", "")
CORS_ALLOWED_ORIGINS = [o.strip() for o in _CORS_RAW.split(",") if o.strip()]  # noqa: F811
CORS_ALLOW_ALL_ORIGINS = False

# ---------------------------------------------------------------------------
# Static files — collected into STATIC_ROOT; serve via nginx or a CDN
# ---------------------------------------------------------------------------
STATIC_ROOT = BASE_DIR / "staticfiles"  # noqa: F405

# ---------------------------------------------------------------------------
# Logging — structured output to stdout/stderr; avoid DEBUG-level noise
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "WARNING",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "django.security": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}
