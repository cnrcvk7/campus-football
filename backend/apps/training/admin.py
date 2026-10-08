from django.contrib import admin

from .models import Exercise, TrainingAttendance, TrainingSession, TrainingSessionExercise


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "duration_minutes", "is_active", "created_by"]
    list_filter = ["category", "is_active"]
    search_fields = ["name"]
    readonly_fields = ["id", "created_at", "updated_at"]


class SessionExerciseInline(admin.TabularInline):
    model = TrainingSessionExercise
    extra = 0
    readonly_fields = ["id"]


class AttendanceInline(admin.TabularInline):
    model = TrainingAttendance
    extra = 0
    readonly_fields = ["id", "recorded_at"]


@admin.register(TrainingSession)
class TrainingSessionAdmin(admin.ModelAdmin):
    list_display = ["title", "academy", "team", "training_date", "coach", "created_at"]
    list_filter = ["training_date", "academy"]
    search_fields = ["title", "academy__name", "team__name"]
    readonly_fields = ["id", "created_at", "updated_at"]
    filter_horizontal = ["focus_skills"]
    inlines = [SessionExerciseInline, AttendanceInline]


@admin.register(TrainingAttendance)
class TrainingAttendanceAdmin(admin.ModelAdmin):
    list_display = ["player", "session", "status", "recorded_at"]
    list_filter = ["status"]
    search_fields = ["player__first_name", "player__last_name"]
    readonly_fields = ["id", "recorded_at"]
