from .base import *  # noqa: F401, F403

DEBUG = os.environ.get("DJANGO_DEBUG", "True") == "True"  # noqa: F405

# ---------------------------------------------------------------------------
# CORS — allow the Vite dev server during local development
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# ---------------------------------------------------------------------------
# Logging — show SQL queries in the console during development
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}
