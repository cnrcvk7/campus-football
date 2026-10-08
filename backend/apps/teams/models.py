import uuid

from django.db import models


class Team(models.Model):
    class Gender(models.TextChoices):
        MALE = "M", "Male / Boys"
        FEMALE = "F", "Female / Girls"
        MIXED = "X", "Mixed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # String FK avoids Python-level import from academies at module load time.
    academy = models.ForeignKey(
        "academies.Academy",
        on_delete=models.PROTECT,
        related_name="teams",
    )
    name = models.CharField(max_length=200)
    age_group = models.CharField(max_length=20, blank=True, default="")
    gender = models.CharField(
        max_length=1,
        choices=Gender.choices,
        blank=True,
        default="",
    )
    season = models.CharField(max_length=20, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "teams"
        ordering = ["academy", "name"]

    def __str__(self) -> str:
        parts = [self.name]
        if self.age_group:
            parts.append(self.age_group)
        if self.season:
            parts.append(self.season)
        return f"{self.academy} — {' '.join(parts)}"


class PlayerTeamMembership(models.Model):
    """
    Records a player's membership in a team.

    History is preserved — records are never deleted when a player leaves.
    A null left_at means the player is currently active in this team.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        LEFT = "left", "Left"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        related_name="team_memberships",
    )
    team = models.ForeignKey(
        Team,
        on_delete=models.PROTECT,
        related_name="player_memberships",
    )
    joined_at = models.DateField()
    left_at = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "player_team_memberships"
        ordering = ["-joined_at"]

    def __str__(self) -> str:
        return f"{self.player_id} @ {self.team} (joined {self.joined_at})"
