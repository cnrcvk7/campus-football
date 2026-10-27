from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
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

        if user.is_superuser:
            pass  # superuser sees all players
        elif user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
            # Strict academy scoping: only players enrolled in the user's
            # academies via PlayerAcademyMembership.
            from apps.academies.models import PlayerAcademyMembership
            from apps.academies.permissions import get_user_academy_ids
            academy_ids = get_user_academy_ids(user)
            player_ids = (
                PlayerAcademyMembership.objects
                .filter(academy_id__in=academy_ids)
                .values_list("player_id", flat=True)
                .distinct()
            )
            qs = qs.filter(id__in=player_ids).distinct()
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
        """
        POST /api/players/ — COACH or ACADEMY_ADMIN with academy affiliation.

        Requires an ``academy`` UUID in the request body.  If omitted and the
        user is staff of exactly one academy, that academy is used as default.
        If the user is staff of several academies, 400 is returned.
        If the user is staff of none, 403 is returned.

        Superusers must always provide ``academy`` explicitly.

        A PlayerAcademyMembership is created atomically alongside the Player.
        """
        from apps.academies.models import Academy, PlayerAcademyMembership
        from apps.academies.permissions import get_user_academy_ids, require_staff_of_academy
        from .permissions import require_coach_or_admin

        require_coach_or_admin(request)

        academy_id = request.data.get("academy")

        if request.user.is_superuser:
            if not academy_id:
                return Response(
                    {"academy": ["Superuser must specify an academy."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            user_academy_ids = get_user_academy_ids(request.user)
            if not user_academy_ids:
                raise PermissionDenied(
                    "You are not a staff member of any academy."
                )
            if not academy_id:
                if len(user_academy_ids) == 1:
                    academy_id = next(iter(user_academy_ids))
                else:
                    return Response(
                        {"academy": ["You are staff of multiple academies. Please specify one."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        require_staff_of_academy(request.user, academy_id)
        academy = get_object_or_404(Academy, pk=academy_id)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            player = serializer.save()
            PlayerAcademyMembership.objects.create(
                player=player,
                academy=academy,
                joined_at=player.created_at.date(),
            )
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def partial_update(self, request, *args, **kwargs):
        """PATCH /api/players/{id}/ — COACH or ACADEMY_ADMIN, affiliated academy required."""
        from .permissions import require_coach_or_admin, require_staff_affiliated_with_player
        require_coach_or_admin(request)
        instance = self.get_object()
        require_staff_affiliated_with_player(request.user, instance)
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        if getattr(instance, "_prefetched_objects_cache", None):
            instance._prefetched_objects_cache = {}
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        """DELETE /api/players/{id}/ — ACADEMY_ADMIN only, affiliated academy required."""
        from django.db.models.deletion import ProtectedError
        from rest_framework.exceptions import PermissionDenied
        from apps.users.models import User
        from .permissions import require_staff_affiliated_with_player

        if request.user.role != User.Role.ACADEMY_ADMIN:
            raise PermissionDenied("Only academy admins can delete player records.")
        instance = self.get_object()
        require_staff_affiliated_with_player(request.user, instance)
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {"detail": "Cannot delete a player who has academy, team, or match history."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

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
        # Object-level: caller must be staff of the target academy.
        # Checked after serializer validation so invalid academy IDs still
        # return 400 (serializer FK check) rather than 403.
        from apps.academies.permissions import require_staff_of_academy
        require_staff_of_academy(request.user, serializer.validated_data["academy"].pk)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, player_pk=None, pk=None):
        from .permissions import require_coach_or_admin
        require_coach_or_admin(request)

        from apps.academies.models import PlayerAcademyMembership
        from apps.academies.permissions import require_staff_of_academy
        from apps.academies.serializers import PlayerAcademyMembershipAPISerializer

        player = self._get_player()
        membership = get_object_or_404(PlayerAcademyMembership, pk=pk, player=player)
        # Object-level: caller must be staff of the membership's academy.
        require_staff_of_academy(request.user, membership.academy_id)
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
        # Object-level: authorize against the team's actual academy — do not
        # trust a client-supplied academy ID.  Checked after serializer
        # validation so invalid team IDs still return 400.
        from apps.academies.permissions import require_staff_of_academy
        require_staff_of_academy(request.user, serializer.validated_data["team"].academy_id)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, player_pk=None, pk=None):
        from .permissions import require_coach_or_admin
        require_coach_or_admin(request)

        from apps.academies.permissions import require_staff_of_academy
        from apps.teams.models import PlayerTeamMembership
        from apps.teams.serializers import PlayerTeamMembershipAPISerializer

        player = self._get_player()
        membership = get_object_or_404(
            PlayerTeamMembership.objects.select_related("team"),
            pk=pk,
            player=player,
        )
        # Object-level: caller must be staff of the academy that owns this team.
        require_staff_of_academy(request.user, membership.team.academy_id)
        serializer = PlayerTeamMembershipAPISerializer(
            membership,
            data=request.data,
            partial=True,
            context={"player": player, "request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
