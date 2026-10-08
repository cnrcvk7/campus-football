from rest_framework import serializers

from apps.development.models import Skill

from .models import Exercise, TrainingAttendance, TrainingSession, TrainingSessionExercise


# ---------------------------------------------------------------------------
# Exercise
# ---------------------------------------------------------------------------


class ExerciseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = Exercise
        fields = [
            "id",
            "name",
            "description",
            "category",
            "duration_minutes",
            "created_by",
            "created_by_name",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Focus skill (minimal read representation)
# ---------------------------------------------------------------------------


class FocusSkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ["id", "name", "category"]


# ---------------------------------------------------------------------------
# Training Session Exercise
# ---------------------------------------------------------------------------


class SessionExerciseReadSerializer(serializers.ModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)
    exercise_category = serializers.CharField(source="exercise.category", read_only=True)

    class Meta:
        model = TrainingSessionExercise
        fields = [
            "id",
            "exercise",
            "exercise_name",
            "exercise_category",
            "order",
            "duration_minutes",
            "notes",
        ]
        read_only_fields = ["id"]


class SessionExerciseWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingSessionExercise
        fields = ["id", "exercise", "order", "duration_minutes", "notes"]
        read_only_fields = ["id"]

    def to_representation(self, instance):
        return SessionExerciseReadSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# Training Session
# ---------------------------------------------------------------------------


class TrainingSessionReadSerializer(serializers.ModelSerializer):
    academy_name = serializers.CharField(source="academy.name", read_only=True)
    team_name = serializers.CharField(source="team.name", read_only=True, default=None)
    coach_name = serializers.CharField(source="coach.full_name", read_only=True)
    focus_skills = FocusSkillSerializer(many=True, read_only=True)
    session_exercises = SessionExerciseReadSerializer(many=True, read_only=True)

    class Meta:
        model = TrainingSession
        fields = [
            "id",
            "academy",
            "academy_name",
            "team",
            "team_name",
            "title",
            "description",
            "training_date",
            "start_time",
            "duration_minutes",
            "location",
            "coach",
            "coach_name",
            "focus_skills",
            "session_exercises",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "coach", "created_at", "updated_at"]


class TrainingSessionWriteSerializer(serializers.ModelSerializer):
    focus_skills = serializers.PrimaryKeyRelatedField(
        queryset=Skill.objects.filter(is_active=True),
        many=True,
        required=False,
    )

    class Meta:
        model = TrainingSession
        fields = [
            "id",
            "academy",
            "team",
            "title",
            "description",
            "training_date",
            "start_time",
            "duration_minutes",
            "location",
            "focus_skills",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, data):
        # Resolve effective values (existing instance values for partial updates)
        team = data.get("team", getattr(self.instance, "team", None))
        academy = data.get("academy", getattr(self.instance, "academy", None))
        if team and academy and team.academy_id != academy.pk:
            raise serializers.ValidationError(
                {"team": "Team must belong to the selected academy."}
            )
        return data

    def create(self, validated_data):
        focus_skills = validated_data.pop("focus_skills", [])
        session = TrainingSession.objects.create(**validated_data)
        if focus_skills:
            session.focus_skills.set(focus_skills)
        return session

    def update(self, instance, validated_data):
        focus_skills = validated_data.pop("focus_skills", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if focus_skills is not None:
            instance.focus_skills.set(focus_skills)
        return instance

    def to_representation(self, instance):
        return TrainingSessionReadSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------


class TrainingAttendanceReadSerializer(serializers.ModelSerializer):
    player_name = serializers.SerializerMethodField()
    football_id = serializers.CharField(source="player.football_id", read_only=True)

    class Meta:
        model = TrainingAttendance
        fields = [
            "id",
            "session",
            "player",
            "player_name",
            "football_id",
            "status",
            "notes",
            "recorded_at",
        ]
        read_only_fields = ["id", "session", "recorded_at"]

    def get_player_name(self, obj) -> str:
        return f"{obj.player.first_name} {obj.player.last_name}"


class TrainingAttendanceWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingAttendance
        fields = ["id", "player", "status", "notes", "recorded_at"]
        read_only_fields = ["id", "recorded_at"]

    def validate(self, data):
        if self.instance is None:
            # On create — check for duplicate attendance in the same session.
            session = self.context.get("session")
            player = data.get("player")
            if session and player:
                if TrainingAttendance.objects.filter(
                    session=session, player=player
                ).exists():
                    raise serializers.ValidationError(
                        {
                            "player": (
                                "Attendance already recorded for this player "
                                "in this session."
                            )
                        }
                    )
        return data

    def create(self, validated_data):
        session = self.context["session"]
        return TrainingAttendance.objects.create(session=session, **validated_data)

    def to_representation(self, instance):
        return TrainingAttendanceReadSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# Player Training History
# ---------------------------------------------------------------------------


class PlayerTrainingSessionSerializer(serializers.ModelSerializer):
    """Session as seen from a player's personal training history view."""

    academy_name = serializers.CharField(source="academy.name", read_only=True)
    team_name = serializers.CharField(source="team.name", read_only=True, default=None)
    focus_skills = FocusSkillSerializer(many=True, read_only=True)
    attendance_status = serializers.SerializerMethodField()
    attendance_notes = serializers.SerializerMethodField()

    class Meta:
        model = TrainingSession
        fields = [
            "id",
            "title",
            "training_date",
            "location",
            "academy",
            "academy_name",
            "team",
            "team_name",
            "focus_skills",
            "attendance_status",
            "attendance_notes",
        ]

    def _get_attendance(self, session):
        player = self.context.get("player")
        if not player:
            return None
        return session.attendance.filter(player=player).first()

    def get_attendance_status(self, session):
        record = self._get_attendance(session)
        return record.status if record else None

    def get_attendance_notes(self, session):
        record = self._get_attendance(session)
        return record.notes if record else ""
