"""
Player-domain permission helpers.

Follows the same pattern as:
  apps.development.permissions.get_player_and_check_access
  apps.matches.permissions.get_player_and_check_match_access
  apps.training.permissions.get_player_and_check_training_access
"""

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from apps.users.models import User


def require_coach_or_admin(request) -> None:
    """
    Raise PermissionDenied if the requesting user is not COACH or ACADEMY_ADMIN.

    Call this at the start of any view method that creates, updates, or deletes
    player data (player records, academy memberships, team memberships).
    """
    user = request.user
    if user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        raise PermissionDenied(
            "Only coaches and academy admins can manage player data."
        )


def require_staff_affiliated_with_player(user, player) -> None:
    """
    Raise PermissionDenied unless the user is staff of at least one academy
    where the player holds an **active** membership.

    This is used for write operations (PATCH, PUT, DELETE on players).
    Players who have left an academy remain *visible* to that academy's staff
    (via get_queryset filtering) but are no longer *writable* — only staff of
    an academy with an ACTIVE PlayerAcademyMembership may modify the player.

    Players with no active academy memberships are editable only by superusers.

    Assumes a role check (require_coach_or_admin or equivalent) has already
    passed — this helper only enforces the object-level academy scope.
    """
    if user.is_superuser:
        return

    from apps.academies.models import PlayerAcademyMembership
    from apps.academies.permissions import get_user_academy_ids

    active_academy_ids = frozenset(
        PlayerAcademyMembership.objects.filter(
            player=player,
            status=PlayerAcademyMembership.Status.ACTIVE,
        )
        .values_list("academy_id", flat=True)
    )
    if not active_academy_ids:
        raise PermissionDenied(
            "This player has no active academy memberships and can only be "
            "managed by a superuser."
        )
    user_academy_ids = get_user_academy_ids(user)
    if not (user_academy_ids & active_academy_ids):
        raise PermissionDenied(
            "You are not a staff member of any academy where this player is "
            "currently active."
        )


def get_player_and_check_read_access(request, player_pk):
    """
    Fetch the Player identified by `player_pk` and verify read access.

    Access rules
    ────────────
    PLAYER        — can read their own player record only.
    COACH         — can read any player record.
    ACADEMY_ADMIN — can read any player record.
    PARENT        — read-only access to explicitly linked players only
                    (via ParentPlayerLink).  Role alone is not sufficient.

    Returns the Player instance on success.
    Raises Http404    if the player does not exist.
    Raises PermissionDenied if the requesting user is not authorised.
    """
    from apps.players.models import Player

    player = get_object_or_404(Player, pk=player_pk)
    user = request.user

    if user.role == User.Role.PLAYER:
        if player.user_id != user.pk:
            raise PermissionDenied("You can only access your own player record.")

    elif user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        pass  # full read access

    elif user.role == User.Role.PARENT:
        from apps.users.models import ParentPlayerLink
        if not ParentPlayerLink.objects.filter(parent=user, player=player).exists():
            raise PermissionDenied(
                "You are not authorised to access this player's data."
            )

    else:
        raise PermissionDenied("Insufficient permissions to access player data.")

    return player
