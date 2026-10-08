from rest_framework import serializers

from .models import Academy, PlayerAcademyMembership


class AcademySerializer(serializers.ModelSerializer):
    class Meta:
        model = Academy
        fields = [
            "id",
            "name",
            "description",
            "city",
            "country",
            "logo_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Serializers used by the Player history endpoint (read-only, nested)
# ---------------------------------------------------------------------------

class AcademyBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Academy
        fields = ["id", "name", "city", "country"]


class PlayerAcademyMembershipHistorySerializer(serializers.ModelSerializer):
    academy = AcademyBriefSerializer(read_only=True)

    class Meta:
        model = PlayerAcademyMembership
        fields = ["id", "academy", "joined_at", "left_at", "status"]


# ---------------------------------------------------------------------------
# Internal serializer (used by old model-level tests only)
# ---------------------------------------------------------------------------

class PlayerAcademyMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlayerAcademyMembership
        fields = ["id", "player", "academy", "joined_at", "left_at", "status"]
        read_only_fields = ["id"]

    def validate(self, data):
        joined_at = data.get("joined_at") or (self.instance.joined_at if self.instance else None)
        left_at = data.get("left_at")
        if joined_at and left_at and left_at < joined_at:
            raise serializers.ValidationError(
                {"left_at": "left_at cannot be before joined_at."}
            )
        return data


# ---------------------------------------------------------------------------
# API serializer — used by POST/PATCH /api/players/{id}/academy-memberships/
# ---------------------------------------------------------------------------

class PlayerAcademyMembershipAPISerializer(serializers.ModelSerializer):
    """
    Handles both creation and update of academy memberships through the API.

    Rules:
    - `player` is never a field; it is injected from the URL by the view.
    - `academy` and `joined_at` are required on creation and immutable afterwards.
    - Only `left_at` and `status` may be changed via PATCH.
    - Duplicate active memberships at the same academy are rejected on creation.
    """

    class Meta:
        model = PlayerAcademyMembership
        fields = ["id", "academy", "joined_at", "left_at", "status", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_fields(self):
        fields = super().get_fields()
        # After creation, academy and joined_at are immutable.
        if self.instance is not None:
            fields["academy"].read_only = True
            fields["joined_at"].read_only = True
        return fields

    def validate(self, data):
        joined_at = data.get("joined_at") or getattr(self.instance, "joined_at", None)
        left_at = data.get("left_at")
        if joined_at and left_at and left_at < joined_at:
            raise serializers.ValidationError(
                {"left_at": "left_at cannot be before joined_at."}
            )

        # Guard against duplicate active memberships at the same academy (create only).
        if self.instance is None:
            player = self.context.get("player")
            academy = data.get("academy")
            incoming_status = data.get("status", PlayerAcademyMembership.Status.ACTIVE)
            if (
                player
                and academy
                and incoming_status == PlayerAcademyMembership.Status.ACTIVE
                and PlayerAcademyMembership.objects.filter(
                    player=player,
                    academy=academy,
                    status=PlayerAcademyMembership.Status.ACTIVE,
                ).exists()
            ):
                raise serializers.ValidationError(
                    "Player already has an active membership at this academy."
                )
        return data

    def create(self, validated_data):
        player = self.context["player"]
        return PlayerAcademyMembership.objects.create(player=player, **validated_data)
