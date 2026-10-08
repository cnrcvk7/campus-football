import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Match(models.Model):
    """
    A single football match played by an academy team.

    The result (WIN / DRAW / LOSS) is derived from team_score and opponent_score
    at read time — it is never stored as a separate column.
    Match statistics do NOT automatically modify development assessment scores.
    """

    class HomeAway(models.TextChoices):
        HOME = "HOME", "Home"
        AWAY = "AWAY", "Away"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    academy = models.ForeignKey(
        "academies.Academy",
        on_delete=models.PROTECT,
        related_name="matches",
    )
    team = models.ForeignKey(
        "teams.Team",
        on_delete=models.PROTECT,
        related_name="matches",
    )
    opponent_name = models.CharField(max_length=200)
    match_date = models.DateField()
    venue = models.CharField(max_length=200, blank=True, default="")
    competition = models.CharField(max_length=200, blank=True, default="")
    home_away = models.CharField(max_length=4, choices=HomeAway.choices)
    team_score = models.PositiveSmallIntegerField(null=True, blank=True)
    opponent_score = models.PositiveSmallIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="matches_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "matches"
        ordering = ["-match_date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.team} vs {self.opponent_name} ({self.match_date})"

    @property
    def result(self) -> str | None:
        """Derive WIN / DRAW / LOSS from scores. Returns None if scores not yet recorded."""
        if self.team_score is None or self.opponent_score is None:
            return None
        if self.team_score > self.opponent_score:
            return "WIN"
        if self.team_score < self.opponent_score:
            return "LOSS"
        return "DRAW"

    @property
    def score_display(self) -> str | None:
        """e.g. '3-1'. Returns None if scores not recorded."""
        if self.team_score is None or self.opponent_score is None:
            return None
        return f"{self.team_score}-{self.opponent_score}"


class MatchPlayerStats(models.Model):
    """
    A single player's statistics for one match.

    One record per player per match (enforced via unique_together).
    These stats are informational — they never automatically create or modify
    Assessment/AssessmentItem rows.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    match = models.ForeignKey(
        Match,
        on_delete=models.CASCADE,
        related_name="player_stats",
    )
    player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        related_name="match_stats",
    )

    # Participation
    started = models.BooleanField(default=False)
    minutes_played = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0)],
    )

    # Attacking
    goals = models.PositiveSmallIntegerField(default=0)
    assists = models.PositiveSmallIntegerField(default=0)
    shots = models.PositiveSmallIntegerField(default=0)
    shots_on_target = models.PositiveSmallIntegerField(default=0)

    # Passing
    passes_attempted = models.PositiveSmallIntegerField(default=0)
    passes_completed = models.PositiveSmallIntegerField(default=0)
    key_passes = models.PositiveSmallIntegerField(default=0)

    # Duel / defensive
    dribbles = models.PositiveSmallIntegerField(default=0)
    tackles = models.PositiveSmallIntegerField(default=0)
    interceptions = models.PositiveSmallIntegerField(default=0)

    # Discipline
    yellow_cards = models.PositiveSmallIntegerField(default=0)
    red_cards = models.PositiveSmallIntegerField(default=0)

    # Coach evaluation
    rating = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("10"))],
        help_text="Coach rating on a 0–10 scale.",
    )
    coach_comment = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "match_player_stats"
        unique_together = [("match", "player")]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.player} in {self.match}"
