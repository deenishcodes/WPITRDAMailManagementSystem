from django.contrib import admin

from .models import Department, Designation, Division, SubDivision, TenantWorkflowConfig


class SubDivisionInline(admin.TabularInline):
    model = SubDivision
    extra = 1


class DivisionInline(admin.TabularInline):
    model = Division
    extra = 1


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "short_code")
    inlines = [DivisionInline]


@admin.register(Division)
class DivisionAdmin(admin.ModelAdmin):
    list_display = ("name", "department")
    list_filter = ("department",)
    inlines = [SubDivisionInline]


@admin.register(SubDivision)
class SubDivisionAdmin(admin.ModelAdmin):
    list_display = ("name", "division")
    list_filter = ("division__department",)


@admin.register(Designation)
class DesignationAdmin(admin.ModelAdmin):
    list_display = ("title",)


@admin.register(TenantWorkflowConfig)
class TenantWorkflowConfigAdmin(admin.ModelAdmin):
    list_display = ("sub_branch_tier_enabled", "updated_at")

    def has_add_permission(self, request):
        # Singleton — never let the admin create a second row.
        return not TenantWorkflowConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
