from django import forms

from .models import TenantWorkflowConfig


class WorkflowConfigForm(forms.ModelForm):
    class Meta:
        model = TenantWorkflowConfig
        fields = ["sub_branch_tier_enabled"]
        widgets = {
            "sub_branch_tier_enabled": forms.CheckboxInput(
                attrs={"class": "form-check-input"}
            ),
        }
