from rest_framework import serializers

from .models import Team, PlayerTeamMembership


class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = [
            "id",
            "academy",
            "name",
            "age_group",
            "gender",
            "season",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Serializers used by the Player history endpoint (read-only, nested)
# ---------------------------------------------------------------------------

class TeamBriefSerializer(serializers.ModelSerializer):
    """Compact team representation for nested use in history responses."""

    academy_name = serializers.CharField(source="academy.name", read_only=True)

    class Meta:
        model = Team
        fields = ["id", "name", "age_group", "gender", "season", "academy", "academy_name"]


class PlayerTeamMembershipHistorySerializer(serializers.ModelSerializer):
    team = TeamBriefSerializer(read_only=True)

    class Meta:
        model = PlayerTeamMembership
        fields = ["id", "team", "joined_at", "left_at", "status"]


# ---------------------------------------------------------------------------
# Internal serializer (used by old model-level tests only)
# ---------------------------------------------------------------------------

class PlayerTeamMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlayerTeamMembership
        fields = ["id", "player", "team", "joined_at", "left_at", "status"]
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
# API serializer — used by POST/PATCH /api/players/{id}/team-memberships/
# ---------------------------------------------------------------------------

class PlayerTeamMembershipAPISerializer(serializers.ModelSerializer):
    """
    Handles both creation and update of team memberships through the API.

    Rules:
    - `player` is never a field; it is injected from the URL by the view.
    - `team` and `joined_at` are required on creation and immutable afterwards.
    - Only `left_at` and `status` may be changed via PATCH.
    - Duplicate active memberships on the same team are rejected on creation.
    """

    class Meta:
        model = PlayerTeamMembership
        fields = ["id", "team", "joined_at", "left_at", "status", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_fields(self):
        fields = super().get_fields()
        # After creation, team and joined_at are immutable.
        if self.instance is not None:
            fields["team"].read_only = True
            fields["joined_at"].read_only = True
        return fields

    def validate(self, data):
        joined_at = data.get("joined_at") or getattr(self.instance, "joined_at", None)
        left_at = data.get("left_at")
        if joined_at and left_at and left_at < joined_at:
            raise serializers.ValidationError(
                {"left_at": "left_at cannot be before joined_at."}
            )

        # Guard against duplicate active memberships on the same team (create only).
        if self.instance is None:
            player = self.context.get("player")
            team = data.get("team")
            incoming_status = data.get("status", PlayerTeamMembership.Status.ACTIVE)
            if (
                player
                and team
                and incoming_status == PlayerTeamMembership.Status.ACTIVE
                and PlayerTeamMembership.objects.filter(
                    player=player,
                    team=team,
                    status=PlayerTeamMembership.Status.ACTIVE,
                ).exists()
            ):
                raise serializers.ValidationError(
                    "Player already has an active membership on this team."
                )
        return data

    def create(self, validated_data):
        player = self.context["player"]
        return PlayerTeamMembership.objects.create(player=player, **validated_data)
