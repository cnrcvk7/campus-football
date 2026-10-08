"""
Role-based permission classes for Campus Football.

All permissions check server-side role only — the client cannot influence
which role is used.

Usage in a view:
    permission_classes = [IsAcademyAdmin]

Usage with multiple allowed roles:
    permission_classes = [IsCoach | IsAcademyAdmin]

IsAuthenticated from rest_framework.permissions is the base building block;
all role-specific classes require authentication implicitly because
request.user.is_authenticated is always False for anonymous users.

Academy-scoped permissions (e.g. "is a coach OF this specific academy")
will be added as object-level permissions when Coach and AcademyAdmin
domain models are implemented.
"""

from rest_framework.permissions import BasePermission

from .models import User


class IsPlayer(BasePermission):
    """Grants access to users with the PLAYER role."""

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.PLAYER
        )


class IsParent(BasePermission):
    """Grants access to users with the PARENT role."""

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.PARENT
        )


class IsCoach(BasePermission):
    """Grants access to users with the COACH role."""

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.COACH
        )


class IsAcademyAdmin(BasePermission):
    """Grants access to users with the ACADEMY_ADMIN role."""

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.ACADEMY_ADMIN
        )
