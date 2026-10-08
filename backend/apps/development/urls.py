from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AssessmentViewSet,
    DevelopmentTimelineView,
    GoalViewSet,
    MeasurementViewSet,
    SkillViewSet,
)

# Skill resource (not player-scoped)
router = DefaultRouter()
router.register("development/skills", SkillViewSet, basename="skill")

urlpatterns = router.urls + [
    # Assessments
    path(
        "players/<uuid:player_pk>/assessments/",
        AssessmentViewSet.as_view({"get": "list", "post": "create"}),
        name="player-assessment-list",
    ),
    path(
        "players/<uuid:player_pk>/assessments/<uuid:pk>/",
        AssessmentViewSet.as_view({"get": "retrieve"}),
        name="player-assessment-detail",
    ),
    # Goals
    path(
        "players/<uuid:player_pk>/goals/",
        GoalViewSet.as_view({"get": "list", "post": "create"}),
        name="player-goal-list",
    ),
    path(
        "players/<uuid:player_pk>/goals/<uuid:pk>/",
        GoalViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="player-goal-detail",
    ),
    # Physical Measurements
    path(
        "players/<uuid:player_pk>/measurements/",
        MeasurementViewSet.as_view({"get": "list", "post": "create"}),
        name="player-measurement-list",
    ),
    path(
        "players/<uuid:player_pk>/measurements/<uuid:pk>/",
        MeasurementViewSet.as_view({"get": "retrieve"}),
        name="player-measurement-detail",
    ),
    # Development Timeline
    path(
        "players/<uuid:player_pk>/development/timeline/",
        DevelopmentTimelineView.as_view(),
        name="player-development-timeline",
    ),
]
