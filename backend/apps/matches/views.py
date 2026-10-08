from django.db.models import Avg, Sum
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Match, MatchPlayerStats
from .permissions import get_player_and_check_match_access, require_coach_or_admin
from .serializers import (
    MatchPlayerStatsReadSerializer,
    MatchPlayerStatsWriteSerializer,
    MatchReadSerializer,
    MatchWriteSerializer,
    PlayerMatchHistorySerializer,
    PlayerMatchSummarySerializer,
)


# ---------------------------------------------------------------------------
# Matches
# ---------------------------------------------------------------------------


class MatchViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    list:           GET   /api/matches/
    create:         POST  /api/matches/
    retrieve:       GET   /api/matches/{id}/
    partial_update: PATCH /api/matches/{id}/
    """

    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.action in ("create", "partial_update"):
            return MatchWriteSerializer
        return MatchReadSerializer

    def get_queryset(self):
        require_coach_or_admin(self.request)
        return (
            Match.objects.all()
            .select_related("academy", "team", "created_by")
            .order_by("-match_date", "-created_at")
        )

    def perform_create(self, serializer):
        require_coach_or_admin(self.request)
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        require_coach_or_admin(self.request)
        serializer.save()


# ---------------------------------------------------------------------------
# Match Player Stats  (nested under /matches/{match_pk}/)
# ---------------------------------------------------------------------------


class MatchPlayerStatsViewSet(viewsets.GenericViewSet):
    """
    list:           GET   /api/matches/{match_pk}/players/
    create:         POST  /api/matches/{match_pk}/players/
    retrieve:       GET   /api/matches/{match_pk}/players/{pk}/
    partial_update: PATCH /api/matches/{match_pk}/players/{pk}/
    """

    http_method_names = ["get", "post", "patch", "head", "options"]

    def _get_match(self) -> Match:
        require_coach_or_admin(self.request)
        return get_object_or_404(Match, pk=self.kwargs["match_pk"])

    def list(self, request, match_pk=None):
        match = self._get_match()
        stats = match.player_stats.select_related("player").order_by(
            "player__last_name", "player__first_name"
        )
        return Response(
            MatchPlayerStatsReadSerializer(
                stats, many=True, context={"request": request}
            ).data
        )

    def create(self, request, match_pk=None):
        match = self._get_match()
        serializer = MatchPlayerStatsWriteSerializer(
            data=request.data,
            context={"match": match, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, match_pk=None, pk=None):
        match = self._get_match()
        stats = get_object_or_404(MatchPlayerStats, pk=pk, match=match)
        return Response(
            MatchPlayerStatsReadSerializer(stats, context={"request": request}).data
        )

    def partial_update(self, request, match_pk=None, pk=None):
        match = self._get_match()
        stats = get_object_or_404(MatchPlayerStats, pk=pk, match=match)
        serializer = MatchPlayerStatsWriteSerializer(
            stats,
            data=request.data,
            partial=True,
            context={"match": match, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Player Match History
# ---------------------------------------------------------------------------


class PlayerMatchHistoryView(APIView):
    """
    GET /api/players/{player_pk}/matches/

    Returns all matches a player has stats for, with per-match stats inline.
    """

    def get(self, request, player_pk):
        player = get_player_and_check_match_access(request, player_pk)

        stats_qs = (
            MatchPlayerStats.objects.filter(player=player)
            .select_related("match__academy", "match__team")
            .order_by("-match__match_date", "-match__created_at")
        )

        serializer = PlayerMatchHistorySerializer(
            stats_qs,
            many=True,
            context={"request": request},
        )
        return Response({"matches": serializer.data})


# ---------------------------------------------------------------------------
# Player Match Summary
# ---------------------------------------------------------------------------


class PlayerMatchSummaryView(APIView):
    """
    GET /api/players/{player_pk}/matches/summary/

    Returns aggregated match statistics for the player, computed on the fly.
    """

    def get(self, request, player_pk):
        player = get_player_and_check_match_access(request, player_pk)

        qs = MatchPlayerStats.objects.filter(player=player)

        aggregates = qs.aggregate(
            total_minutes=Sum("minutes_played"),
            total_goals=Sum("goals"),
            total_assists=Sum("assists"),
            avg_rating=Avg("rating"),
            total_shots=Sum("shots"),
            total_passes_completed=Sum("passes_completed"),
            total_dribbles=Sum("dribbles"),
            total_tackles=Sum("tackles"),
            total_yellow_cards=Sum("yellow_cards"),
            total_red_cards=Sum("red_cards"),
        )

        summary = {
            "matches_played": qs.count(),
            "starts": qs.filter(started=True).count(),
            "total_minutes": aggregates["total_minutes"] or 0,
            "goals": aggregates["total_goals"] or 0,
            "assists": aggregates["total_assists"] or 0,
            "average_rating": aggregates["avg_rating"],
            "total_shots": aggregates["total_shots"] or 0,
            "total_passes_completed": aggregates["total_passes_completed"] or 0,
            "total_dribbles": aggregates["total_dribbles"] or 0,
            "total_tackles": aggregates["total_tackles"] or 0,
            "yellow_cards": aggregates["total_yellow_cards"] or 0,
            "red_cards": aggregates["total_red_cards"] or 0,
        }

        serializer = PlayerMatchSummarySerializer(summary)
        return Response(serializer.data)
