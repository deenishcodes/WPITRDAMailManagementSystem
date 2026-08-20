"""
Django settings for the MMS project — Phase 2a skeleton.

This wires up django-tenants for schema-per-tenant multi-tenancy, per the
architecture decision in Section 7 of the Phase 1 analysis document.

Not yet included (deliberately — later phases):
  - accounts / orgstructure / correspondence / audit / reports apps (Phase 2b+)
  - email backend configuration for notifications (Phase 2d/2f)
  - production-hardened security settings (Phase 2h)
"""

from pathlib import Path

from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config("SECRET_KEY", default="dev-only-insecure-key")
DEBUG = config("DEBUG", default=True, cast=bool)

ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default="localhost,127.0.0.1,.mms.local",
    cast=Csv(),
)

# Base domain that tenant subdomains are built from at signup time,
# e.g. a client "westernprovince" becomes westernprovince.mms.local
BASE_DOMAIN = config("BASE_DOMAIN", default="mms.local")

# --------------------------------------------------------------------------
# Multi-tenancy (django-tenants) — see Section 7 of the Phase 1 analysis:
# schema-per-tenant on a shared PostgreSQL cluster.
# --------------------------------------------------------------------------

# SHARED_APPS live in the public schema only: the tenant registry itself,
# plus Django's own framework apps needed to run anything at all.
SHARED_APPS = [
    "django_tenants",  # must be first
    "tenants",  # our Client/Domain models — the tenant registry
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "signup",  # self-service onboarding, public-schema only
]

# TENANT_APPS are provisioned into every tenant schema (including the
# "public" tenant itself, which is where platform-admin users will live —
# see Section 10, Q9/Q12 of the analysis doc). Auth and admin belong here,
# not in SHARED_APPS, because each tenant's users are isolated per Section 7.
TENANT_APPS = [
    "django.contrib.auth",
    "django.contrib.admin",
    "django.contrib.sessions",
    "django.contrib.messages",
    "orgstructure",  # Department/Division/SubDivision, Designation, workflow config
    "accounts",  # custom User model — must come after orgstructure (FK target)
    # Phase 2c+ will add: correspondence, audit, reports
]

# django_tenants' TenantSyncRouter only allows an app to migrate onto the
# public schema if it's listed in SHARED_APPS — TENANT_APPS alone are
# silently skipped there (migration state gets marked "applied" with no
# tables actually created). Since the public tenant needs auth/admin/
# sessions/accounts/orgstructure too (platform-admin users live there —
# see the TENANT_APPS comment above), fold TENANT_APPS into SHARED_APPS as
# well. This doesn't change what real tenant schemas get: that's still
# governed by TENANT_APPS alone.
SHARED_APPS = SHARED_APPS + [app for app in TENANT_APPS if app not in SHARED_APPS]

INSTALLED_APPS = list(SHARED_APPS) + [
    app for app in TENANT_APPS if app not in SHARED_APPS
]

TENANT_MODEL = "tenants.Client"
TENANT_DOMAIN_MODEL = "tenants.Domain"

# Custom User model (Section 5 of the analysis: department/division/
# designation FKs live on User). This must be set before the very first
# migration ever runs against a schema — see the Phase 2b README section
# on why this required a full local database reset.
AUTH_USER_MODEL = "accounts.User"

LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "dashboard"
LOGOUT_REDIRECT_URL = "login"

DATABASE_ROUTERS = ("django_tenants.routers.TenantSyncRouter",)

MIDDLEWARE = [
    "django_tenants.middleware.main.TenantMainMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# django-tenants resolves which URLconf to use based on whether the current
# request landed on the public schema or a real tenant schema.
ROOT_URLCONF = "config.urls_tenants"
PUBLIC_SCHEMA_URLCONF = "config.urls_public"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django_tenants.postgresql_backend",
        "NAME": config("POSTGRES_DB", default="mms"),
        "USER": config("POSTGRES_USER", default="mms"),
        "PASSWORD": config("POSTGRES_PASSWORD", default="mms"),
        "HOST": config("POSTGRES_HOST", default="db"),
        "PORT": config("POSTGRES_PORT", default="5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Locale — Section 7 / Section 2.1 of the analysis: Sri Lankan conventions.
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Colombo"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Security settings below are intentionally minimal for local dev.
# Section 2.1/8 of the analysis doc requires SESSION_COOKIE_SECURE and
# CSRF_COOKIE_SECURE enabled in production — do that in Phase 2h alongside
# the rest of the hardening pass, driven by a production-specific settings
# module or environment-based override, not hardcoded here.
