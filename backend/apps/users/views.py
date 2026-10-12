from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
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
