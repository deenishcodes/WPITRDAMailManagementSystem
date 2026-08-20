"""
Creates the "public" tenant and points a domain (default: localhost) at it.

This replaces the manual `python manage.py shell` steps from the Phase 2a
README's first-time setup section. Safe to run more than once — it uses
get_or_create, so re-running it won't create duplicates or error out.

Usage:
    python manage.py bootstrap_public_tenant
    python manage.py bootstrap_public_tenant --domain=localhost
"""

from django.core.management.base import BaseCommand

from tenants.models import Client, Domain


class Command(BaseCommand):
    help = "Creates the public tenant and its domain, if they don't already exist."

    def add_arguments(self, parser):
        parser.add_argument(
            "--domain",
            default="localhost",
            help="Domain to point at the public tenant (default: localhost).",
        )

    def handle(self, *args, **options):
        domain_name = options["domain"]

        public_tenant, tenant_created = Client.objects.get_or_create(
            schema_name="public",
            defaults={
                "name": "Platform",
                "admin_contact_email": "admin@example.org",
            },
        )
        if tenant_created:
            self.stdout.write(self.style.SUCCESS("Created public tenant."))
        else:
            self.stdout.write("Public tenant already exists — skipping.")

        domain, domain_created = Domain.objects.get_or_create(
            domain=domain_name,
            defaults={"tenant": public_tenant, "is_primary": True},
        )
        if domain_created:
            self.stdout.write(
                self.style.SUCCESS(f"Pointed '{domain_name}' at the public tenant.")
            )
        else:
            self.stdout.write(f"Domain '{domain_name}' already exists — skipping.")

        self.stdout.write(self.style.SUCCESS("Done."))
