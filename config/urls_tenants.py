"""
URLs served inside a client organisation's own tenant schema
(e.g. westernprovince.mms.local).

Phase 2b adds real login, a minimal post-login landing page, and the
Sub-Branch workflow-configuration toggle. Phase 2c adds the correspondence
(letter) registration and routing workflow screens.
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("accounts.urls")),
    path("", include("orgstructure.urls")),
    path("", include("correspondence.urls")),
]
