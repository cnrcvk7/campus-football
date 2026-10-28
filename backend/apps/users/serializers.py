from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

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
        except ObjectDoesNotExist:
            # user has no linked Player record — correct and expected
            return None


class NormalizedEmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Normalises the email (strip + lowercase) before authentication."""

    def validate(self, attrs):
        attrs[self.username_field] = attrs.get(self.username_field, "").strip().lower()
        return super().validate(attrs)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)
        return value
