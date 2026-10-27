import uuid

from django.conf import settings
from django.db import models


class Announcement(models.Model):
    """
    A one-way announcement from academy staff to a team or the whole academy.

    Audience is resolved at query time — there are no per-recipient fan-out rows.
    Soft-deleted announcements (deleted_at is not null) are excluded from all
    non-admin queries.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    academy = models.ForeignKey(
        "academies.Academy",
        on_delete=models.CASCADE,
        related_name="announcements",
    )
    team = models.ForeignKey(
        "teams.Team",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="announcements",
    )
    related_match = models.ForeignKey(
        "matches.Match",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="announcements",
    )
    related_session = models.ForeignKey(
        "training.TrainingSession",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="announcements",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="announcements",
    )
    title = models.CharField(max_length=120)
    body = models.TextField()
    is_pinned = models.BooleanField(default=False)
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "announcements"
        indexes = [
            models.Index(
                fields=["academy", "team", "-created_at"],
                name="ann_academy_team_created",
            ),
            models.Index(
                fields=["academy", "deleted_at"],
                name="ann_academy_deleted",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                check=~(
                    models.Q(related_match__isnull=False)
                    & models.Q(related_session__isnull=False)
                ),
                name="ann_not_both_match_and_session",
            ),
        ]
        ordering = ["-is_pinned", "-created_at"]

    def __str__(self) -> str:
        audience = self.team.name if self.team_id else "academy-wide"
        return f"{self.title} ({audience})"


class AnnouncementReceipt(models.Model):
    """
    Tracks read and acknowledgement state per user per announcement.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name="receipts",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="announcement_receipts",
    )
    read_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "announcement_receipts"
        constraints = [
            models.UniqueConstraint(
                fields=["announcement", "user"],
                name="ann_receipt_unique_user",
            ),
        ]

    def __str__(self) -> str:
        return f"Receipt: {self.user_id} → {self.announcement_id}"
