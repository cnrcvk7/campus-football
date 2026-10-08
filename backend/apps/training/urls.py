from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AttendanceViewSet,
    ExerciseViewSet,
    PlayerTrainingHistoryView,
    SessionExerciseViewSet,
    TrainingSessionViewSet,
)

router = DefaultRouter()
router.register("training/sessions", TrainingSessionViewSet, basename="training-session")
router.register("training/exercises", ExerciseViewSet, basename="exercise")

urlpatterns = router.urls + [
    # Session exercises (nested)
    path(
        "training/sessions/<uuid:session_pk>/exercises/",
        SessionExerciseViewSet.as_view({"get": "list", "post": "create"}),
        name="training-session-exercise-list",
    ),
    # Attendance (nested)
    path(
        "training/sessions/<uuid:session_pk>/attendance/",
        AttendanceViewSet.as_view({"get": "list", "post": "create"}),
        name="training-attendance-list",
    ),
    path(
        "training/sessions/<uuid:session_pk>/attendance/<uuid:pk>/",
        AttendanceViewSet.as_view({"patch": "partial_update"}),
        name="training-attendance-detail",
    ),
    # Player training history (player-scoped)
    path(
        "players/<uuid:player_pk>/training/history/",
        PlayerTrainingHistoryView.as_view(),
        name="player-training-history",
    ),
]
