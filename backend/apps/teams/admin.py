from django.contrib import admin

from .models import Team, PlayerTeamMembership


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ["name", "academy", "age_group", "gender", "season", "created_at"]
    list_filter = ["academy", "age_group", "gender", "season"]
    search_fields = ["name", "academy__name"]
    readonly_fields = ["id", "created_at", "updated_at"]
    ordering = ["academy", "name"]
    fieldsets = [
        ("Identity", {"fields": ["id", "academy", "name"]}),
        ("Details", {"fields": ["age_group", "gender", "season"]}),
        ("Timestamps", {"fields": ["created_at", "updated_at"], "classes": ["collapse"]}),
    ]


@admin.register(PlayerTeamMembership)
class PlayerTeamMembershipAdmin(admin.ModelAdmin):
    list_display = ["player", "team", "joined_at", "left_at", "status"]
    list_filter = ["status", "team__academy"]
    search_fields = [
        "player__first_name",
        "player__last_name",
        "player__football_id",
        "team__name",
    ]
    readonly_fields = ["id", "created_at"]
    ordering = ["-joined_at"]
