from django.contrib import admin

from .models import Announcement, AnnouncementReceipt


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "academy",
        "team",
        "author",
        "is_pinned",
        "deleted_at",
        "created_at",
    ]
    list_filter = ["is_pinned", "academy"]
    search_fields = ["title"]
    readonly_fields = ["id", "created_at", "updated_at"]
    ordering = ["-created_at"]


@admin.register(AnnouncementReceipt)
class AnnouncementReceiptAdmin(admin.ModelAdmin):
    list_display = ["announcement", "user", "read_at", "acknowledged_at"]
    readonly_fields = ["id"]
