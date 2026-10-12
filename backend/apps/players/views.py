from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
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
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Player resource.

    list:           GET    /api/players/
    create:         POST   /api/players/
    retrieve:       GET    /api/players/{id}/
    partial_update: PATCH  /api/players/{id}/
    destroy:        DELETE /api/players/{id}/
    history:        GET    /api/players/{id}/history/

    PUT is intentionally not exposed.
    """

    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["first_name", "last_name", "football_id"]
    ordering_fields = ["last_name", "first_name", "date_of_birth", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        from apps.users.models import User, ParentPlayerLink

        qs = super().get_queryset()
        user = self.request.user

        if user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
            pass  # full access to all players
        elif user.role == User.Role.PLAYER:
            qs = qs.filter(user=user)
        elif user.role == User.Role.PARENT:
            linked_ids = ParentPlayerLink.objects.filter(
                parent=user
            ).values_list("player_id", flat=True)
            qs = qs.filter(id__in=linked_ids)
        else:
            qs = qs.none()

        position = self.request.query_params.get("position", "").strip()
        if position:
            qs = qs.filter(preferred_position=position)
        return qs

    def retrieve(self, request, *args, **kwargs):
        """
        GET /api/players/{id}/

        Overrides RetrieveModelMixin to enforce per-player read access:
        PLAYER (own), COACH/ACADEMY_ADMIN (any), PARENT (linked only).
        """
        from .permissions import get_player_and_check_read_access
        player = get_player_and_check_read_access(request, kwargs["pk"])
        serializer = self.get_serializer(player)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """POST /api/players/ — COACH and ACADEMY_ADMIN only."""
        from .permissions import require_coach_or_admin
        require_coach_or_admin(request)
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """PATCH /api/players/{id}/ — COACH and ACADEMY_ADMIN only."""
        from .permissions import require_coach_or_admin
        require_coach_or_admin(request)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """DELETE /api/players/{id}/ — COACH and ACADEMY_ADMIN only."""
        from .permissions import require_coach_or_admin
        require_coach_or_admin(request)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk=None):
        """
        Return the player's full academy and team membership history.

        Imports are local to avoid Python-level circular dependencies between
        the players, academies, and teams apps.
        """
        from .permissions import get_player_and_check_read_access
        player = get_player_and_check_read_access(request, pk)

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
    Both actions require COACH or ACADEMY_ADMIN role.
    """

    http_method_names = ["post", "patch", "head", "options"]

    def _get_player(self) -> Player:
        return get_object_or_404(Player, pk=self.kwargs["player_pk"])

    def create(self, request, player_pk=None):
        from .permissions import require_coach_or_admin
        require_coach_or_admin(request)

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
        from .permissions import require_coach_or_admin
        require_coach_or_admin(request)

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
    Both actions require COACH or ACADEMY_ADMIN role.
    """

    http_method_names = ["post", "patch", "head", "options"]

    def _get_player(self) -> Player:
        return get_object_or_404(Player, pk=self.kwargs["player_pk"])

    def create(self, request, player_pk=None):
        from .permissions import require_coach_or_admin
        require_coach_or_admin(request)

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
        from .permissions import require_coach_or_admin
        require_coach_or_admin(request)

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
