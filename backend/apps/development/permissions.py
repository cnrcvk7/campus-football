"""
Development-domain permission helpers.

Player-scoped development endpoints use `get_player_and_check_access` to
enforce the rule that only users with a legitimate relationship to a player
can access that player's development data.
"""

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from apps.users.models import User


def _coach_or_admin_can_read_player(user, player) -> bool:
    """
    Return True if the COACH / ACADEMY_ADMIN user has read access to
    the given player.

    Read access requires the player to have a PlayerAcademyMembership
    (any status — ACTIVE or LEFT) at an academy where the user is staff.
    Former academies keep read access so historical data remains visible.
    """
    from apps.academies.models import PlayerAcademyMembership
    from apps.academies.permissions import get_user_academy_ids

    academy_ids = get_user_academy_ids(user)
    if not academy_ids:
        return False
    return PlayerAcademyMembership.objects.filter(
        player=player,
        academy_id__in=academy_ids,
    ).exists()


def get_player_and_check_access(request, player_pk, require_write: bool = False):
    """
    Fetch the Player identified by `player_pk` and verify the requesting
    user is allowed to access it.

    Access rules
    ────────────
    SUPERUSER    — full read and write access to any player's data (no affiliation required).
    PLAYER       — can read their own player's data only.
                   Writing (create/update) is never permitted for this role.
    COACH        — read: player has a PlayerAcademyMembership (any status) at
                   an academy the user staffs; otherwise 404.
                   write: membership must be ACTIVE; otherwise 403.
    ACADEMY_ADMIN— same as COACH.
    PARENT       — read-only access to explicitly linked players only (via ParentPlayerLink).

    Returns the Player instance on success.
    Raises Http404 if the player does not exist or the user has no read access.
    Raises PermissionDenied if the user lacks write access.
    """
    from apps.players.models import Player

    player = get_object_or_404(Player, pk=player_pk)
    user = request.user

    # Django superusers bypass all academy-affiliation and role restrictions.
    if user.is_superuser:
        return player

    if user.role == User.Role.PLAYER:
        # Players may only see their own development data.
        if player.user_id != user.pk:
            raise Http404
        if require_write:
            raise PermissionDenied("Players cannot create or modify development data.")

    elif user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        # Read: any-status membership at a staffed academy; otherwise 404
        # (identical to a non-existent player — no information leakage).
        if not _coach_or_admin_can_read_player(user, player):
            raise Http404

        if require_write:
            # Write: membership must be ACTIVE.
            from apps.academies.models import PlayerAcademyMembership
            from apps.academies.permissions import get_user_academy_ids
            academy_ids = get_user_academy_ids(user)
            if not PlayerAcademyMembership.objects.filter(
                player=player,
                academy_id__in=academy_ids,
                status=PlayerAcademyMembership.Status.ACTIVE,
            ).exists():
                raise PermissionDenied(
                    "You can only write development data for players with an "
                    "active membership at your academy."
                )

    elif user.role == User.Role.PARENT:
        from apps.users.models import ParentPlayerLink
        if not ParentPlayerLink.objects.filter(parent=user, player=player).exists():
            raise Http404
        if require_write:
            raise PermissionDenied("Parents cannot create or modify development data.")

    else:
        raise PermissionDenied("Insufficient permissions to access development data.")

    return player
