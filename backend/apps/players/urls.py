from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    PlayerAcademyMembershipViewSet,
    PlayerTeamMembershipViewSet,
    PlayerViewSet,
)

router = DefaultRouter()
router.register("players", PlayerViewSet, basename="player")

urlpatterns = router.urls + [
    # Academy membership sub-resource
    path(
        "players/<uuid:player_pk>/academy-memberships/",
        PlayerAcademyMembershipViewSet.as_view({"post": "create"}),
        name="player-academy-membership-list",
    ),
    path(
        "players/<uuid:player_pk>/academy-memberships/<uuid:pk>/",
        PlayerAcademyMembershipViewSet.as_view({"patch": "partial_update"}),
        name="player-academy-membership-detail",
    ),
    # Team membership sub-resource
    path(
        "players/<uuid:player_pk>/team-memberships/",
        PlayerTeamMembershipViewSet.as_view({"post": "create"}),
        name="player-team-membership-list",
    ),
    path(
        "players/<uuid:player_pk>/team-memberships/<uuid:pk>/",
        PlayerTeamMembershipViewSet.as_view({"patch": "partial_update"}),
        name="player-team-membership-detail",
    ),
]
