import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Exercise(models.Model):
    """A reusable football exercise that can appear in many training sessions."""

    class Category(models.TextChoices):
        TECHNICAL = "TECHNICAL", "Technical"
        TACTICAL = "TACTICAL", "Tactical"
        PHYSICAL = "PHYSICAL", "Physical"
        MENTAL = "MENTAL", "Mental"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    category = models.CharField(max_length=20, choices=Category.choices)
    duration_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="exercises_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "exercises"
        ordering = ["category", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.category})"


class TrainingSession(models.Model):
    """
    A single training session for an academy, optionally tied to a specific team.

    focus_skills links to Development Skills to indicate which football attributes
    the session develops. This never automatically modifies assessment scores —
    training and assessment are separate systems.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    academy = models.ForeignKey(
        "academies.Academy",
        on_delete=models.PROTECT,
        related_name="training_sessions",
    )
    team = models.ForeignKey(
        "teams.Team",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="training_sessions",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    training_date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    duration_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    location = models.CharField(max_length=200, blank=True, default="")
    coach = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="training_sessions_led",
    )
    # M2M to Development Skills — indicates focus areas without modifying scores.
    focus_skills = models.ManyToManyField(
        "development.Skill",
        blank=True,
        related_name="training_sessions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "training_sessions"
        ordering = ["-training_date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.training_date})"


class TrainingSessionExercise(models.Model):
    """An exercise included in a training session, with ordering and optional override duration."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        TrainingSession,
        on_delete=models.CASCADE,
        related_name="session_exercises",
    )
    exercise = models.ForeignKey(
        Exercise,
        on_delete=models.PROTECT,
        related_name="session_exercises",
    )
    order = models.PositiveSmallIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text="Display order within the session (1-based).",
    )
    duration_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "training_session_exercises"
        ordering = ["order"]

    def __str__(self) -> str:
        return f"{self.exercise.name} in {self.session} (#{self.order})"


class TrainingAttendance(models.Model):
    """Attendance record for a single player at a single training session."""

    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        ABSENT = "ABSENT", "Absent"
        LATE = "LATE", "Late"
        EXCUSED = "EXCUSED", "Excused"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        TrainingSession,
        on_delete=models.CASCADE,
        related_name="attendance",
    )
    player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        related_name="training_attendance",
    )
    status = models.CharField(max_length=10, choices=Status.choices)
    notes = models.TextField(blank=True, default="")
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "training_attendance"
        unique_together = [("session", "player")]
        ordering = ["-recorded_at"]

    def __str__(self) -> str:
        return f"{self.player} @ {self.session}: {self.status}"
