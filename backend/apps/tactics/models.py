import uuid

from django.conf import settings
from django.db import models

from apps.players.models import Player

from .formations import FORMATIONS, GAME_FORMATS


class Lineup(models.Model):
    """
    A single match lineup with formation, drawing overlay, and draft/published state.

    v1: one lineup per match (UniqueConstraint on match).
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"

    GAME_FORMAT_CHOICES = [(f, str(f)) for f in GAME_FORMATS]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    match = models.OneToOneField(
        "matches.Match",
        on_delete=models.CASCADE,
        related_name="lineup",
    )
    game_format = models.PositiveSmallIntegerField(choices=GAME_FORMAT_CHOICES)
    formation = models.CharField(max_length=20)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    published_at = models.DateTimeField(null=True, blank=True)
    drawing = models.JSONField(default=list, blank=True)
    version = models.PositiveIntegerField(default=1)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lineups_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lineups_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "lineups"
        # v1: one lineup per match — enforced by OneToOneField implicitly,
        # but add an explicit constraint for clarity / future-proofing.
        constraints = [
            models.UniqueConstraint(fields=["match"], name="lineup_one_per_match"),
        ]

    def __str__(self) -> str:
        return f"Lineup for {self.match} ({self.formation})"


class LineupSlot(models.Model):
    """
    A single player slot in a lineup (starter or substitute).
    """

    class Role(models.TextChoices):
        STARTER = "STARTER", "Starter"
        SUBSTITUTE = "SUBSTITUTE", "Substitute"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lineup = models.ForeignKey(
        Lineup,
        on_delete=models.CASCADE,
        related_name="slots",
    )
    player = models.ForeignKey(
        "players.Player",
        on_delete=models.CASCADE,
        related_name="lineup_slots",
    )
    role = models.CharField(max_length=12, choices=Role.choices)
    x = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    y = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    position_code = models.CharField(
        max_length=3,
        choices=Player.Position.choices,
        blank=True,
        default="",
    )
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "lineup_slots"
        constraints = [
            models.UniqueConstraint(
                fields=["lineup", "player"],
                name="slot_unique_player_per_lineup",
            ),
            models.CheckConstraint(
                check=(
                    models.Q(x__isnull=True) | (models.Q(x__gte=0) & models.Q(x__lte=1))
                ),
                name="slot_x_range_0_1",
            ),
            models.CheckConstraint(
                check=(
                    models.Q(y__isnull=True) | (models.Q(y__gte=0) & models.Q(y__lte=1))
                ),
                name="slot_y_range_0_1",
            ),
            models.CheckConstraint(
                check=(
                    ~models.Q(role="STARTER")
                    | (models.Q(x__isnull=False) & models.Q(y__isnull=False))
                ),
                name="slot_starter_requires_xy",
            ),
        ]
        ordering = ["order"]

    def __str__(self) -> str:
        return f"{self.player_id} ({self.role}) in lineup {self.lineup_id}"


class TacticBoard(models.Model):
    """
    A free-form tactics board (not tied to a match).
    Tokens and drawing stored as validated JSON.
    """

    GAME_FORMAT_CHOICES = [(f, str(f)) for f in GAME_FORMATS]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    academy = models.ForeignKey(
        "academies.Academy",
        on_delete=models.CASCADE,
        related_name="tactic_boards",
    )
    team = models.ForeignKey(
        "teams.Team",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tactic_boards",
    )
    title = models.CharField(max_length=120)
    game_format = models.PositiveSmallIntegerField(choices=GAME_FORMAT_CHOICES)
    tokens = models.JSONField(default=list, blank=True)
    drawing = models.JSONField(default=list, blank=True)
    version = models.PositiveIntegerField(default=1)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tactic_boards_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tactic_boards_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tactic_boards"
        indexes = [
            models.Index(fields=["academy", "-updated_at"], name="board_academy_updated"),
        ]
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.academy})"
