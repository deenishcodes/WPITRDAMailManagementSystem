"""
The tenant registry. These two models live in the *public* schema
(they're in SHARED_APPS — see settings.py) and are the single source of
truth for which client organisations exist on the platform.

Deliberately excluded per the resolved Phase 1 decisions:
  - No billing/subscription fields (Section 10, Q10: this is a free
    shared government service).
  - No manual per-tenant provisioning fields — signup is self-service
    (Section 7), so Client rows get created straight from the signup
    form (see signup/views.py), not by a platform admin filling in a form
    on someone else's behalf.

Fields worth adding in later phases, not here:
  - TenantWorkflowConfig (Section 5 of the analysis doc) — that's a
    per-tenant setting that lives inside each tenant's own schema, not
    the shared registry, so it belongs in a Phase 2b app instead.
"""

from django.db import models
from django_tenants.models import DomainMixin, TenantMixin


class Client(TenantMixin):
    name = models.CharField(
        max_length=200,
        help_text="Client organisation's display name, e.g. 'Western Province Secretariat'.",
    )
    created_on = models.DateField(auto_now_add=True)
    admin_contact_email = models.EmailField(
        help_text="Email of the person who signed this organisation up.",
    )

    # Creates the Postgres schema automatically the moment this row is
    # saved — this is the "automated schema provisioning" from Section 7.
    auto_create_schema = True

    def __str__(self):
        return self.name


class Domain(DomainMixin):
    pass
