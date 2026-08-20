"""
Per-tenant User model — Section 5 of the Phase 1 analysis:
"User — auth fields + FK to Designation, Department, Division".

This lives in TENANT_APPS (see settings.py), so every client organisation
gets its own completely isolated set of users, per the schema-per-tenant
decision in Section 7.

Roles (Postal Officer / Head of Branch / Sub-Branch Officer / Subject
Officer / Viewer — Section 3) are implemented as Django Groups rather than
a bespoke Role model, so we get Django's permission system for free. See
orgstructure/management/commands/seed_roles.py for how those groups get
created. "System Admin" (Section 3) maps to Django's built-in
is_superuser/is_staff flags rather than a group, since it's a platform-level
distinction, not a workflow role.
"""

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    department = models.ForeignKey(
        "orgstructure.Department",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="users",
    )
    division = models.ForeignKey(
        "orgstructure.Division",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="users",
    )
    designation = models.ForeignKey(
        "orgstructure.Designation",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="users",
    )

    def __str__(self):
        return self.get_full_name() or self.username
