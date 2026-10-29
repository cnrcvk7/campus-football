from django.contrib import admin

from .models import Invitation


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ["id", "role", "academy", "player", "state", "created_by", "created_at"]
    list_filter = ["role"]
    readonly_fields = [
        "id", "token_hash", "role", "academy", "player", "email_hint",
        "created_by", "expires_at", "used_at", "used_by", "revoked_at", "created_at",
    ]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
