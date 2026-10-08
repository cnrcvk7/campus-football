from django.db.models import Avg, Sum
from rest_framework import serializers

from .models import Match, MatchPlayerStats


# ---------------------------------------------------------------------------
# Match
# ---------------------------------------------------------------------------


class MatchReadSerializer(serializers.ModelSerializer):
    academy_name = serializers.CharField(source="academy.name", read_only=True)
    team_name = serializers.CharField(source="team.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    result = serializers.CharField(read_only=True)
    score_display = serializers.CharField(read_only=True)

    class Meta:
        model = Match
        fields = [
            "id",
            "academy",
            "academy_name",
            "team",
            "team_name",
            "opponent_name",
            "match_date",
            "venue",
            "competition",
            "home_away",
            "team_score",
            "opponent_score",
            "result",
            "score_display",
            "notes",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


class MatchWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Match
        fields = [
            "id",
            "academy",
            "team",
            "opponent_name",
            "match_date",
            "venue",
            "competition",
            "home_away",
            "team_score",
            "opponent_score",
            "notes",
        ]
        read_only_fields = ["id"]

    def validate(self, data):
        team = data.get("team", getattr(self.instance, "team", None))
        academy = data.get("academy", getattr(self.instance, "academy", None))
        if team and academy and team.academy_id != academy.pk:
            raise serializers.ValidationError(
                {"team": "Team must belong to the selected academy."}
            )
        return data

    def to_representation(self, instance):
        return MatchReadSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# Match Player Stats
# ---------------------------------------------------------------------------


class MatchPlayerStatsReadSerializer(serializers.ModelSerializer):
    player_name = serializers.SerializerMethodField()
    football_id = serializers.CharField(source="player.football_id", read_only=True)

    class Meta:
        model = MatchPlayerStats
        fields = [
            "id",
            "match",
            "player",
            "player_name",
            "football_id",
            "started",
            "minutes_played",
            "goals",
            "assists",
            "shots",
            "shots_on_target",
            "passes_attempted",
            "passes_completed",
            "key_passes",
            "dribbles",
            "tackles",
            "interceptions",
            "yellow_cards",
            "red_cards",
            "rating",
            "coach_comment",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "match", "created_at", "updated_at"]

    def get_player_name(self, obj) -> str:
        return f"{obj.player.first_name} {obj.player.last_name}"


class MatchPlayerStatsWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = MatchPlayerStats
        fields = [
            "id",
            "player",
            "started",
            "minutes_played",
            "goals",
            "assists",
            "shots",
            "shots_on_target",
            "passes_attempted",
            "passes_completed",
            "key_passes",
            "dribbles",
            "tackles",
            "interceptions",
            "yellow_cards",
            "red_cards",
            "rating",
            "coach_comment",
        ]
        read_only_fields = ["id"]

    def validate(self, data):
        if self.instance is None:
            # On create — check for duplicate stats in the same match.
            match = self.context.get("match")
            player = data.get("player")
            if match and player:
                if MatchPlayerStats.objects.filter(match=match, player=player).exists():
                    raise serializers.ValidationError(
                        {
                            "player": (
                                "Statistics already recorded for this player in this match."
                            )
                        }
                    )
        return data

    def create(self, validated_data):
        match = self.context["match"]
        return MatchPlayerStats.objects.create(match=match, **validated_data)

    def to_representation(self, instance):
        return MatchPlayerStatsReadSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# Player Match History
# ---------------------------------------------------------------------------


class PlayerMatchHistorySerializer(serializers.ModelSerializer):
    """A player's stats for one match, with match context embedded inline."""

    match_date = serializers.DateField(source="match.match_date", read_only=True)
    opponent = serializers.CharField(source="match.opponent_name", read_only=True)
    home_away = serializers.CharField(source="match.home_away", read_only=True)
    team_score = serializers.IntegerField(source="match.team_score", read_only=True)
    opponent_score = serializers.IntegerField(source="match.opponent_score", read_only=True)
    result = serializers.CharField(source="match.result", read_only=True)
    score_display = serializers.CharField(source="match.score_display", read_only=True)
    competition = serializers.CharField(source="match.competition", read_only=True)
    venue = serializers.CharField(source="match.venue", read_only=True)

    class Meta:
        model = MatchPlayerStats
        fields = [
            "id",
            "match",
            "match_date",
            "opponent",
            "home_away",
            "team_score",
            "opponent_score",
            "result",
            "score_display",
            "competition",
            "venue",
            "started",
            "minutes_played",
            "goals",
            "assists",
            "shots",
            "shots_on_target",
            "passes_attempted",
            "passes_completed",
            "key_passes",
            "dribbles",
            "tackles",
            "interceptions",
            "yellow_cards",
            "red_cards",
            "rating",
            "coach_comment",
        ]


# ---------------------------------------------------------------------------
# Player Match Summary
# ---------------------------------------------------------------------------


class PlayerMatchSummarySerializer(serializers.Serializer):
    """
    Aggregated match statistics for a player.
    Computed from MatchPlayerStats queryset — never stored as duplicated totals.
    """

    matches_played = serializers.IntegerField()
    starts = serializers.IntegerField()
    total_minutes = serializers.IntegerField()
    goals = serializers.IntegerField()
    assists = serializers.IntegerField()
    average_rating = serializers.DecimalField(
        max_digits=4, decimal_places=2, allow_null=True
    )
    total_shots = serializers.IntegerField()
    total_passes_completed = serializers.IntegerField()
    total_dribbles = serializers.IntegerField()
    total_tackles = serializers.IntegerField()
    yellow_cards = serializers.IntegerField()
    red_cards = serializers.IntegerField()
