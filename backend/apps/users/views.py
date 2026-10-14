from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenBlacklistSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import MeSerializer
from .throttles import LoginRateThrottle


class LoginTokenView(TokenObtainPairView):
    """
    POST /api/auth/token/

    Wraps the standard simplejwt token-obtain view to enforce login-rate
    throttling.  Throttling is intentionally applied here rather than
    globally so that /api/auth/token/refresh/ is never affected.
    """

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
