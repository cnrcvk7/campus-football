"""
Match-domain permission helpers.
"""

from django.http import Http404
from rest_framework.exceptions import PermissionDenied

from apps.users.models import User


def require_coach_or_admin(request) -> None:
    """
    Raise PermissionDenied if the requesting user is not COACH or ACADEMY_ADMIN.

    Call this at the start of any view method that manages match data.
    """
    user = request.user
    if user.is_superuser:
        return
    if user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        raise PermissionDenied("Only coaches and academy admins can manage match data.")


def get_player_and_check_match_access(request, player_pk, require_write: bool = False):
    """
    Fetch the Player identified by `player_pk` and check match access.

    Access rules
    ────────────
    SUPERUSER     — full read and write access (no affiliation required).
    PLAYER        — can read their own match history only (no write).
    COACH         — read: player has a PlayerAcademyMembership (any status) at
                    an academy the user staffs; otherwise Http404.
                    write: membership must be ACTIVE; otherwise PermissionDenied.
    ACADEMY_ADMIN — same as COACH.
    PARENT        — read-only access to explicitly linked players only
                    (via ParentPlayerLink); otherwise Http404.

    Returns the Player on success.
    Raises Http404 if the player does not exist or the user has no read access.
    Raises PermissionDenied if the user lacks write access.
    """
    from apps.players.models import Player
    from apps.players.permissions import staff_can_read_player

    try:
        player = Player.objects.get(pk=player_pk)
    except Player.DoesNotExist:
        raise Http404
    user = request.user

    # Django superusers bypass all role and affiliation restrictions.
    if user.is_superuser:
        return player

    if user.role == User.Role.PLAYER:
        if player.user_id != user.pk:
            raise Http404
        if require_write:
            raise PermissionDenied("Players cannot modify match data.")

    elif user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        if not staff_can_read_player(user, player):
            raise Http404
        if require_write:
            from apps.academies.models import PlayerAcademyMembership
            from apps.academies.permissions import get_user_academy_ids
            academy_ids = get_user_academy_ids(user)
            if not PlayerAcademyMembership.objects.filter(
                player=player,
                academy_id__in=academy_ids,
                status=PlayerAcademyMembership.Status.ACTIVE,
            ).exists():
                raise PermissionDenied(
                    "You can only write match data for players with an "
                    "active membership at your academy."
                )

    elif user.role == User.Role.PARENT:
        from apps.users.models import ParentPlayerLink
        if not ParentPlayerLink.objects.filter(parent=user, player=player).exists():
            raise Http404
        if require_write:
            raise PermissionDenied("Parents cannot modify this data.")

    else:
        raise Http404

    return player
