"""
Team-domain permission helpers.
"""

from rest_framework.exceptions import PermissionDenied

from apps.users.models import User


def require_coach_or_admin(request) -> None:
    """
    Raise PermissionDenied if the requesting user is not COACH or ACADEMY_ADMIN.

    Call this at the start of any view method that creates or updates team
    records.

    NOTE: The current data model has no User→Academy ownership link, so a
    coach can create teams under any academy.  Per-academy team authorization
    requires an AcademyStaffMembership model — a future step.
    """
    if request.user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        raise PermissionDenied(
            "Only coaches and academy admins can manage teams."
        )
