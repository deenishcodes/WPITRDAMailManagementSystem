from django.contrib import admin

from .models import Correspondence, CorrespondenceAttachment, RegistrationCounter, RoutingEvent


@admin.register(Correspondence)
class CorrespondenceAdmin(admin.ModelAdmin):
    list_display = (
        "registration_number",
        "subject",
        "department",
        "status",
        "current_holder",
        "date_received",
    )
    list_filter = ("status", "department")
    search_fields = ("registration_number", "subject", "sender_name")
    readonly_fields = ("registration_number", "created_at", "updated_at")


@admin.register(RoutingEvent)
class RoutingEventAdmin(admin.ModelAdmin):
    list_display = ("correspondence", "action", "actor", "to_user", "created_at")
    list_filter = ("action",)


@admin.register(CorrespondenceAttachment)
class CorrespondenceAttachmentAdmin(admin.ModelAdmin):
    list_display = ("correspondence", "original_filename", "uploaded_by", "uploaded_at")
    readonly_fields = ("uploaded_at",)


@admin.register(RegistrationCounter)
class RegistrationCounterAdmin(admin.ModelAdmin):
    # Read-only — hand-editing this would desync the registration sequence.
    list_display = ("year", "last_number")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
