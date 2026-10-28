import logging

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenBlacklistSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.invitations.throttles import PasswordResetThrottle

from .models import ParentPlayerLink, User
from .serializers import (
    MeSerializer,
    NormalizedEmailTokenObtainPairSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
)
from .throttles import LoginRateThrottle

logger = logging.getLogger(__name__)


class LoginTokenView(TokenObtainPairView):
    """
    POST /api/auth/token/

    Wraps the standard simplejwt token-obtain view to enforce login-rate
    throttling and normalise the submitted email (strip + lowercase) so that
    login works regardless of the case the user types.
    """

    serializer_class = NormalizedEmailTokenObtainPairSerializer
    throttle_classes = [LoginRateThrottle]


class LogoutView(APIView):
    """
    POST /api/auth/logout/

    Blacklists the submitted refresh token, permanently revoking it.
    With ROTATE_REFRESH_TOKENS enabled this is the only refresh token
    associated with the current session — blacklisting it prevents any
    further access-token issuance for that session.

    Note on access token lifetime: the current access token remains
    cryptographically valid until its natural 60-minute expiry.
    Blacklisting the refresh token only prevents NEW access tokens from
    being issued; it does not immediately revoke an already-issued access
    token.

    Authentication is not required: the caller may have an expired access
    token but a still-valid refresh token, which is the normal state at
    logout time.

    Request body:
        {"refresh": "<refresh-token>"}

    Responses:
        204  Token successfully blacklisted.
        400  Request body is missing the `refresh` field.
        401  Token is malformed, expired, or already blacklisted.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get_authenticate_header(self, request):
        # DRF coerces AuthenticationFailed exceptions to 403 when no
        # authentication backend is registered and this method returns None.
        # Returning a Bearer realm value preserves the 401 status code that
        # InvalidToken carries, consistent with all other simplejwt endpoints.
        return 'Bearer realm="api"'

    def post(self, request, *args, **kwargs):
        serializer = TokenBlacklistSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken(exc.args[0])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ActiveUserTokenRefreshView(TokenRefreshView):
    """
    POST /api/auth/token/refresh/

    Extends the standard simplejwt refresh view to reject inactive users.
    simplejwt does not check is_active on refresh by default.
    """

    def post(self, request, *args, **kwargs):
        raw_token = request.data.get("refresh", "")
        if raw_token:
            try:
                refresh = RefreshToken(raw_token)
                user_id = refresh.get("user_id")
                if user_id:
                    try:
                        user = User.objects.get(id=user_id)
                        if not user.is_active:
                            raise InvalidToken("User account is deactivated.")
                    except User.DoesNotExist:
                        pass  # let super handle
            except TokenError:
                pass  # let super handle
        return super().post(request, *args, **kwargs)


class MeView(generics.RetrieveAPIView):
    """
    GET /api/auth/me/

    Returns the profile of the currently authenticated user.
    Includes linked player information if the user is associated with a Player.
    """

    serializer_class = MeSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class PasswordResetRequestView(APIView):
    """
    POST /api/auth/password-reset/

    Always returns 200 regardless of whether the email exists (no enumeration).
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower()

        try:
            user = User.objects.get(email__iexact=email)
            if user.is_active:
                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = default_token_generator.make_token(user)
                frontend_base = getattr(
                    settings, "FRONTEND_BASE_URL", "http://localhost:5173"
                )
                reset_link = f"{frontend_base}/reset-password/{uid}/{token}"
                send_mail(
                    subject="Campus Football — Password Reset",
                    message=(
                        f"You requested a password reset.\n\n"
                        f"Click the link below to set a new password:\n{reset_link}\n\n"
                        f"If you did not request this, ignore this email."
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=True,
                )
                logger.info("Password reset email sent for user %s", user.id)
        except User.DoesNotExist:
            pass  # no enumeration

        return Response(
            {"detail": "If an account exists with this email, a reset link has been sent."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """
    POST /api/auth/password-reset/confirm/

    Validates the uid+token and sets the new password.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uid = serializer.validated_data["uid"]
        token = serializer.validated_data["token"]
        password = serializer.validated_data["password"]

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response(
                {"detail": "Invalid or expired reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not default_token_generator.check_token(user, token):
            return Response(
                {"detail": "Invalid or expired reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(password)
        user.save(update_fields=["password"])
        logger.info("Password reset completed for user %s", user.id)

        return Response(
            {"detail": "Password has been reset successfully."},
            status=status.HTTP_200_OK,
        )


class ParentChildDeactivateView(APIView):
    """POST /api/auth/children/{player_id}/deactivate/ — parent deactivates minor child."""

    permission_classes = [IsAuthenticated]

    def post(self, request, player_id):
        user = request.user
        if user.role != User.Role.PARENT and not user.is_superuser:
            return Response(
                {"detail": "Only parents can manage their children's accounts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            link = ParentPlayerLink.objects.select_related("player__user").get(
                parent=user, player_id=player_id
            )
        except ParentPlayerLink.DoesNotExist:
            return Response(
                {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )

        player = link.player
        if player.user is None:
            return Response(
                {"detail": "This player does not have a user account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not player.user.is_active:
            return Response(
                {"detail": "This account is already deactivated."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        player.user.is_active = False
        player.user.save(update_fields=["is_active"])
        logger.info(
            "Parent %s deactivated child user %s (player %s)",
            user.id, player.user.id, player.id,
        )
        return Response({"detail": "Account deactivated."})


class ParentChildReactivateView(APIView):
    """POST /api/auth/children/{player_id}/reactivate/ — parent reactivates minor child."""

    permission_classes = [IsAuthenticated]

    def post(self, request, player_id):
        user = request.user
        if user.role != User.Role.PARENT and not user.is_superuser:
            return Response(
                {"detail": "Only parents can manage their children's accounts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            link = ParentPlayerLink.objects.select_related("player__user").get(
                parent=user, player_id=player_id
            )
        except ParentPlayerLink.DoesNotExist:
            return Response(
                {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )

        player = link.player
        if player.user is None:
            return Response(
                {"detail": "This player does not have a user account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if player.user.is_active:
            return Response(
                {"detail": "This account is already active."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        player.user.is_active = True
        player.user.save(update_fields=["is_active"])
        logger.info(
            "Parent %s reactivated child user %s (player %s)",
            user.id, player.user.id, player.id,
        )
        return Response({"detail": "Account reactivated."})
