"""
Development-domain permission helpers.

Player-scoped development endpoints use `get_player_and_check_access` to
enforce the rule that a PLAYER user can only access their own data.
"""

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from apps.users.models import User


def get_player_and_check_access(request, player_pk, require_write: bool = False):
    """
    Fetch the Player identified by `player_pk` and verify the requesting
    user is allowed to access it.

    Access rules
    ────────────
    PLAYER       — can read their own player's data only.
                   Writing (create/update) is never permitted for this role.
    COACH        — can read and write any player's data.
    ACADEMY_ADMIN— can read and write any player's data.
    PARENT       — read-only access to explicitly linked players only (via ParentPlayerLink).

    Returns the Player instance on success.
    Raises Http404 if the player does not exist.
    Raises PermissionDenied if the user lacks access.
    """
    from apps.players.models import Player

    player = get_object_or_404(Player, pk=player_pk)
    user = request.user

    if user.role == User.Role.PLAYER:
        # Players may only see their own development data.
        if player.user_id != user.pk:
            raise PermissionDenied("You can only access your own development data.")
        if require_write:
            raise PermissionDenied("Players cannot create or modify development data.")

    elif user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        pass  # full read/write access

    elif user.role == User.Role.PARENT:
        from apps.users.models import ParentPlayerLink
        if not ParentPlayerLink.objects.filter(parent=user, player=player).exists():
            raise PermissionDenied("You are not authorized to access this player's development data.")
        if require_write:
            raise PermissionDenied("Parents cannot create or modify development data.")

    else:
        raise PermissionDenied("Insufficient permissions to access development data.")

    return player
