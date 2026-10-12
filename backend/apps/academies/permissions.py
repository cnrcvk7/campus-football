"""
Academy-domain permission helpers.
"""

from rest_framework.exceptions import PermissionDenied

from apps.users.models import User


def require_academy_admin(request) -> None:
    """
    Raise PermissionDenied if the requesting user is not ACADEMY_ADMIN.

    Only academy admins may create or modify academy records.  Coaches may
    read academies but cannot create or patch them.

    NOTE: The current data model has no User→Academy ownership link, so this
    check enforces role-level authorization only.  Per-academy object
    authorization (preventing an ACADEMY_ADMIN from modifying academies they
    do not manage) requires an AcademyStaffMembership model — a future step.
    """
    if request.user.role != User.Role.ACADEMY_ADMIN:
        raise PermissionDenied(
            "Only academy admins can create or modify academies."
        )
