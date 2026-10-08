from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Player
from .serializers import PlayerSerializer


# ---------------------------------------------------------------------------
# Player resource
# ---------------------------------------------------------------------------

class PlayerViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Player resource.

    list:           GET   /api/players/
    create:         POST  /api/players/
    retrieve:       GET   /api/players/{id}/
    partial_update: PATCH /api/players/{id}/
    history:        GET   /api/players/{id}/history/

    DELETE is intentionally not exposed.
    PUT is intentionally not exposed.
    """

    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk=None):
        """
        Return the player's full academy and team membership history.

        Imports are local to avoid Python-level circular dependencies between
        the players, academies, and teams apps.
        """
        player = self.get_object()

        from apps.academies.models import PlayerAcademyMembership
        from apps.academies.serializers import PlayerAcademyMembershipHistorySerializer
        from apps.teams.models import PlayerTeamMembership
        from apps.teams.serializers import PlayerTeamMembershipHistorySerializer

        academy_memberships = (
            PlayerAcademyMembership.objects.filter(player=player)
            .select_related("academy")
            .order_by("-joined_at")
        )
        team_memberships = (
            PlayerTeamMembership.objects.filter(player=player)
            .select_related("team", "team__academy")
            .order_by("-joined_at")
        )

        return Response(
            {
                "academy_history": PlayerAcademyMembershipHistorySerializer(
                    academy_memberships, many=True
                ).data,
                "team_history": PlayerTeamMembershipHistorySerializer(
                    team_memberships, many=True
                ).data,
            }
        )


# ---------------------------------------------------------------------------
# Academy membership sub-resource  (nested under /api/players/{player_pk}/)
# ---------------------------------------------------------------------------

class PlayerAcademyMembershipViewSet(viewsets.GenericViewSet):
    """
    Manages a player's academy memberships.

    create:         POST  /api/players/{player_pk}/academy-memberships/
    partial_update: PATCH /api/players/{player_pk}/academy-memberships/{pk}/

    player_pk comes from the URL; player cannot be set from the request body.
    academy and joined_at are immutable after creation.
    """

    http_method_names = ["post", "patch", "head", "options"]

    def _get_player(self) -> Player:
        return get_object_or_404(Player, pk=self.kwargs["player_pk"])

    def create(self, request, player_pk=None):
        from apps.academies.serializers import PlayerAcademyMembershipAPISerializer

        player = self._get_player()
        serializer = PlayerAcademyMembershipAPISerializer(
            data=request.data,
            context={"player": player, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, player_pk=None, pk=None):
        from apps.academies.models import PlayerAcademyMembership
        from apps.academies.serializers import PlayerAcademyMembershipAPISerializer

        player = self._get_player()
        membership = get_object_or_404(PlayerAcademyMembership, pk=pk, player=player)
        serializer = PlayerAcademyMembershipAPISerializer(
            membership,
            data=request.data,
            partial=True,
            context={"player": player, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Team membership sub-resource  (nested under /api/players/{player_pk}/)
# ---------------------------------------------------------------------------

class PlayerTeamMembershipViewSet(viewsets.GenericViewSet):
    """
    Manages a player's team memberships.

    create:         POST  /api/players/{player_pk}/team-memberships/
    partial_update: PATCH /api/players/{player_pk}/team-memberships/{pk}/

    player_pk comes from the URL; player cannot be set from the request body.
    team and joined_at are immutable after creation.
    """

    http_method_names = ["post", "patch", "head", "options"]

    def _get_player(self) -> Player:
        return get_object_or_404(Player, pk=self.kwargs["player_pk"])

    def create(self, request, player_pk=None):
        from apps.teams.serializers import PlayerTeamMembershipAPISerializer

        player = self._get_player()
        serializer = PlayerTeamMembershipAPISerializer(
            data=request.data,
            context={"player": player, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, player_pk=None, pk=None):
        from apps.teams.models import PlayerTeamMembership
        from apps.teams.serializers import PlayerTeamMembershipAPISerializer

        player = self._get_player()
        membership = get_object_or_404(PlayerTeamMembership, pk=pk, player=player)
        serializer = PlayerTeamMembershipAPISerializer(
            membership,
            data=request.data,
            partial=True,
            context={"player": player, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
