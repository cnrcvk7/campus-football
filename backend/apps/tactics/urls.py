from django.urls import path

from .views import LineupPublishView, LineupUnpublishView, LineupView

urlpatterns = [
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
]
