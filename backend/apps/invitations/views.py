import logging

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academies.models import AcademyStaffMembership, PlayerAcademyMembership
from apps.teams.models import PlayerTeamMembership
from apps.users.models import ParentPlayerLink, User

from .models import Invitation, hash_token, tokens_match
from .serializers import (
    InvitationCreateSerializer,
    InvitationListSerializer,
    InvitationPreviewSerializer,
    InvitationRedeemSerializer,
)
from .throttles import InvitationPreviewThrottle, InvitationRedeemThrottle

logger = logging.getLogger(__name__)

# Standard response for any invalid token (expired, used, revoked, unknown)
_INVITATION_INVALID_RESPONSE = Response(
    {"detail": "This invitation is not valid.", "code": "invitation_invalid"},
    status=status.HTTP_400_BAD_REQUEST,
)


def _get_invitation_by_token(token: str):
    """Look up an invitation by its token. Returns None if not found."""
    token_h = hash_token(token)
    try:
        invitation = Invitation.objects.select_related(
            "academy", "player"
        ).get(token_hash=token_h)
    except Invitation.DoesNotExist:
        return None
    # Constant-time verify
    if not tokens_match(invitation.token_hash, token_h):
        return None  # pragma: no cover — defensive
    return invitation


class InvitationCreateView(APIView):
    """POST /api/invitations/ — create a new invitation."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = InvitationCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        invitation, plain_token = serializer.save()

        frontend_base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173")
        invite_link = f"{frontend_base}/invite/{plain_token}"

        data = InvitationListSerializer(invitation).data
        data["token"] = plain_token
        data["invite_link"] = invite_link

        logger.info("Invitation %s created", invitation.id)
        return Response(data, status=status.HTTP_201_CREATED)


class InvitationListView(APIView):
    """GET /api/invitations/?academy=&player=&status= — list invitations."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        qs = Invitation.objects.select_related("academy", "player", "created_by", "used_by")

        if user.is_superuser:
            pass  # see all
        elif user.role in (User.Role.COACH, User.Role.ACADEMY_ADMIN):
            academy_ids = AcademyStaffMembership.objects.filter(
                user=user
            ).values_list("academy_id", flat=True)
            qs = qs.filter(academy_id__in=academy_ids)
        elif user.role == User.Role.PARENT:
            qs = qs.filter(created_by=user)
        else:
            return Response([], status=status.HTTP_200_OK)

        # Filters
        academy_id = request.query_params.get("academy")
        if academy_id:
            qs = qs.filter(academy_id=academy_id)

        player_id = request.query_params.get("player")
        if player_id:
            qs = qs.filter(player_id=player_id)

        status_filter = request.query_params.get("status")
        if status_filter:
            now = timezone.now()
            if status_filter == "pending":
                qs = qs.filter(
                    used_at__isnull=True,
                    revoked_at__isnull=True,
                    expires_at__gt=now,
                )
            elif status_filter == "used":
                qs = qs.filter(used_at__isnull=False)
            elif status_filter == "revoked":
                qs = qs.filter(revoked_at__isnull=False)
            elif status_filter == "expired":
                qs = qs.filter(
                    used_at__isnull=True,
                    revoked_at__isnull=True,
                    expires_at__lte=now,
                )

        serializer = InvitationListSerializer(qs[:100], many=True)
        return Response(serializer.data)


class InvitationRevokeView(APIView):
    """POST /api/invitations/{id}/revoke/ — revoke an open invitation."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        try:
            invitation = Invitation.objects.get(pk=pk)
        except Invitation.DoesNotExist:
            return Response(
                {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Permission: creator or academy admin of the invitation's academy
        if not user.is_superuser:
            is_creator = invitation.created_by_id == user.id
            is_admin = (
                user.role == User.Role.ACADEMY_ADMIN
                and AcademyStaffMembership.objects.filter(
                    user=user, academy=invitation.academy
                ).exists()
            )
            if not is_creator and not is_admin:
                return Response(
                    {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
                )

        if not invitation.is_open:
            return Response(
                {"detail": "This invitation is not open."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invitation.revoked_at = timezone.now()
        invitation.save(update_fields=["revoked_at"])
        logger.info("Invitation %s revoked by user %s", invitation.id, user.id)

        return Response(InvitationListSerializer(invitation).data)


class InvitationPreviewView(APIView):
    """GET /api/invitations/preview/{token}/ — public preview."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [InvitationPreviewThrottle]

    def get(self, request, token):
        invitation = _get_invitation_by_token(token)
        if invitation is None:
            return Response(
                {"detail": "This invitation is not valid.", "code": "invitation_invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get team name for context
        team_name = ""
        if invitation.player:
            membership = (
                PlayerTeamMembership.objects
                .filter(
                    player=invitation.player,
                    status=PlayerTeamMembership.Status.ACTIVE,
                )
                .select_related("team")
                .first()
            )
            if membership:
                team_name = membership.team.name

        data = InvitationPreviewSerializer({
            "academy_name": invitation.academy.name,
            "team_name": team_name,
            "player_first_name": invitation.player.first_name if invitation.player else "",
            "role": invitation.role,
            "state": invitation.state,
        }).data

        return Response(data)


class InvitationRedeemView(APIView):
    """POST /api/invitations/redeem/{token}/ — public redeem."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [InvitationRedeemThrottle]

    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'

    def post(self, request, token):
        invitation = _get_invitation_by_token(token)
        if invitation is None or not invitation.is_open:
            return Response(
                {"detail": "This invitation is not valid.", "code": "invitation_invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = InvitationRedeemSerializer(
            data=request.data, context={"invitation": invitation}
        )
        serializer.is_valid(raise_exception=True)

        try:
            result = serializer.save()
        except Exception:
            logger.exception("Failed to redeem invitation %s", invitation.id)
            return Response(
                {"detail": "This invitation is not valid.", "code": "invitation_invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(result, status=status.HTTP_201_CREATED)
