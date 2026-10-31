from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Team
from .serializers import TeamSerializer


class TeamViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Team resource.

    list:           GET   /api/teams/
    create:         POST  /api/teams/
    retrieve:       GET   /api/teams/{id}/
    partial_update: PATCH /api/teams/{id}/

    DELETE is intentionally not exposed.
    PUT is intentionally not exposed.
    """

    serializer_class = TeamSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        """
        Scope team visibility to the user's academy memberships.

        COACH / ACADEMY_ADMIN see only teams belonging to their academies.
        Superusers see all teams (PR #7 behaviour).
        """
        from apps.academies.permissions import require_coach_or_admin, get_user_academy_ids
        require_coach_or_admin(self.request)
        qs = Team.objects.select_related("academy").all()
        if self.request.user.is_superuser:
            return qs
        academy_ids = get_user_academy_ids(self.request.user)
        return qs.filter(academy_id__in=academy_ids)

    def create(self, request, *args, **kwargs):
        """POST /api/teams/ — COACH or ACADEMY_ADMIN with staff membership for the target academy."""
        from apps.academies.permissions import require_staff_of_academy
        require_staff_of_academy(request.user, request.data.get("academy"))
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """PATCH /api/teams/{id}/ — COACH or ACADEMY_ADMIN with staff membership for this team's academy."""
        from apps.academies.permissions import require_staff_of_academy
        instance = self.get_object()
        require_staff_of_academy(request.user, instance.academy_id)
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        if getattr(instance, "_prefetched_objects_cache", None):
            instance._prefetched_objects_cache = {}
        return Response(serializer.data)


class TeamPlayersView(APIView):
    """
    GET /api/teams/{team_pk}/players/

    Returns all players with an active membership on this team.
    """

    def get(self, request, team_pk):
        from apps.academies.permissions import get_user_academy_ids, require_coach_or_admin
        from apps.players.models import Player
        from apps.players.serializers import PlayerSerializer
        from .models import PlayerTeamMembership

        require_coach_or_admin(request)
        qs = Team.objects.select_related("academy")
        if not request.user.is_superuser:
            academy_ids = get_user_academy_ids(request.user)
            qs = qs.filter(academy_id__in=academy_ids)
        try:
            team = qs.get(pk=team_pk)
        except Team.DoesNotExist:
            from django.http import Http404
            raise Http404

        active_player_ids = PlayerTeamMembership.objects.filter(
            team_id=team_pk,
            status=PlayerTeamMembership.Status.ACTIVE,
        ).values_list("player_id", flat=True)

        players = Player.objects.filter(id__in=active_player_ids).order_by(
            "last_name", "first_name"
        )
        serializer = PlayerSerializer(players, many=True, context={"request": request})
        return Response(serializer.data)
