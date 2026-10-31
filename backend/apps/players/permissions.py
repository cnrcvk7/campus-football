"""
Player-domain permission helpers.

Follows the same pattern as:
  apps.development.permissions.get_player_and_check_access
  apps.matches.permissions.get_player_and_check_match_access
  apps.training.permissions.get_player_and_check_training_access
"""

from django.http import Http404
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


def staff_can_read_player(user, player) -> bool:
    """
    Return True if the COACH / ACADEMY_ADMIN user has read access to
    the given player.

    Read access requires the player to have a PlayerAcademyMembership
    (any status — ACTIVE or LEFT) at an academy where the user is staff.
    Former academies keep read access so historical data remains visible.

    This is the single source of truth for staff→player read visibility,
    used by get_player_and_check_read_access and every domain-specific
    helper (development, matches, training).
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


def development_cutoff_for(user, player):
    """
    Return a cutoff date for development-data visibility, or ``None``
    for full access.

    Full access (returns None):
      - Superuser
      - The player themselves (PLAYER role with matching user)
      - PARENT linked to the player
      - COACH / ACADEMY_ADMIN with at least one ACTIVE PlayerAcademyMembership
        for the player at one of the user's academies

    Limited access (returns a date):
      - COACH / ACADEMY_ADMIN whose academies only have LEFT memberships for
        the player: returns the latest ``left_at`` among those memberships.
        Records dated *after* this cutoff must be invisible.

    The caller is responsible for filtering querysets using the returned date.
    This helper must be called *after* ``staff_can_read_player`` / the
    equivalent access check has confirmed the user may see the player at all.
    """
    from apps.academies.models import PlayerAcademyMembership
    from apps.academies.permissions import get_user_academy_ids
    from apps.users.models import User

    if user.is_superuser:
        return None

    if user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        # PLAYER and PARENT always get full history (their read scope is
        # already restricted to their own player / linked players).
        return None

    academy_ids = get_user_academy_ids(user)
    memberships = PlayerAcademyMembership.objects.filter(
        player=player,
        academy_id__in=academy_ids,
    )

    if memberships.filter(status=PlayerAcademyMembership.Status.ACTIVE).exists():
        return None

    # Only LEFT memberships — return the latest left_at.
    latest_left = (
        memberships
        .filter(status=PlayerAcademyMembership.Status.LEFT)
        .order_by("-left_at")
        .values_list("left_at", flat=True)
        .first()
    )
    return latest_left


def get_player_and_check_read_access(request, player_pk):
    """
    Fetch the Player identified by `player_pk` and verify read access.

    Access rules
    ────────────
    SUPERUSER     — full read access to any player (no affiliation required).
    PLAYER        — can read their own player record only; otherwise Http404.
    COACH         — read: player has a PlayerAcademyMembership (any status) at
                    an academy the user staffs; otherwise Http404.
    ACADEMY_ADMIN — same as COACH.
    PARENT        — read-only access to explicitly linked players only
                    (via ParentPlayerLink); otherwise Http404.

    Returns the Player instance on success.
    Raises Http404 if the player does not exist or the user has no read access.
    """
    from apps.players.models import Player

    try:
        player = Player.objects.get(pk=player_pk)
    except Player.DoesNotExist:
        raise Http404

    user = request.user

    if user.is_superuser:
        return player

    if user.role == User.Role.PLAYER:
        if player.user_id != user.pk:
            raise Http404

    elif user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        if not staff_can_read_player(user, player):
            raise Http404

    elif user.role == User.Role.PARENT:
        from apps.users.models import ParentPlayerLink
        if not ParentPlayerLink.objects.filter(parent=user, player=player).exists():
            raise Http404

    else:
        raise Http404

    return player
