from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from .serializers import MeSerializer


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
