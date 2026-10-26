from django.contrib import admin

from .models import Lineup, LineupSlot


class LineupSlotInline(admin.TabularInline):
    model = LineupSlot
    extra = 0
    fields = [
        "player",
        "role",
        "position_code",
        "x",
        "y",
        "order",
    ]


@admin.register(Lineup)
class LineupAdmin(admin.ModelAdmin):
    list_display = [
        "match",
        "game_format",
        "formation",
        "status",
        "version",
        "created_by",
        "updated_at",
    ]
    list_filter = ["status", "game_format"]
    search_fields = ["match__opponent_name", "formation"]
    ordering = ["-updated_at"]
    readonly_fields = ["version", "created_by", "updated_by", "created_at", "updated_at"]
    inlines = [LineupSlotInline]
