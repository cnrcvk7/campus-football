import secrets
import string
import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

_FOOTBALL_ID_CHARS = string.ascii_uppercase + string.digits


class Player(models.Model):
    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        OTHER = "O", "Other"
        PREFER_NOT_TO_SAY = "P", "Prefer not to say"

    class Position(models.TextChoices):
        GOALKEEPER = "GK", "Goalkeeper"
        CENTRE_BACK = "CB", "Centre Back"
        LEFT_BACK = "LB", "Left Back"
        RIGHT_BACK = "RB", "Right Back"
        LEFT_WING_BACK = "LWB", "Left Wing Back"
        RIGHT_WING_BACK = "RWB", "Right Wing Back"
        DEFENSIVE_MID = "CDM", "Defensive Midfielder"
        CENTRAL_MID = "CM", "Central Midfielder"
        ATTACKING_MID = "CAM", "Attacking Midfielder"
        LEFT_MID = "LM", "Left Midfielder"
        RIGHT_MID = "RM", "Right Midfielder"
        LEFT_WING = "LW", "Left Winger"
        RIGHT_WING = "RW", "Right Winger"
        STRIKER = "ST", "Striker"
        CENTRE_FORWARD = "CF", "Centre Forward"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    football_id = models.CharField(
        max_length=12,
        unique=True,
        editable=False,
        db_index=True,
        help_text="Permanent, system-generated identifier. Format: CF-XXXXXXXX.",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=1, choices=Gender.choices)
    preferred_position = models.CharField(
        max_length=3,
        choices=Position.choices,
        blank=True,
        default="",
    )
    jersey_number = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(99)],
    )
    profile_photo_url = models.URLField(blank=True, default="")
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="player_profile",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "players"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name} ({self.football_id})"

    def save(self, *args, **kwargs) -> None:
        if not self.football_id:
            self.football_id = self._generate_unique_football_id()
        super().save(*args, **kwargs)

    @classmethod
    def _generate_unique_football_id(cls) -> str:
        for _ in range(10):
            suffix = "".join(secrets.choice(_FOOTBALL_ID_CHARS) for _ in range(8))
            candidate = f"CF-{suffix}"
            if not cls.objects.filter(football_id=candidate).exists():
                return candidate
        raise RuntimeError("Could not generate a unique Football ID after 10 attempts.")
