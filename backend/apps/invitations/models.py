import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


def generate_invitation_token():
    """Generate a cryptographically secure URL-safe token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 hash of the raw token, returned as hex."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(token_hash_a: str, token_hash_b: str) -> bool:
    """Constant-time comparison of two token hashes."""
    return hmac.compare_digest(token_hash_a, token_hash_b)


class Invitation(models.Model):
    class Role(models.TextChoices):
        PLAYER = "PLAYER", "Player"
        PARENT = "PARENT", "Parent"
        COACH = "COACH", "Coach"
        ACADEMY_ADMIN = "ACADEMY_ADMIN", "Academy Admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    role = models.CharField(max_length=20, choices=Role.choices)
    academy = models.ForeignKey(
        "academies.Academy",
        on_delete=models.CASCADE,
        related_name="invitations",
    )
    player = models.ForeignKey(
        "players.Player",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="invitations",
    )
    email_hint = models.EmailField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_invitations",
    )
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    used_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="redeemed_invitations",
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "invitations"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Invitation {self.id} ({self.role} @ {self.academy_id})"

    @property
    def is_open(self) -> bool:
        return (
            self.used_at is None
            and self.revoked_at is None
            and self.expires_at > timezone.now()
        )

    @property
    def state(self) -> str:
        if self.used_at is not None:
            return "used"
        if self.revoked_at is not None:
            return "revoked"
        if self.expires_at <= timezone.now():
            return "expired"
        return "pending"

    @classmethod
    def create_invitation(cls, *, role, academy, player, email_hint, created_by):
        """
        Create a new invitation, revoking any existing open one for the same
        (player, role) combination. Returns (invitation, plain_token).
        """
        now = timezone.now()

        # Revoke existing open invitations for the same (player, role)
        if player is not None:
            cls.objects.filter(
                player=player,
                role=role,
                used_at__isnull=True,
                revoked_at__isnull=True,
                expires_at__gt=now,
            ).update(revoked_at=now)

        plain_token = generate_invitation_token()
        invitation = cls.objects.create(
            token_hash=hash_token(plain_token),
            role=role,
            academy=academy,
            player=player,
            email_hint=email_hint or "",
            created_by=created_by,
            expires_at=now + timedelta(days=7),
        )
        return invitation, plain_token
