from django.urls import path

from .views import LineupPublishView, LineupSummaryView, LineupUnpublishView, LineupView, TacticBoardListView, TacticBoardDetailView

urlpatterns = [
    path(
        "lineups/summary/",
        LineupSummaryView.as_view(),
        name="lineup-summary",
    ),
    path(
        "matches/<uuid:match_pk>/lineup/",
        LineupView.as_view(),
        name="match-lineup",
    ),
    path(
        "matches/<uuid:match_pk>/lineup/publish/",
        LineupPublishView.as_view(),
        name="match-lineup-publish",
    ),
    path(
        "matches/<uuid:match_pk>/lineup/unpublish/",
        LineupUnpublishView.as_view(),
        name="match-lineup-unpublish",
    ),
    path(
        "tactics/boards/",
        TacticBoardListView.as_view(),
        name="tactic-board-list",
    ),
    path(
        "tactics/boards/<uuid:board_pk>/",
        TacticBoardDetailView.as_view(),
        name="tactic-board-detail",
    ),
]
