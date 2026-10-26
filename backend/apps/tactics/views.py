from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academies.permissions import get_user_academy_ids, require_staff_of_academy
from apps.matches.models import Match
from apps.users.models import User

from .models import Lineup, LineupSlot
from .serializers import LineupReadSerializer, LineupWriteSerializer


def _get_match_for_staff(user, match_pk) -> Match:
    """
    Resolve the match through the academy-scoped queryset (write operations).
    Matches the MatchViewSet pattern: superusers see all, staff see their academies,
    others get 404.
    """
    qs = Match.objects.select_related("team", "team__academy")
    if not user.is_superuser:
        academy_ids = get_user_academy_ids(user)
        qs = qs.filter(academy_id__in=academy_ids)
    try:
        return qs.get(pk=match_pk)
    except Match.DoesNotExist:
        raise NotFound(_LINEUP_NOT_FOUND)


_LINEUP_NOT_FOUND = "Not found."


def _get_match_for_read(match_pk) -> Match:
    """
    Resolve the match by PK for read operations.
    Authorization is handled by _can_read_lineup after fetching the lineup.
    Uses the same 404 detail for missing match and unauthorized access to
    prevent existence leaks.
    """
    try:
        return Match.objects.select_related("team", "team__academy").get(pk=match_pk)
    except Match.DoesNotExist:
        raise NotFound(_LINEUP_NOT_FOUND)


def _is_staff(user, match) -> bool:
    """Return True if the user is staff of the match's academy (or superuser)."""
    if user.is_superuser:
        return True
    if user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
        return False
    from apps.academies.models import AcademyStaffMembership
    return AcademyStaffMembership.objects.filter(
        user=user, academy_id=match.academy_id
    ).exists()


def _can_read_lineup(user, match, lineup) -> bool:
    """
    Check if user can read the lineup based on status and role.
    DRAFT: staff + superuser only.
    PUBLISHED: staff, superuser, PLAYER with ACTIVE team membership, PARENT via ParentPlayerLink.
    """
    if user.is_superuser:
        return True

    staff = _is_staff(user, match)

    if lineup.status == Lineup.Status.DRAFT:
        return staff

    # PUBLISHED
    if staff:
        return True

    if user.role == User.Role.PLAYER:
        from apps.players.models import Player
        from apps.teams.models import PlayerTeamMembership
        try:
            player = Player.objects.get(user=user)
        except Player.DoesNotExist:
            return False
        return PlayerTeamMembership.objects.filter(
            player=player,
            team=match.team,
            status=PlayerTeamMembership.Status.ACTIVE,
        ).exists()

    if user.role == User.Role.PARENT:
        from apps.teams.models import PlayerTeamMembership
        from apps.users.models import ParentPlayerLink
        linked_player_ids = list(
            ParentPlayerLink.objects.filter(parent=user)
            .values_list("player_id", flat=True)
        )
        if not linked_player_ids:
            return False
        return PlayerTeamMembership.objects.filter(
            player_id__in=linked_player_ids,
            team=match.team,
            status=PlayerTeamMembership.Status.ACTIVE,
        ).exists()

    return False


class LineupView(APIView):
    """
    GET    /api/matches/{match_pk}/lineup/          — read lineup
    PUT    /api/matches/{match_pk}/lineup/          — create or replace lineup
    DELETE /api/matches/{match_pk}/lineup/          — delete lineup
    """

    def get(self, request, match_pk):
        match = _get_match_for_read(match_pk)

        try:
            lineup = Lineup.objects.prefetch_related("slots__player").get(match=match)
        except Lineup.DoesNotExist:
            raise NotFound(_LINEUP_NOT_FOUND)

        if not _can_read_lineup(request.user, match, lineup):
            raise NotFound(_LINEUP_NOT_FOUND)

        return Response(LineupReadSerializer(lineup).data)

    def put(self, request, match_pk):
        user = request.user

        # Staff write check — non-staff get 404 from _get_match (no academy),
        # but players/parents of the academy's team would see 404 from _get_match too
        # since they aren't in get_user_academy_ids. So _get_match handles scoping,
        # then we enforce staff.
        if not user.is_superuser and user.role not in (
            User.Role.COACH, User.Role.ACADEMY_ADMIN
        ):
            # Players/parents: they can't resolve the match through academy scoping,
            # so raise 403 explicitly if authenticated but wrong role.
            raise PermissionDenied("Only coaches and academy admins can edit lineups.")

        match = _get_match_for_staff(user, match_pk)
        require_staff_of_academy(user, match.academy_id)

        serializer = LineupWriteSerializer(
            data=request.data,
            context={"match": match, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            try:
                lineup = (
                    Lineup.objects.select_for_update()
                    .get(match=match)
                )
                # Optimistic concurrency check
                client_version = data.get("version", 0)
                if client_version != 0 and client_version != lineup.version:
                    return Response(
                        {
                            "detail": "Lineup has been modified by someone else. Please reload.",
                            "code": "version_conflict",
                            "current_version": lineup.version,
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                lineup.game_format = data["game_format"]
                lineup.formation = data["formation"]
                lineup.drawing = data.get("drawing", [])
                lineup.version = lineup.version + 1
                lineup.updated_by = user
                lineup.save()
                # Delete old slots and create new ones
                lineup.slots.all().delete()
                created = False
            except Lineup.DoesNotExist:
                # First PUT — accept version 0 or omitted
                client_version = data.get("version", 0)
                if client_version != 0:
                    return Response(
                        {
                            "detail": "Lineup has been modified by someone else. Please reload.",
                            "code": "version_conflict",
                            "current_version": 0,
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                lineup = Lineup.objects.create(
                    match=match,
                    game_format=data["game_format"],
                    formation=data["formation"],
                    drawing=data.get("drawing", []),
                    version=1,
                    created_by=user,
                    updated_by=user,
                )
                created = True

            # Create slots
            slots_data = data.get("slots", [])
            slot_objects = []
            for s in slots_data:
                slot_objects.append(LineupSlot(
                    lineup=lineup,
                    player_id=s["player"],
                    role=s["role"],
                    x=s.get("x"),
                    y=s.get("y"),
                    position_code=s.get("position_code", ""),
                    order=s.get("order", 0),
                ))
            LineupSlot.objects.bulk_create(slot_objects)

        # Reload with slots for response
        lineup = Lineup.objects.prefetch_related("slots__player").get(pk=lineup.pk)
        resp_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(LineupReadSerializer(lineup).data, status=resp_status)

    def delete(self, request, match_pk):
        user = request.user

        if not user.is_superuser and user.role not in (
            User.Role.COACH, User.Role.ACADEMY_ADMIN
        ):
            raise PermissionDenied("Only coaches and academy admins can delete lineups.")

        match = _get_match_for_staff(user, match_pk)
        require_staff_of_academy(user, match.academy_id)

        try:
            lineup = Lineup.objects.get(match=match)
        except Lineup.DoesNotExist:
            raise NotFound(_LINEUP_NOT_FOUND)

        lineup.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LineupPublishView(APIView):
    """POST /api/matches/{match_pk}/lineup/publish/"""

    def post(self, request, match_pk):
        user = request.user

        if not user.is_superuser and user.role not in (
            User.Role.COACH, User.Role.ACADEMY_ADMIN
        ):
            raise PermissionDenied("Only coaches and academy admins can publish lineups.")

        match = _get_match_for_staff(user, match_pk)
        require_staff_of_academy(user, match.academy_id)

        try:
            lineup = Lineup.objects.get(match=match)
        except Lineup.DoesNotExist:
            raise NotFound(_LINEUP_NOT_FOUND)

        lineup.status = Lineup.Status.PUBLISHED
        lineup.published_at = timezone.now()
        lineup.updated_by = user
        lineup.save(update_fields=["status", "published_at", "updated_by", "updated_at"])
        return Response({"status": lineup.status, "published_at": lineup.published_at})


class LineupUnpublishView(APIView):
    """POST /api/matches/{match_pk}/lineup/unpublish/"""

    def post(self, request, match_pk):
        user = request.user

        if not user.is_superuser and user.role not in (
            User.Role.COACH, User.Role.ACADEMY_ADMIN
        ):
            raise PermissionDenied("Only coaches and academy admins can unpublish lineups.")

        match = _get_match_for_staff(user, match_pk)
        require_staff_of_academy(user, match.academy_id)

        try:
            lineup = Lineup.objects.get(match=match)
        except Lineup.DoesNotExist:
            raise NotFound(_LINEUP_NOT_FOUND)

        lineup.status = Lineup.Status.DRAFT
        lineup.published_at = None
        lineup.updated_by = user
        lineup.save(update_fields=["status", "published_at", "updated_by", "updated_at"])
        return Response({"status": lineup.status, "published_at": None})
