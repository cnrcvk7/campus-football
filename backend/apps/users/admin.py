from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["email", "first_name", "last_name", "role", "is_active", "is_staff", "created_at"]
    list_filter = ["role", "is_active", "is_staff"]
    search_fields = ["email", "first_name", "last_name"]
    ordering = ["email"]
    readonly_fields = ["id", "created_at", "updated_at", "last_login"]

    fieldsets = [
        ("Account", {"fields": ["id", "email", "password"]}),
        ("Personal Info", {"fields": ["first_name", "last_name"]}),
        ("Role & Access", {"fields": ["role", "is_active", "is_staff", "is_superuser"]}),
        ("Permissions", {"fields": ["groups", "user_permissions"], "classes": ["collapse"]}),
        ("Timestamps", {"fields": ["created_at", "updated_at", "last_login"], "classes": ["collapse"]}),
    ]

    add_fieldsets = [
        (
            None,
            {
                "classes": ["wide"],
                "fields": ["email", "first_name", "last_name", "role", "password1", "password2"],
            },
        ),
    ]
