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
