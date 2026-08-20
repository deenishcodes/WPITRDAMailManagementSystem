import re

from django import forms
from django.conf import settings

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
        help_text="This person becomes the organisation's first admin user in Phase 2b.",
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

    def save(self):
        """
        Creates the Client (which auto-provisions its own Postgres schema
        via TenantMixin.auto_create_schema — see tenants/models.py) and its
        primary Domain row. This is the "automated schema provisioning"
        step from Section 7 of the Phase 1 analysis.
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

        return client, domain
