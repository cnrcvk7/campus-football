from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    MatchPlayerStatsViewSet,
    MatchViewSet,
    PlayerMatchHistoryView,
    PlayerMatchSummaryView,
)

router = DefaultRouter()
router.register("matches", MatchViewSet, basename="match")

urlpatterns = router.urls + [
    # Match player stats (nested under a match)
    path(
        "matches/<uuid:match_pk>/players/",
        MatchPlayerStatsViewSet.as_view({"get": "list", "post": "create"}),
        name="match-player-stats-list",
    ),
    path(
        "matches/<uuid:match_pk>/players/<uuid:pk>/",
        MatchPlayerStatsViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="match-player-stats-detail",
    ),
    # Player-scoped match history and summary
    path(
        "players/<uuid:player_pk>/matches/",
        PlayerMatchHistoryView.as_view(),
        name="player-match-history",
    ),
    path(
        "players/<uuid:player_pk>/matches/summary/",
        PlayerMatchSummaryView.as_view(),
        name="player-match-summary",
    ),
]
