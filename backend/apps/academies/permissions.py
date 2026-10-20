"""
Academy-domain permission helpers.

Role-only helpers (require_academy_admin) enforce User.role.
Object-level helpers (require_staff_of_academy, require_academy_admin_of_academy)
enforce both User.role AND an AcademyStaffMembership row for the target academy.

All helpers assume DRF's global IsAuthenticated has already run — they do not
handle anonymous users.  On failure every helper raises PermissionDenied,
which DRF serialises as HTTP 403.
"""

from rest_framework.exceptions import PermissionDenied

from apps.users.models import User
from .models import AcademyStaffMembership


def require_coach_or_admin(request) -> None:
    """
    Raise PermissionDenied if the requesting user is not COACH or ACADEMY_ADMIN.

    Role-only check — use this to gate read endpoints that should be invisible
    to PLAYER and PARENT roles.
    """
    if request.user.is_superuser:
        return
    if request.user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        raise PermissionDenied(
            "Only coaches and academy admins can access this resource."
        )


def require_academy_admin(request) -> None:
    """
    Raise PermissionDenied if the requesting user is not ACADEMY_ADMIN.

    Only academy admins may create or modify academy records.  Coaches may
    read academies but cannot create or patch them.

    NOTE: This is a role-only check.  Use require_academy_admin_of_academy()
    when the target academy is known to also enforce membership.
    """
    if request.user.is_superuser:
        return
    if request.user.role != User.Role.ACADEMY_ADMIN:
        raise PermissionDenied(
            "Only academy admins can create or modify academies."
        )


# ---------------------------------------------------------------------------
# Object-level helpers (role + AcademyStaffMembership)
# ---------------------------------------------------------------------------

def get_user_academy_ids(user) -> frozenset:
    """
    Return the frozenset of Academy PKs the user is explicitly linked to
    as staff via AcademyStaffMembership.

    Returns an empty frozenset for users with no memberships.
    Useful for bulk filtering queries in views.
    """
    return frozenset(
        AcademyStaffMembership.objects
        .filter(user=user)
        .values_list("academy_id", flat=True)
    )


def require_staff_of_academy(user, academy_id) -> None:
    """
    Raise PermissionDenied unless the user is a COACH or ACADEMY_ADMIN
    with an AcademyStaffMembership for the specified academy.

    Two-stage check:
      1. Role must be COACH or ACADEMY_ADMIN.
      2. An AcademyStaffMembership row must exist for (user, academy_id).

    A non-existent academy_id is treated identically to a missing membership
    (no membership row can exist for a non-existent academy), so the caller
    receives 403, not 404 — this avoids leaking information about which
    academy IDs exist to unauthorised users.

    Django superusers bypass both checks.
    """
    if user.is_superuser:
        return
    if user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        raise PermissionDenied(
            "Only coaches and academy admins can manage resources in this academy."
        )
    if not AcademyStaffMembership.objects.filter(user=user, academy_id=academy_id).exists():
        raise PermissionDenied(
            "You are not a staff member of this academy."
        )


def require_academy_admin_of_academy(user, academy_id) -> None:
    """
    Raise PermissionDenied unless the user is an ACADEMY_ADMIN with an
    AcademyStaffMembership for the specified academy.

    Two-stage check:
      1. Role must be ACADEMY_ADMIN.
      2. An AcademyStaffMembership row must exist for (user, academy_id).

    COACH users are intentionally denied even when they hold a membership —
    academy-level administration (creating academies, managing staff) is
    restricted to ACADEMY_ADMIN only.

    Django superusers bypass both checks.
    """
    if user.is_superuser:
        return
    if user.role != User.Role.ACADEMY_ADMIN:
        raise PermissionDenied(
            "Only academy admins can perform this action."
        )
    if not AcademyStaffMembership.objects.filter(user=user, academy_id=academy_id).exists():
        raise PermissionDenied(
            "You are not an academy admin of this academy."
        )
