"""
Announcement-domain permission and visibility helpers.
"""

from django.db.models import Q

from apps.users.models import User


def get_visible_announcements_q(user) -> Q:
    """
    Return a Q filter that restricts announcements to those the user can see.

    Superusers see everything (returns Q()).
    Staff see all announcements of their academies.
    Players see announcements of academies/teams they are ACTIVE in.
    Parents see announcements visible to any of their linked children.
    """
    from apps.academies.models import PlayerAcademyMembership
    from apps.academies.permissions import get_user_academy_ids
    from apps.teams.models import PlayerTeamMembership
    from apps.users.models import ParentPlayerLink

    if user.is_superuser:
        return Q()

    if user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        academy_ids = get_user_academy_ids(user)
        return Q(academy_id__in=academy_ids)

    if user.role == User.Role.PLAYER:
        from apps.players.models import Player
        try:
            player = Player.objects.get(user=user)
        except Player.DoesNotExist:
            return Q(pk__in=[])  # no player → no announcements

        active_academy_ids = set(
            PlayerAcademyMembership.objects.filter(
                player=player,
                status=PlayerAcademyMembership.Status.ACTIVE,
            ).values_list("academy_id", flat=True)
        )
        active_team_ids = set(
            PlayerTeamMembership.objects.filter(
                player=player,
                status=PlayerTeamMembership.Status.ACTIVE,
            ).values_list("team_id", flat=True)
        )
        # Academy-wide: player has ACTIVE academy membership
        # Team: player has ACTIVE team membership in that team
        return (
            Q(academy_id__in=active_academy_ids, team__isnull=True)
            | Q(team_id__in=active_team_ids)
        )

    if user.role == User.Role.PARENT:
        linked_player_ids = list(
            ParentPlayerLink.objects.filter(parent=user)
            .values_list("player_id", flat=True)
        )
        if not linked_player_ids:
            return Q(pk__in=[])

        active_academy_ids = set(
            PlayerAcademyMembership.objects.filter(
                player_id__in=linked_player_ids,
                status=PlayerAcademyMembership.Status.ACTIVE,
            ).values_list("academy_id", flat=True)
        )
        active_team_ids = set(
            PlayerTeamMembership.objects.filter(
                player_id__in=linked_player_ids,
                status=PlayerTeamMembership.Status.ACTIVE,
            ).values_list("team_id", flat=True)
        )
        return (
            Q(academy_id__in=active_academy_ids, team__isnull=True)
            | Q(team_id__in=active_team_ids)
        )

    # Unknown role → nothing
    return Q(pk__in=[])
