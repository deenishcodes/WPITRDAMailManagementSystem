import re

from django import forms
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django_tenants.utils import schema_context

from orgstructure.management.commands.seed_roles import ROLE_NAMES
from tenants.models import Client, Domain

# Reserved subdomains that a client org shouldn't be able to claim.
RESERVED_SCHEMA_NAMES = {"public", "www", "admin", "api", "static", "media"}

SCHEMA_NAME_RE = re.compile(r"^[a-z][a-z0-9]{2,62}$")


class ClientSignupForm(forms.Form):
    organisation_name = forms.CharField(
        max_length=200,
        label="Organisation name",
        help_text="e.g. Western Province Secretariat",
    )
    subdomain = forms.CharField(
        max_length=63,
        label="Choose your subdomain",
        help_text="Lowercase letters and numbers only, e.g. 'wpsecretariat'.",
    )
    admin_contact_email = forms.EmailField(
        label="Admin contact email",
        help_text="This becomes the email address on your first admin account.",
    )
    admin_username = forms.CharField(
        max_length=150,
        label="Choose an admin username",
        validators=[UnicodeUsernameValidator()],
    )
    admin_password = forms.CharField(
        widget=forms.PasswordInput,
        label="Choose a password",
    )
    admin_password_confirm = forms.CharField(
        widget=forms.PasswordInput,
        label="Confirm password",
    )

    def clean_subdomain(self):
        value = self.cleaned_data["subdomain"].strip().lower()

        if not SCHEMA_NAME_RE.match(value):
            raise forms.ValidationError(
                "Subdomain must be 3-63 characters, lowercase letters and "
                "numbers only, and start with a letter."
            )
        if value in RESERVED_SCHEMA_NAMES:
            raise forms.ValidationError("That subdomain is reserved. Please choose another.")
        if Client.objects.filter(schema_name=value).exists():
            raise forms.ValidationError("That subdomain is already taken.")

        return value

    def clean_admin_password(self):
        password = self.cleaned_data["admin_password"]
        # Uses the same AUTH_PASSWORD_VALIDATORS as every other account on
        # this platform (see settings.py) — no user instance to check
        # similarity against yet, since the account doesn't exist until
        # save(), so that one validator's username/email check is skipped.
        validate_password(password)
        return password

    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get("admin_password")
        confirm = cleaned_data.get("admin_password_confirm")
        if password and confirm and password != confirm:
            self.add_error("admin_password_confirm", "Passwords don't match.")
        return cleaned_data

    def save(self):
        """
        Creates the Client (which auto-provisions its own Postgres schema
        via TenantMixin.auto_create_schema — see tenants/models.py) and its
        primary Domain row — the "automated schema provisioning" step from
        Section 7 of the Phase 1 analysis.

        Also seeds the default role Groups and creates the organisation's
        first admin account directly inside the new schema, so signup is
        actually self-service end-to-end: without this, a freshly signed-up
        tenant had a schema but no usable login, and nobody could get in
        without a platform operator manually running seed_roles and
        createsuperuser by hand.
        """
        subdomain = self.cleaned_data["subdomain"]

        client = Client.objects.create(
            schema_name=subdomain,
            name=self.cleaned_data["organisation_name"],
            admin_contact_email=self.cleaned_data["admin_contact_email"],
        )

        domain = Domain.objects.create(
            domain=f"{subdomain}.{settings.BASE_DOMAIN}",
            tenant=client,
            is_primary=True,
        )

        with schema_context(subdomain):
            for role_name in ROLE_NAMES:
                Group.objects.get_or_create(name=role_name)

            admin_user = get_user_model().objects.create_superuser(
                username=self.cleaned_data["admin_username"],
                email=self.cleaned_data["admin_contact_email"],
                password=self.cleaned_data["admin_password"],
            )

        return client, domain, admin_user
