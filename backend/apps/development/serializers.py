from rest_framework import serializers

from .models import (
    Assessment,
    AssessmentItem,
    DevelopmentGoal,
    PhysicalMeasurement,
    Skill,
)


# ---------------------------------------------------------------------------
# Skill
# ---------------------------------------------------------------------------


class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ["id", "name", "category", "description", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Assessment
# ---------------------------------------------------------------------------


class AssessmentItemSerializer(serializers.ModelSerializer):
    skill_name = serializers.CharField(source="skill.name", read_only=True)
    skill_category = serializers.CharField(source="skill.category", read_only=True)

    class Meta:
        model = AssessmentItem
        fields = ["id", "skill", "skill_name", "skill_category", "score", "comment"]
        read_only_fields = ["id"]


class AssessmentDetailSerializer(serializers.ModelSerializer):
    items = AssessmentItemSerializer(many=True, read_only=True)
    coach_name = serializers.CharField(source="coach.full_name", read_only=True)

    class Meta:
        model = Assessment
        fields = [
            "id",
            "player",
            "coach",
            "coach_name",
            "assessment_date",
            "overall_comment",
            "items",
            "created_at",
        ]
        read_only_fields = ["id", "player", "coach", "created_at"]


class AssessmentItemInputSerializer(serializers.Serializer):
    """Input serializer for items nested inside AssessmentCreateSerializer."""

    skill = serializers.PrimaryKeyRelatedField(
        queryset=Skill.objects.filter(is_active=True)
    )
    score = serializers.IntegerField(min_value=0, max_value=100)
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class AssessmentCreateSerializer(serializers.ModelSerializer):
    items = AssessmentItemInputSerializer(many=True)

    class Meta:
        model = Assessment
        fields = ["id", "assessment_date", "overall_comment", "items", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError(
                "At least one assessment item is required."
            )
        skill_ids = [item["skill"].pk for item in items]
        if len(skill_ids) != len(set(skill_ids)):
            raise serializers.ValidationError(
                "Duplicate skills are not allowed in an assessment."
            )
        return items

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        assessment = Assessment.objects.create(**validated_data)
        AssessmentItem.objects.bulk_create(
            [
                AssessmentItem(
                    assessment=assessment,
                    skill=item["skill"],
                    score=item["score"],
                    comment=item.get("comment", ""),
                )
                for item in items_data
            ]
        )
        return assessment

    def to_representation(self, instance):
        return AssessmentDetailSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# Development Goal
# ---------------------------------------------------------------------------


class DevelopmentGoalSerializer(serializers.ModelSerializer):
    skill_name = serializers.CharField(source="skill.name", read_only=True, default=None)

    class Meta:
        model = DevelopmentGoal
        fields = [
            "id",
            "player",
            "skill",
            "skill_name",
            "title",
            "description",
            "target_value",
            "current_value",
            "status",
            "start_date",
            "target_date",
            "completed_at",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "player", "created_by", "created_at", "updated_at"]

    def validate(self, data):
        # Determine effective start_date (from data or from existing instance on PATCH)
        start_date = data.get("start_date")
        if start_date is None and self.instance is not None:
            start_date = self.instance.start_date

        target_date = data.get("target_date")
        if target_date is None and self.instance is not None:
            target_date = self.instance.target_date

        if start_date and target_date and target_date < start_date:
            raise serializers.ValidationError(
                {"target_date": "Target date cannot be before start date."}
            )
        return data


# ---------------------------------------------------------------------------
# Physical Measurement
# ---------------------------------------------------------------------------


class PhysicalMeasurementSerializer(serializers.ModelSerializer):
    class Meta:
        model = PhysicalMeasurement
        fields = [
            "id",
            "player",
            "measurement_date",
            "height_cm",
            "weight_kg",
            "body_fat_percentage",
            "sprint_time_seconds",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "player", "created_at"]
