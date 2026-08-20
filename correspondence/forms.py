from django import forms
from django.contrib.auth import get_user_model

from orgstructure.models import Department, SubDivision

from .models import Correspondence

User = get_user_model()


class CorrespondenceRegisterForm(forms.ModelForm):
    class Meta:
        model = Correspondence
        fields = [
            "subject",
            "sender_name",
            "sender_address",
            "date_received",
            "received_via",
            "remarks",
            "department",
            "due_date",
        ]
        widgets = {
            "subject": forms.TextInput(attrs={"class": "form-control"}),
            "sender_name": forms.TextInput(attrs={"class": "form-control"}),
            "sender_address": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
            "date_received": forms.DateInput(attrs={"class": "form-control", "type": "date"}),
            "received_via": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "Post, hand delivery, email..."}
            ),
            "remarks": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
            "department": forms.Select(attrs={"class": "form-select"}),
            "due_date": forms.DateInput(attrs={"class": "form-control", "type": "date"}),
        }


class ForwardToSubDivisionForm(forms.Form):
    """Head of Branch forwarding while the Sub-Branch tier is enabled."""

    sub_division = forms.ModelChoiceField(
        queryset=SubDivision.objects.none(),
        label="Sub-Branch",
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    note = forms.CharField(
        required=False, widget=forms.Textarea(attrs={"class": "form-control", "rows": 2})
    )

    def __init__(self, *args, department=None, **kwargs):
        super().__init__(*args, **kwargs)
        queryset = SubDivision.objects.select_related("division")
        if department is not None:
            queryset = queryset.filter(division__department=department)
        self.fields["sub_division"].queryset = queryset


class ForwardToUserForm(forms.Form):
    """Forwarding straight to a named Subject Officer."""

    to_user = forms.ModelChoiceField(
        queryset=User.objects.none(),
        label="Subject Officer",
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    note = forms.CharField(
        required=False, widget=forms.Textarea(attrs={"class": "form-control", "rows": 2})
    )

    def __init__(self, *args, queryset=None, **kwargs):
        super().__init__(*args, **kwargs)
        if queryset is not None:
            self.fields["to_user"].queryset = queryset


class ReassignDepartmentForm(forms.Form):
    """Head of Branch correcting a misrouted letter to a different department."""

    department = forms.ModelChoiceField(
        queryset=Department.objects.all(),
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    note = forms.CharField(
        required=False, widget=forms.Textarea(attrs={"class": "form-control", "rows": 2})
    )


class MarkPendingForm(forms.Form):
    note = forms.CharField(
        required=True,
        label="What is this letter waiting on?",
        widget=forms.Textarea(attrs={"class": "form-control", "rows": 2}),
    )
