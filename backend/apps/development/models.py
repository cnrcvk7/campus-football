import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Skill(models.Model):
    """A football skill that can be assessed."""

    class Category(models.TextChoices):
        TECHNICAL = "TECHNICAL", "Technical"
        TACTICAL = "TACTICAL", "Tactical"
        PHYSICAL = "PHYSICAL", "Physical"
        MENTAL = "MENTAL", "Mental"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=20, choices=Category.choices)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "skills"
        ordering = ["category", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.category})"


class Assessment(models.Model):
    """
    A coach's evaluation of a player at a specific point in time.

    Assessments are immutable — once created they are never updated.
    Each assessment creates a new row so that historical development
    can be tracked accurately.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        related_name="assessments",
    )
    coach = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="assessments_given",
    )
    assessment_date = models.DateField()
    overall_comment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "assessments"
        ordering = ["-assessment_date", "-created_at"]

    def __str__(self) -> str:
        return f"Assessment of {self.player} on {self.assessment_date}"


class AssessmentItem(models.Model):
    """A single skill score within an assessment."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assessment = models.ForeignKey(
        Assessment,
        on_delete=models.CASCADE,
        related_name="items",
    )
    skill = models.ForeignKey(
        Skill,
        on_delete=models.PROTECT,
        related_name="assessment_items",
    )
    score = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Score on a 0–100 scale.",
    )
    comment = models.TextField(blank=True, default="")

    class Meta:
        db_table = "assessment_items"
        unique_together = [("assessment", "skill")]

    def __str__(self) -> str:
        return f"{self.skill.name}: {self.score}"


class DevelopmentGoal(models.Model):
    """A development target set for a player."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        related_name="development_goals",
    )
    skill = models.ForeignKey(
        Skill,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="development_goals",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    target_value = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    current_value = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    start_date = models.DateField()
    target_date = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_goals",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "development_goals"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.player})"


class PhysicalMeasurement(models.Model):
    """A physical measurement snapshot for a player."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        related_name="physical_measurements",
    )
    measurement_date = models.DateField()
    height_cm = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    weight_kg = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    body_fat_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    sprint_time_seconds = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "physical_measurements"
        ordering = ["-measurement_date", "-created_at"]

    def __str__(self) -> str:
        return f"Measurement of {self.player} on {self.measurement_date}"
