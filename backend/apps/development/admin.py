from django.contrib import admin

from .models import Assessment, AssessmentItem, DevelopmentGoal, PhysicalMeasurement, Skill


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "is_active", "created_at"]
    list_filter = ["category", "is_active"]
    search_fields = ["name"]
    ordering = ["category", "name"]
    readonly_fields = ["id", "created_at", "updated_at"]


class AssessmentItemInline(admin.TabularInline):
    model = AssessmentItem
    extra = 0
    readonly_fields = ["id"]


@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ["player", "coach", "assessment_date", "created_at"]
    list_filter = ["assessment_date"]
    search_fields = ["player__first_name", "player__last_name", "coach__email"]
    readonly_fields = ["id", "created_at"]
    inlines = [AssessmentItemInline]


@admin.register(DevelopmentGoal)
class DevelopmentGoalAdmin(admin.ModelAdmin):
    list_display = ["title", "player", "skill", "status", "start_date", "target_date"]
    list_filter = ["status"]
    search_fields = ["title", "player__first_name", "player__last_name"]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(PhysicalMeasurement)
class PhysicalMeasurementAdmin(admin.ModelAdmin):
    list_display = ["player", "measurement_date", "height_cm", "weight_kg", "created_at"]
    search_fields = ["player__first_name", "player__last_name"]
    readonly_fields = ["id", "created_at"]
