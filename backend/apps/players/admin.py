from django.contrib import admin

from .models import Player


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = [
        "football_id",
        "first_name",
        "last_name",
        "date_of_birth",
        "gender",
        "preferred_position",
        "jersey_number",
        "created_at",
    ]
    list_filter = ["gender", "preferred_position"]
    search_fields = ["football_id", "first_name", "last_name"]
    readonly_fields = ["id", "football_id", "created_at", "updated_at"]
    ordering = ["-created_at"]
    fieldsets = [
        (
            "Identity",
            {
                "fields": ["id", "football_id"],
            },
        ),
        (
            "Personal Information",
            {
                "fields": [
                    "first_name",
                    "last_name",
                    "date_of_birth",
                    "gender",
                    "profile_photo_url",
                ],
            },
        ),
        (
            "Football",
            {
                "fields": ["preferred_position", "jersey_number"],
            },
        ),
        (
            "Timestamps",
            {
                "fields": ["created_at", "updated_at"],
                "classes": ["collapse"],
            },
        ),
    ]
