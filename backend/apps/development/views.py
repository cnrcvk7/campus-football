from collections import defaultdict

from rest_framework import mixins, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Assessment, AssessmentItem, DevelopmentGoal, PhysicalMeasurement, Skill
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


# ---------------------------------------------------------------------------
# Player Team Comparison
# ---------------------------------------------------------------------------


class PlayerComparisonView(APIView):
    """
    GET /api/players/{player_pk}/compare/

    Returns the player's latest assessment scores compared against their
    current active team's average scores per skill category.
    """

    def get(self, request, player_pk):
        from apps.teams.models import PlayerTeamMembership

        player = get_player_and_check_access(request, player_pk, require_write=False)

        player_name = f"{player.first_name} {player.last_name}"

        # Step 1: Find active team membership for the target player
        active_membership = (
            PlayerTeamMembership.objects.filter(player=player, status="active")
            .select_related("team")
            .first()
        )

        if active_membership is None:
            return Response(
                {
                    "player_id": str(player.pk),
                    "player_name": player_name,
                    "has_team": False,
                    "message": "Player does not have an active team membership.",
                }
            )

        team = active_membership.team

        # Step 2: Get all active teammates (excluding the target player)
        teammate_memberships = (
            PlayerTeamMembership.objects.filter(team=team, status="active")
            .exclude(player=player)
            .select_related("player")
        )

        team_data = {
            "id": str(team.pk),
            "name": team.name,
            "age_group": team.age_group or None,
        }

        # Step 3: Find the target player's latest assessment
        player_assessment = (
            Assessment.objects.filter(player=player)
            .prefetch_related("items__skill")
            .order_by("assessment_date", "created_at")
            .last()
        )

        if player_assessment is None:
            return Response(
                {
                    "player_id": str(player.pk),
                    "player_name": player_name,
                    "has_team": True,
                    "team": team_data,
                    "player_has_assessment": False,
                    "peer_count": teammate_memberships.count(),
                    "categories": [],
                }
            )

        # Step 4: Compute the target player's category scores from their latest assessment
        def compute_category_scores(assessment):
            """Returns dict: category -> average score (float)"""
            acc = defaultdict(lambda: {"sum": 0, "count": 0})
            for item in assessment.items.all():
                cat = item.skill.category
                acc[cat]["sum"] += item.score
                acc[cat]["count"] += 1
            return {cat: val["sum"] / val["count"] for cat, val in acc.items()}

        player_cat_scores = compute_category_scores(player_assessment)

        if not teammate_memberships.exists():
            return Response(
                {
                    "player_id": str(player.pk),
                    "player_name": player_name,
                    "has_team": True,
                    "team": team_data,
                    "player_has_assessment": True,
                    "peer_count": 0,
                    "categories": [],
                }
            )

        # Step 5: Gather peer category scores
        # peer_scores: category -> list of average scores
        peer_scores: dict[str, list[float]] = defaultdict(list)
        peers_with_assessments = 0

        for membership in teammate_memberships:
            peer = membership.player
            peer_assessment = (
                Assessment.objects.filter(player=peer)
                .prefetch_related("items__skill")
                .order_by("assessment_date", "created_at")
                .last()
            )
            if peer_assessment is None:
                continue
            peers_with_assessments += 1
            peer_cat = compute_category_scores(peer_assessment)
            for cat, score in peer_cat.items():
                peer_scores[cat].append(score)

        # Step 6: Build per-category comparison — only categories where BOTH sides have data
        categories_result = []
        for cat, player_avg in player_cat_scores.items():
            peers_in_cat = peer_scores.get(cat, [])
            if not peers_in_cat:
                continue  # Skip categories with no peer data
            team_avg = sum(peers_in_cat) / len(peers_in_cat)
            player_score = round(player_avg)
            team_avg_rounded = round(team_avg, 1)
            diff = round(player_avg - team_avg, 1)
            categories_result.append(
                {
                    "category": cat,
                    "player_score": player_score,
                    "team_avg": team_avg_rounded,
                    "diff": diff,
                    "peers_with_data": len(peers_in_cat),
                }
            )

        # Sort by category name for consistent ordering
        category_order = ["TECHNICAL", "TACTICAL", "PHYSICAL", "MENTAL"]
        categories_result.sort(
            key=lambda x: category_order.index(x["category"])
            if x["category"] in category_order
            else len(category_order)
        )

        return Response(
            {
                "player_id": str(player.pk),
                "player_name": player_name,
                "has_team": True,
                "team": team_data,
                "player_has_assessment": True,
                "peer_count": peers_with_assessments,
                "categories": categories_result,
            }
        )
