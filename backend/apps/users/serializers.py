from rest_framework import serializers

from .models import User


class MeSerializer(serializers.ModelSerializer):
    """
    Serializer for the /api/auth/me/ endpoint.

    Returns the authenticated user's account information and, if linked,
    basic player profile data. Sensitive fields (password, is_staff, etc.)
    are never exposed.
    """

    player_profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "player_profile",
            "created_at",
        ]
        read_only_fields = fields

    def get_player_profile(self, user: User) -> dict | None:
        """Return basic player info if this user is linked to a Player record."""
        try:
            player = user.player_profile  # reverse OneToOneField from Player
            return {
                "player_id": str(player.id),
                "football_id": player.football_id,
                "first_name": player.first_name,
                "last_name": player.last_name,
            }
        except Exception:
            return None
