import uuid

from django.db import models


class Academy(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    country = models.CharField(max_length=100, blank=True, default="")
    logo_url = models.URLField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "academies"
        verbose_name_plural = "academies"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class PlayerAcademyMembership(models.Model):
    """
    Records a player's membership at an academy.

    History is preserved — records are never deleted when a player leaves.
    A null left_at means the player is currently active at this academy.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        LEFT = "left", "Left"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # String FKs avoid Python-level circular imports with the players app.
    player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        related_name="academy_memberships",
    )
    academy = models.ForeignKey(
        Academy,
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
        db_table = "player_academy_memberships"
        ordering = ["-joined_at"]

    def __str__(self) -> str:
        return f"{self.player_id} @ {self.academy} (joined {self.joined_at})"
