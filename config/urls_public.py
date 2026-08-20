"""
URLs served on the public schema — i.e. requests that don't match any
tenant's subdomain. This is where self-service signup lives (Section 6/7
of the Phase 1 analysis: "Client Signup" screen).

The full Platform Admin Console (Section 6) is a later-phase build; for now
the public tenant's own Django admin (provisioned as a TENANT_APP — see
settings.py) serves as a placeholder for platform-admin access to the
tenant registry.
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("signup.urls")),
]
