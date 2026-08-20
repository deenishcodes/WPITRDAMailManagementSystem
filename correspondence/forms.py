from django import forms
from django.contrib.auth import get_user_model

from orgstructure.models import Department, SubDivision

from .models import (
    ALLOWED_ATTACHMENT_EXTENSIONS,
    MAX_ATTACHMENT_SIZE_BYTES,
    Correspondence,
    OutgoingCorrespondence,
)

User = get_user_model()


RECEIVED_VIA_CHOICES = [
    ("", "— Select —"),
    ("Post", "Post"),
    ("Hand delivery", "Hand delivery"),
    ("Email", "Email"),
    ("Fax", "Fax"),
    ("Other", "Other"),
]


class ReceivedViaFormMixin(forms.Form):
    """
    Shared by CorrespondenceRegisterForm and CorrespondenceEditForm.
    received_via stays a plain CharField on the model (Correspondence.
    received_via) so "Other" can still store whatever the officer types —
    this dropdown is a form-layer convenience, not a model-level
    constraint. clean() resolves the two fields down to the single value
    construct_instance() picks up for the model field.
    """

    received_via = forms.ChoiceField(
        choices=RECEIVED_VIA_CHOICES,
        required=False,
        widget=forms.Select(attrs={"class": "form-select", "id": "id_received_via"}),
    )
    received_via_other = forms.CharField(
        required=False,
        label="Please specify",
        widget=forms.TextInput(attrs={"class": "form-control"}),
    )

    def clean(self):
        cleaned_data = super().clean()
        received_via = cleaned_data.get("received_via")
        other = (cleaned_data.get("received_via_other") or "").strip()
        if received_via == "Other":
            if not other:
                self.add_error("received_via_other", "Please specify how it was received.")
            else:
                cleaned_data["received_via"] = other
        return cleaned_data


class CorrespondenceRegisterForm(ReceivedViaFormMixin, forms.ModelForm):
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
            "remarks": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
            "department": forms.Select(attrs={"class": "form-select"}),
            "due_date": forms.DateInput(attrs={"class": "form-control", "type": "date"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Force received_via_other to render right after received_via
        # regardless of Django's default field-ordering rules for a
        # declared-but-not-in-Meta.fields field, so the show/hide behavior
        # in register.html's script lines up visually.
        self.order_fields(
            ["subject", "sender_name", "sender_address", "date_received", "received_via",
             "received_via_other", "remarks", "department", "due_date"]
        )


class CorrespondenceEditForm(ReceivedViaFormMixin, forms.ModelForm):
    """
    Corrects entry details after registration — subject/sender/dates/
    remarks only. department is deliberately excluded: correcting it goes
    through Reassign instead, so there's a single audited path for
    department changes rather than two ways to do the same thing.
    """

    class Meta:
        model = Correspondence
        fields = [
            "subject",
            "sender_name",
            "sender_address",
            "date_received",
            "received_via",
            "remarks",
            "due_date",
        ]
        widgets = {
            "subject": forms.TextInput(attrs={"class": "form-control"}),
            "sender_name": forms.TextInput(attrs={"class": "form-control"}),
            "sender_address": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
            "date_received": forms.DateInput(attrs={"class": "form-control", "type": "date"}),
            "remarks": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
            "due_date": forms.DateInput(attrs={"class": "form-control", "type": "date"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.order_fields(
            ["subject", "sender_name", "sender_address", "date_received", "received_via",
             "received_via_other", "remarks", "due_date"]
        )
        # An existing value that isn't one of the predefined choices (set
        # before this dropdown existed, via bulk CSV import, or via a
        # previous "Other" entry) needs "Other" pre-selected with the
        # original text pre-filled — otherwise the bound value wouldn't
        # match any <option>, and the select would silently show nothing
        # selected instead of the letter's actual received_via value.
        if self.instance.pk and self.instance.received_via not in dict(RECEIVED_VIA_CHOICES):
            self.initial["received_via"] = "Other"
            self.initial["received_via_other"] = self.instance.received_via


class OutgoingCorrespondenceForm(forms.ModelForm):
    """
    Shared by both entry points (standalone draft and reply-to-inbound).
    in_reply_to/drafted_by are always set programmatically by the view, not
    exposed here — a user shouldn't be able to link a draft to an inbound
    letter they can't see. department is only shown for a standalone draft;
    for a reply it's inherited from the inbound letter and hidden (see
    show_department below).
    """

    class Meta:
        model = OutgoingCorrespondence
        fields = ["subject", "recipient_name", "recipient_address", "remarks", "department"]
        widgets = {
            "subject": forms.TextInput(attrs={"class": "form-control"}),
            "recipient_name": forms.TextInput(attrs={"class": "form-control"}),
            "recipient_address": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
            "remarks": forms.Textarea(attrs={"class": "form-control", "rows": 3}),
            "department": forms.Select(attrs={"class": "form-select"}),
        }

    def __init__(self, *args, show_department=True, **kwargs):
        super().__init__(*args, **kwargs)
        if not show_department:
            del self.fields["department"]


class BulkRegisterForm(forms.Form):
    csv_file = forms.FileField(
        label="CSV file",
        help_text=(
            "Header row required: subject, sender_name, sender_address, date_received "
            "(YYYY-MM-DD), received_via, remarks, department (name or short code), due_date. "
            "sender_address, received_via, remarks, and due_date may be left blank."
        ),
        widget=forms.ClearableFileInput(attrs={"class": "form-control", "accept": ".csv"}),
    )

    def clean_csv_file(self):
        f = self.cleaned_data["csv_file"]
        if not f.name.lower().endswith(".csv"):
            raise forms.ValidationError("Please upload a .csv file.")
        if f.size > 2 * 1024 * 1024:
            raise forms.ValidationError("File is too large (max 2MB).")
        return f


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


class AttachmentUploadForm(forms.Form):
    file = forms.FileField(
        widget=forms.ClearableFileInput(attrs={"class": "form-control"}),
    )

    def clean_file(self):
        f = self.cleaned_data["file"]
        extension = f.name.rsplit(".", 1)[-1].lower() if "." in f.name else ""
        if extension not in ALLOWED_ATTACHMENT_EXTENSIONS:
            raise forms.ValidationError(
                "Unsupported file type. Allowed: " + ", ".join(sorted(ALLOWED_ATTACHMENT_EXTENSIONS))
            )
        if f.size > MAX_ATTACHMENT_SIZE_BYTES:
            raise forms.ValidationError(
                f"File is too large (max {MAX_ATTACHMENT_SIZE_BYTES // (1024 * 1024)}MB)."
            )
        return f


class MarkPendingForm(forms.Form):
    note = forms.CharField(
        required=True,
        label="What is this letter waiting on?",
        widget=forms.Textarea(attrs={"class": "form-control", "rows": 2}),
    )
