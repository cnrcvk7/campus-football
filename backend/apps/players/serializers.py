from django.utils import timezone
from rest_framework import serializers

from .models import Player


class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = [
            "id",
            "football_id",
            "first_name",
            "last_name",
            "date_of_birth",
            "gender",
            "preferred_position",
            "jersey_number",
            "profile_photo_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "football_id", "created_at", "updated_at"]

    def validate_date_of_birth(self, value):
        today = timezone.now().date()
        if value >= today:
            raise serializers.ValidationError("Date of birth must be in the past.")
        age_days = (today - value).days
        if age_days > 365 * 100:
            raise serializers.ValidationError("Date of birth is not plausible (more than 100 years ago).")
        return value

    def validate_jersey_number(self, value):
        if value is not None and not (1 <= value <= 99):
            raise serializers.ValidationError("Jersey number must be between 1 and 99.")
        return value
