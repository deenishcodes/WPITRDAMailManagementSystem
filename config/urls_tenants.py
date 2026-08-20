"""
URLs served inside a client organisation's own tenant schema
(e.g. westernprovince.mms.local).

Phase 2b adds real login, a minimal post-login landing page, and the
Sub-Branch workflow-configuration toggle. The correspondence workflow
screens themselves are Phase 2c onward (see Section 9 of the Phase 1
analysis document).
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("accounts.urls")),
    path("", include("orgstructure.urls")),
]
