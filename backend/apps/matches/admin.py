from django.contrib import admin

from .models import Match, MatchPlayerStats


class MatchPlayerStatsInline(admin.TabularInline):
    model = MatchPlayerStats
    extra = 0
    fields = [
        "player",
        "started",
        "minutes_played",
        "goals",
        "assists",
        "rating",
        "yellow_cards",
        "red_cards",
    ]


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = [
        "team",
        "opponent_name",
        "match_date",
        "home_away",
        "team_score",
        "opponent_score",
        "competition",
        "created_by",
    ]
    list_filter = ["home_away", "academy", "match_date"]
    search_fields = ["opponent_name", "competition", "venue"]
    ordering = ["-match_date"]
    inlines = [MatchPlayerStatsInline]


@admin.register(MatchPlayerStats)
class MatchPlayerStatsAdmin(admin.ModelAdmin):
    list_display = [
        "player",
        "match",
        "started",
        "minutes_played",
        "goals",
        "assists",
        "rating",
    ]
    list_filter = ["started", "match__match_date"]
    search_fields = [
        "player__first_name",
        "player__last_name",
        "match__opponent_name",
    ]
    ordering = ["-match__match_date"]
