from django.utils import timezone
from rest_framework import serializers

from .models import Announcement, AnnouncementReceipt


class AnnouncementListSerializer(serializers.ModelSerializer):
    """Read-only serializer for feed listing."""

    author_name = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    is_acknowledged = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id",
            "academy",
            "team",
            "related_match",
            "related_session",
            "author",
            "author_name",
            "title",
            "body",
            "is_pinned",
            "edited_at",
            "created_at",
            "is_read",
            "is_acknowledged",
        ]

    def get_author_name(self, obj) -> str | None:
        if obj.author:
            return obj.author.full_name
        return None

    def _get_receipt(self, obj):
        user = self.context["request"].user
        # Prefetched receipts filtered to current user
        receipts = getattr(obj, "_user_receipts", None)
        if receipts is not None:
            return receipts[0] if receipts else None
        # Fallback (detail view)
        return AnnouncementReceipt.objects.filter(
            announcement=obj, user=user
        ).first()

    def get_is_read(self, obj) -> bool:
        receipt = self._get_receipt(obj)
        return receipt is not None and receipt.read_at is not None

    def get_is_acknowledged(self, obj) -> bool:
        receipt = self._get_receipt(obj)
        return receipt is not None and receipt.acknowledged_at is not None


class AnnouncementCreateSerializer(serializers.ModelSerializer):
    """Validates and creates an announcement."""

    class Meta:
        model = Announcement
        fields = [
            "id",
            "academy",
            "team",
            "related_match",
            "related_session",
            "title",
            "body",
            "is_pinned",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_body(self, value):
        if len(value) > 2000:
            raise serializers.ValidationError(
                "Body must be at most 2000 characters.",
                code="body_too_long",
            )
        return value

    def validate(self, attrs):
        team = attrs.get("team")
        academy = attrs["academy"]
        related_match = attrs.get("related_match")
        related_session = attrs.get("related_session")

        if team and team.academy_id != academy.pk:
            raise serializers.ValidationError(
                {"team": "This team does not belong to the selected academy."},
                code="team_not_in_academy",
            )

        if related_match and related_session:
            raise serializers.ValidationError(
                "Cannot link both a match and a training session.",
                code="related_event_mismatch",
            )

        if related_match:
            if related_match.academy_id != academy.pk:
                raise serializers.ValidationError(
                    {"related_match": "Match does not belong to this academy."},
                    code="related_event_mismatch",
                )
            if team and related_match.team_id != team.pk:
                raise serializers.ValidationError(
                    {"related_match": "Match does not belong to the selected team."},
                    code="related_event_mismatch",
                )

        if related_session:
            if related_session.academy_id != academy.pk:
                raise serializers.ValidationError(
                    {"related_session": "Training session does not belong to this academy."},
                    code="related_event_mismatch",
                )
            if team and related_session.team_id and related_session.team_id != team.pk:
                raise serializers.ValidationError(
                    {"related_session": "Training session does not belong to the selected team."},
                    code="related_event_mismatch",
                )

        return attrs


class AnnouncementUpdateSerializer(serializers.ModelSerializer):
    """Validates edits to an existing announcement (title, body).

    is_pinned is read-only here — pinning is done via dedicated
    POST /pin/ and /unpin/ actions (author or academy admin).
    """

    class Meta:
        model = Announcement
        fields = ["title", "body", "is_pinned"]
        read_only_fields = ["is_pinned"]

    def validate_body(self, value):
        if len(value) > 2000:
            raise serializers.ValidationError(
                "Body must be at most 2000 characters.",
                code="body_too_long",
            )
        return value

    def update(self, instance, validated_data):
        title_or_body_changed = (
            "title" in validated_data and validated_data["title"] != instance.title
        ) or (
            "body" in validated_data and validated_data["body"] != instance.body
        )
        instance = super().update(instance, validated_data)
        if title_or_body_changed:
            instance.edited_at = timezone.now()
            instance.save(update_fields=["edited_at", "updated_at"])
        return instance


class ReceiptUserSerializer(serializers.Serializer):
    """Minimal user info for receipt lists."""

    id = serializers.UUIDField()
    email = serializers.EmailField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    role = serializers.CharField()
    acknowledged_at = serializers.DateTimeField(allow_null=True)
    read_at = serializers.DateTimeField(allow_null=True)
