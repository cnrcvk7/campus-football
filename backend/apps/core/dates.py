"""
Shared date-range helpers for player-scoped list and report endpoints.

Lives in core so that development, matches and training views can share it
without importing each other's view modules.
"""

import calendar
from datetime import date

from rest_framework.exceptions import ValidationError


def month_bounds(year: int, month: int) -> tuple[date, date]:
    """Return the first and last calendar day of the given month (inclusive)."""
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def get_date_range(request):
    """
    Parse ?year=YYYY&month=MM from request.
    Returns (start_date, end_date) tuple as date objects, or (None, None) if not provided.
    Validates: year 2000-2100, month 1-12.
    Raises ValidationError if invalid.
    """
    year = request.query_params.get('year')
    month = request.query_params.get('month')
    if not year and not month:
        return None, None
    if not year or not month:
        raise ValidationError("Both 'year' and 'month' parameters are required.")
    try:
        year = int(year)
        month = int(month)
    except ValueError:
        raise ValidationError("'year' and 'month' must be integers.")
    if not (2000 <= year <= 2100) or not (1 <= month <= 12):
        raise ValidationError("Invalid year or month.")
    return month_bounds(year, month)
