from django.contrib import admin

from .models import Academy, AcademyStaffMembership, PlayerAcademyMembership


@admin.register(Academy)
class AcademyAdmin(admin.ModelAdmin):
    list_display = ["name", "city", "country", "created_at"]
    search_fields = ["name", "city", "country"]
    readonly_fields = ["id", "created_at", "updated_at"]
    ordering = ["name"]
    fieldsets = [
        ("Identity", {"fields": ["id", "name", "description", "logo_url"]}),
        ("Location", {"fields": ["city", "country"]}),
        ("Timestamps", {"fields": ["created_at", "updated_at"], "classes": ["collapse"]}),
    ]


@admin.register(PlayerAcademyMembership)
class PlayerAcademyMembershipAdmin(admin.ModelAdmin):
    list_display = ["player", "academy", "joined_at", "left_at", "status"]
    list_filter = ["status", "academy"]
    search_fields = ["player__first_name", "player__last_name", "player__football_id", "academy__name"]
    readonly_fields = ["id", "created_at"]
    ordering = ["-joined_at"]


@admin.register(AcademyStaffMembership)
class AcademyStaffMembershipAdmin(admin.ModelAdmin):
    list_display = ["user", "academy", "created_at"]
    list_filter = ["academy"]
    search_fields = ["user__email", "user__first_name", "user__last_name", "academy__name"]
    readonly_fields = ["id", "created_at"]
    ordering = ["-created_at"]
