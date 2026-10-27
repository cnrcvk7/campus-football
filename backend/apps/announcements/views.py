from django.db.models import Prefetch, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.academies.permissions import (
    get_user_academy_ids,
    require_academy_admin_of_academy,
    require_staff_of_academy,
)
from apps.users.models import User

from .models import Announcement, AnnouncementReceipt
from .permissions import get_visible_announcements_q
from .serializers import (
    AnnouncementCreateSerializer,
    AnnouncementListSerializer,
    AnnouncementUpdateSerializer,
    ReceiptUserSerializer,
)
from .throttles import AnnouncementCreateThrottle


class AnnouncementViewSet(ModelViewSet):
    """
    list:    GET  /api/announcements/?team=&page=
    create:  POST /api/announcements/
    retrieve: GET  /api/announcements/{id}/
    partial_update: PATCH /api/announcements/{id}/
    destroy: DELETE /api/announcements/{id}/  (soft delete)
    """

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_throttles(self):
        if self.action == "create":
            return [AnnouncementCreateThrottle()]
        return []

    def get_serializer_class(self):
        if self.action == "create":
            return AnnouncementCreateSerializer
        if self.action == "partial_update":
            return AnnouncementUpdateSerializer
        return AnnouncementListSerializer

    def get_queryset(self):
        user = self.request.user
        q = get_visible_announcements_q(user)
        qs = (
            Announcement.objects
            .filter(q, deleted_at__isnull=True)
            .select_related("author", "team")
        )

        # Optional team filter
        team_id = self.request.query_params.get("team")
        if team_id:
            qs = qs.filter(team_id=team_id)

        # Prefetch receipts for the current user (for is_read / is_acknowledged)
        qs = qs.prefetch_related(
            Prefetch(
                "receipts",
                queryset=AnnouncementReceipt.objects.filter(user=user),
                to_attr="_user_receipts",
            )
        )

        return qs.order_by("-is_pinned", "-created_at")

    # -- Create ---------------------------------------------------------------

    def perform_create(self, serializer):
        user = self.request.user
        academy = serializer.validated_data["academy"]
        team = serializer.validated_data.get("team")

        # PLAYER / PARENT cannot create
        if not user.is_superuser and user.role not in (
            User.Role.COACH, User.Role.ACADEMY_ADMIN
        ):
            raise PermissionDenied(
                "Only coaches and academy admins can create announcements."
            )

        # Staff of the academy?
        require_staff_of_academy(user, academy.pk)

        # Academy-wide requires ACADEMY_ADMIN
        if not team:
            require_academy_admin_of_academy(user, academy.pk)

        announcement = serializer.save(author=user)

        # Author's own announcement is automatically read.
        AnnouncementReceipt.objects.create(
            announcement=announcement,
            user=user,
            read_at=timezone.now(),
        )

    def create(self, request, *args, **kwargs):
        user = request.user

        # PLAYER / PARENT cannot create — check before academy scoping
        # so they get 403 rather than 404.
        if not user.is_superuser and user.role not in (
            User.Role.COACH, User.Role.ACADEMY_ADMIN
        ):
            raise PermissionDenied(
                "Only coaches and academy admins can create announcements."
            )

        # Validate that the academy exists and user is staff — hide non-staff
        # academies as 404 (consistent with PR #12).
        academy_id = request.data.get("academy")
        if academy_id and not user.is_superuser:
            user_academy_ids = get_user_academy_ids(user)
            if academy_id not in user_academy_ids and str(academy_id) not in {
                str(a) for a in user_academy_ids
            }:
                raise NotFound("Academy not found.")

        # Validate team belongs to one of user's academies
        team_id = request.data.get("team")
        if team_id and not user.is_superuser:
            from apps.teams.models import Team
            try:
                team_obj = Team.objects.get(pk=team_id)
            except Team.DoesNotExist:
                raise NotFound("Team not found.")
            user_academy_ids = get_user_academy_ids(user)
            if team_obj.academy_id not in user_academy_ids:
                raise NotFound("Team not found.")

        return super().create(request, *args, **kwargs)

    # -- Update ---------------------------------------------------------------

    def perform_update(self, serializer):
        user = self.request.user
        instance = self.get_object()

        if not user.is_superuser:
            if user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
                raise PermissionDenied(
                    "Only coaches and academy admins can edit announcements."
                )
            # Only the author can edit
            if instance.author_id != user.pk:
                raise PermissionDenied(
                    "Only the author can edit this announcement."
                )
            # Must still be staff of the academy
            require_staff_of_academy(user, instance.academy_id)

        serializer.save()

    # -- Delete (soft) --------------------------------------------------------

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        user = request.user

        if not user.is_superuser:
            if user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
                raise PermissionDenied(
                    "Only coaches and academy admins can delete announcements."
                )
            require_staff_of_academy(user, instance.academy_id)
            # Author or academy admin of the academy
            is_author = instance.author_id == user.pk
            is_admin = user.role == User.Role.ACADEMY_ADMIN
            if not is_author and not is_admin:
                raise PermissionDenied(
                    "Only the author or an academy admin can delete this announcement."
                )

        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    # -- Read (mark as read) --------------------------------------------------

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        """POST /api/announcements/{id}/read/ — idempotent."""
        announcement = self.get_object()
        receipt, created = AnnouncementReceipt.objects.get_or_create(
            announcement=announcement,
            user=request.user,
            defaults={"read_at": timezone.now()},
        )
        if not created and receipt.read_at is None:
            receipt.read_at = timezone.now()
            receipt.save(update_fields=["read_at"])
        return Response({"read_at": receipt.read_at}, status=status.HTTP_200_OK)

    # -- Pin / Unpin ----------------------------------------------------------

    def _check_pin_permission(self, user, announcement):
        """Author or ACADEMY_ADMIN of the academy (or superuser) may pin/unpin."""
        if user.is_superuser:
            return
        if user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
            raise PermissionDenied(
                "Only coaches and academy admins can pin announcements."
            )
        require_staff_of_academy(user, announcement.academy_id)
        is_author = announcement.author_id == user.pk
        is_admin = user.role == User.Role.ACADEMY_ADMIN
        if not is_author and not is_admin:
            raise PermissionDenied(
                "Only the author or an academy admin can pin/unpin this announcement."
            )

    @action(detail=True, methods=["post"], url_path="pin")
    def pin(self, request, pk=None):
        """POST /api/announcements/{id}/pin/"""
        announcement = self.get_object()
        self._check_pin_permission(request.user, announcement)
        announcement.is_pinned = True
        announcement.save(update_fields=["is_pinned", "updated_at"])
        return Response({"is_pinned": True}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="unpin")
    def unpin(self, request, pk=None):
        """POST /api/announcements/{id}/unpin/"""
        announcement = self.get_object()
        self._check_pin_permission(request.user, announcement)
        announcement.is_pinned = False
        announcement.save(update_fields=["is_pinned", "updated_at"])
        return Response({"is_pinned": False}, status=status.HTTP_200_OK)

    # -- Acknowledge ----------------------------------------------------------

    @action(detail=True, methods=["post", "delete"], url_path="acknowledge")
    def acknowledge(self, request, pk=None):
        """POST/DELETE /api/announcements/{id}/acknowledge/ — PLAYER/PARENT only, idempotent."""
        user = request.user
        if not user.is_superuser and user.role not in (
            User.Role.PLAYER, User.Role.PARENT
        ):
            raise PermissionDenied(
                detail="Only players and parents can acknowledge announcements.",
                code="acknowledge_not_allowed",
            )

        announcement = self.get_object()

        if request.method == "POST":
            receipt, created = AnnouncementReceipt.objects.get_or_create(
                announcement=announcement,
                user=user,
                defaults={
                    "read_at": timezone.now(),
                    "acknowledged_at": timezone.now(),
                },
            )
            if not created and receipt.acknowledged_at is None:
                receipt.acknowledged_at = timezone.now()
                if receipt.read_at is None:
                    receipt.read_at = timezone.now()
                receipt.save(update_fields=["acknowledged_at", "read_at"])
            return Response(
                {"acknowledged_at": receipt.acknowledged_at},
                status=status.HTTP_200_OK,
            )

        # DELETE — undo acknowledge
        try:
            receipt = AnnouncementReceipt.objects.get(
                announcement=announcement, user=user,
            )
        except AnnouncementReceipt.DoesNotExist:
            return Response(
                {"acknowledged_at": None}, status=status.HTTP_200_OK,
            )
        receipt.acknowledged_at = None
        receipt.save(update_fields=["acknowledged_at"])
        return Response(
            {"acknowledged_at": None}, status=status.HTTP_200_OK,
        )

    # -- Receipts (staff only) ------------------------------------------------

    @action(detail=True, methods=["get"], url_path="receipts")
    def receipts(self, request, pk=None):
        """GET /api/announcements/{id}/receipts/ — staff only."""
        user = request.user
        announcement = self.get_object()

        if not user.is_superuser:
            if user.role not in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
                raise PermissionDenied(
                    "Only staff can view acknowledgement receipts."
                )
            require_staff_of_academy(user, announcement.academy_id)

        # Build the audience: players and parents who can see this announcement
        from apps.academies.models import PlayerAcademyMembership
        from apps.players.models import Player
        from apps.teams.models import PlayerTeamMembership
        from apps.users.models import ParentPlayerLink

        if announcement.team_id:
            # Team announcement: players with ACTIVE team membership
            player_ids = set(
                PlayerTeamMembership.objects.filter(
                    team_id=announcement.team_id,
                    status=PlayerTeamMembership.Status.ACTIVE,
                ).values_list("player_id", flat=True)
            )
        else:
            # Academy-wide: players with ACTIVE academy membership
            player_ids = set(
                PlayerAcademyMembership.objects.filter(
                    academy_id=announcement.academy_id,
                    status=PlayerAcademyMembership.Status.ACTIVE,
                ).values_list("player_id", flat=True)
            )

        # Player users
        player_user_ids = set(
            Player.objects.filter(
                pk__in=player_ids, user__isnull=False,
            ).values_list("user_id", flat=True)
        )

        # Parent users linked to those players
        parent_user_ids = set(
            ParentPlayerLink.objects.filter(
                player_id__in=player_ids,
            ).values_list("parent_id", flat=True)
        )

        # Fetch receipts
        receipts_by_user = {
            r.user_id: r
            for r in AnnouncementReceipt.objects.filter(
                announcement=announcement,
                user_id__in=player_user_ids | parent_user_ids,
            )
        }

        # Build response
        all_user_ids = player_user_ids | parent_user_ids
        users = {
            u.pk: u
            for u in User.objects.filter(pk__in=all_user_ids)
        }

        def build_list(user_ids):
            result = []
            for uid in user_ids:
                u = users.get(uid)
                if not u:
                    continue
                receipt = receipts_by_user.get(uid)
                result.append({
                    "id": u.pk,
                    "email": u.email,
                    "first_name": u.first_name,
                    "last_name": u.last_name,
                    "role": u.role,
                    "acknowledged_at": receipt.acknowledged_at if receipt else None,
                    "read_at": receipt.read_at if receipt else None,
                })
            return result

        player_list = build_list(player_user_ids)
        parent_list = build_list(parent_user_ids)

        return Response({
            "players": {
                "total": len(player_user_ids),
                "acknowledged": sum(
                    1 for p in player_list if p["acknowledged_at"] is not None
                ),
                "details": ReceiptUserSerializer(player_list, many=True).data,
            },
            "parents": {
                "total": len(parent_user_ids),
                "acknowledged": sum(
                    1 for p in parent_list if p["acknowledged_at"] is not None
                ),
                "details": ReceiptUserSerializer(parent_list, many=True).data,
            },
        })


class UnreadCountView(APIView):
    """GET /api/announcements/unread-count/"""

    def get(self, request):
        user = request.user
        q = get_visible_announcements_q(user)
        visible_ids = (
            Announcement.objects
            .filter(q, deleted_at__isnull=True)
            .values_list("id", flat=True)
        )
        read_ids = set(
            AnnouncementReceipt.objects.filter(
                user=user,
                announcement_id__in=visible_ids,
                read_at__isnull=False,
            ).values_list("announcement_id", flat=True)
        )
        unread = len(set(visible_ids) - read_ids)
        return Response({"unread_count": unread})
