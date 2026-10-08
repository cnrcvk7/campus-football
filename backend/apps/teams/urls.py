from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import TeamPlayersView, TeamViewSet

router = DefaultRouter()
router.register("teams", TeamViewSet, basename="team")

urlpatterns = router.urls + [
    path("teams/<uuid:team_pk>/players/", TeamPlayersView.as_view(), name="team-players"),
]
