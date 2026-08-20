"""
Creates the default role Groups for a tenant — Section 3 of the Phase 1
analysis: Postal Officer, Head of Branch, Sub-Branch Officer, Subject
Officer, Viewer. "System Admin" isn't a group here; it maps to Django's
built-in is_superuser/is_staff flags instead (see accounts/models.py).

Run per-tenant, e.g.:
    python manage.py tenant_command seed_roles --schema=public
    python manage.py tenant_command seed_roles --schema=wpsecretariat

Safe to run more than once — uses get_or_create.
"""

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

ROLE_NAMES = [
    "Postal Officer",
    "Head of Branch",
    "Sub-Branch Officer",
    "Subject Officer",
    "Viewer",
]


class Command(BaseCommand):
    help = "Creates the default role Groups (Postal Officer, Head of Branch, etc.) for a tenant."

    def handle(self, *args, **options):
        for role_name in ROLE_NAMES:
            group, created = Group.objects.get_or_create(name=role_name)
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created role: {role_name}"))
            else:
                self.stdout.write(f"Role already exists: {role_name}")

        self.stdout.write(self.style.SUCCESS("Done."))
