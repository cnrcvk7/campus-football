"""
Training-domain permission helpers.
"""

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from apps.users.models import User


def require_coach_or_admin(request) -> None:
    """
    Raise PermissionDenied if the requesting user is not COACH or ACADEMY_ADMIN.

    Call this at the start of any view method that manages training data
    (sessions, exercises, attendance).
    """
    user = request.user
    if user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        raise PermissionDenied(
            "Only coaches and academy admins can manage training data."
        )


def get_player_and_check_training_access(request, player_pk, require_write: bool = False):
    """
    Fetch the Player identified by `player_pk` and check training access.

    Access rules
    ────────────
    PLAYER       — can read their own training history only (no write).
    COACH        — can read and manage training data for any player.
    ACADEMY_ADMIN— can read and manage training data for any player.
    PARENT       — architecture reserved; not implemented yet.

    Returns the Player on success.
    Raises Http404 if the player does not exist.
    Raises PermissionDenied if access is denied.
    """
    from apps.players.models import Player

    player = get_object_or_404(Player, pk=player_pk)
    user = request.user

    if user.role == User.Role.PLAYER:
        if player.user_id != user.pk:
            raise PermissionDenied("You can only access your own training history.")
        if require_write:
            raise PermissionDenied("Players cannot modify training data.")

    elif user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        pass  # full access

    else:
        raise PermissionDenied("Insufficient permissions to access training data.")

    return player
