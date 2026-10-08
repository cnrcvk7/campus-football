#!/usr/bin/env python
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the project root (one level above backend/)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Make sure it is installed and available on your "
            "PYTHONPATH environment variable. Did you activate your virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
