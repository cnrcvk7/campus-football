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

    queryset = Team.objects.select_related("academy").all()
    serializer_class = TeamSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]


class TeamPlayersView(APIView):
    """
    GET /api/teams/{team_pk}/players/

    Returns all players with an active membership on this team.
    """

    def get(self, request, team_pk):
        from apps.players.models import Player
        from apps.players.serializers import PlayerSerializer
        from .models import PlayerTeamMembership

        get_object_or_404(Team, pk=team_pk)
        active_player_ids = PlayerTeamMembership.objects.filter(
            team_id=team_pk,
            status=PlayerTeamMembership.Status.ACTIVE,
        ).values_list("player_id", flat=True)

        players = Player.objects.filter(id__in=active_player_ids).order_by(
            "last_name", "first_name"
        )
        serializer = PlayerSerializer(players, many=True, context={"request": request})
        return Response(serializer.data)
