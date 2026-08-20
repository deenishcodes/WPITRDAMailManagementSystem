from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Organisation", {"fields": ("department", "division", "sub_division", "designation")}),
    )
    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "department",
        "division",
        "sub_division",
        "designation",
        "is_staff",
    )
