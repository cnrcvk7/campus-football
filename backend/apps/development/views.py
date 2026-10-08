from rest_framework import mixins, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Assessment, DevelopmentGoal, PhysicalMeasurement, Skill
from .permissions import get_player_and_check_access
from .serializers import (
    AssessmentCreateSerializer,
    AssessmentDetailSerializer,
    DevelopmentGoalSerializer,
    PhysicalMeasurementSerializer,
    SkillSerializer,
)


# ---------------------------------------------------------------------------
# Skills — read-only, not player-scoped
# ---------------------------------------------------------------------------


class SkillViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    list:    GET /api/development/skills/
    retrieve: GET /api/development/skills/{id}/
    """

    queryset = Skill.objects.filter(is_active=True).order_by("category", "name")
    serializer_class = SkillSerializer
    http_method_names = ["get", "head", "options"]


# ---------------------------------------------------------------------------
# Player-scoped base mixin
# ---------------------------------------------------------------------------


class PlayerDevelopmentMixin:
    """
    Mixin for ViewSets scoped to a specific player.
    Provides `get_player()` which checks access permissions.
    """

    def get_player(self, require_write: bool = False):
        return get_player_and_check_access(
            self.request,
            self.kwargs["player_pk"],
            require_write=require_write,
        )


# ---------------------------------------------------------------------------
# Assessments
# ---------------------------------------------------------------------------


class AssessmentViewSet(
    PlayerDevelopmentMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    list:    GET  /api/players/{player_pk}/assessments/
    create:  POST /api/players/{player_pk}/assessments/
    retrieve: GET  /api/players/{player_pk}/assessments/{pk}/
    """

    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return AssessmentCreateSerializer
        return AssessmentDetailSerializer

    def get_queryset(self):
        player = self.get_player()
        return (
            Assessment.objects.filter(player=player)
            .prefetch_related("items__skill")
            .select_related("coach")
            .order_by("-assessment_date", "-created_at")
        )

    def perform_create(self, serializer):
        player = self.get_player(require_write=True)
        serializer.save(player=player, coach=self.request.user)


# ---------------------------------------------------------------------------
# Development Goals
# ---------------------------------------------------------------------------


class GoalViewSet(
    PlayerDevelopmentMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    list:           GET   /api/players/{player_pk}/goals/
    create:         POST  /api/players/{player_pk}/goals/
    retrieve:       GET   /api/players/{player_pk}/goals/{pk}/
    partial_update: PATCH /api/players/{player_pk}/goals/{pk}/
    """

    serializer_class = DevelopmentGoalSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        player = self.get_player()
        return (
            DevelopmentGoal.objects.filter(player=player)
            .select_related("skill", "created_by")
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        player = self.get_player(require_write=True)
        serializer.save(player=player, created_by=self.request.user)

    def perform_update(self, serializer):
        self.get_player(require_write=True)
        serializer.save()


# ---------------------------------------------------------------------------
# Physical Measurements
# ---------------------------------------------------------------------------


class MeasurementViewSet(
    PlayerDevelopmentMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    list:    GET  /api/players/{player_pk}/measurements/
    create:  POST /api/players/{player_pk}/measurements/
    retrieve: GET  /api/players/{player_pk}/measurements/{pk}/
    """

    serializer_class = PhysicalMeasurementSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        player = self.get_player()
        return PhysicalMeasurement.objects.filter(player=player).order_by(
            "-measurement_date", "-created_at"
        )

    def perform_create(self, serializer):
        player = self.get_player(require_write=True)
        serializer.save(player=player)


# ---------------------------------------------------------------------------
# Development Timeline
# ---------------------------------------------------------------------------


class DevelopmentTimelineView(APIView):
    """
    GET /api/players/{player_pk}/development/timeline/

    Returns the player's full development history in chronological order:
    assessments, goals, and physical measurements.
    """

    def get(self, request, player_pk):
        player = get_player_and_check_access(request, player_pk)

        assessments = (
            Assessment.objects.filter(player=player)
            .prefetch_related("items__skill")
            .select_related("coach")
            .order_by("assessment_date", "created_at")
        )
        goals = (
            DevelopmentGoal.objects.filter(player=player)
            .select_related("skill", "created_by")
            .order_by("start_date", "created_at")
        )
        measurements = PhysicalMeasurement.objects.filter(player=player).order_by(
            "measurement_date", "created_at"
        )

        return Response(
            {
                "assessments": AssessmentDetailSerializer(
                    assessments, many=True, context={"request": request}
                ).data,
                "goals": DevelopmentGoalSerializer(
                    goals, many=True, context={"request": request}
                ).data,
                "measurements": PhysicalMeasurementSerializer(
                    measurements, many=True, context={"request": request}
                ).data,
            }
        )
