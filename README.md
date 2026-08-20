# MMS — Phase 2a + 2b

## Status

- **Phase 2a** (project skeleton, tenant provisioning, self-service signup) — verified working end-to-end.
- **Phase 2b** (User/Role/Department models, login, org structure, workflow config toggle) — built and syntax-checked, not yet run against a live database. Expect this to need the same kind of small fixes Phase 2a did on first real run.

## What's in Phase 2a

- Docker + `django-tenants` project structure
- Shared/public schema (the tenant registry: `tenants.Client` / `tenants.Domain`)
- Self-service signup flow (`signup` app) that automatically provisions a real Postgres schema per organisation
- `bootstrap_public_tenant` management command, replacing an earlier manual multi-line shell session

## What's new in Phase 2b

- **`accounts` app** — a real `User` model (extends Django's built-in one) with department/division/designation, plus login/logout/dashboard screens.
- **`orgstructure` app** — `Department` → `Division` → `SubDivision` hierarchy, `Designation` (job titles), and `TenantWorkflowConfig` (the Sub-Branch tier on/off toggle from Section 10, Q2).
- **Roles as Django Groups** — Postal Officer, Head of Branch, Sub-Branch Officer, Subject Officer, Viewer. Seeded via a new management command, `seed_roles`, run per-tenant. "System Admin" isn't a group — it's Django's built-in superuser flag.
- **A dedicated Workflow Configuration screen** at `/workflow-configuration/` (not just Django admin) — Section 6 calls this out as its own screen.

## ⚠️ Important: Phase 2b requires a database reset

Adding a custom `User` model (`AUTH_USER_MODEL`) is a decision Django needs to know about **before the very first migration ever runs** against a database. Since Phase 2a already ran migrations using Django's default User model, switching now means the existing local database needs to be wiped and rebuilt from scratch.

This is completely normal this early in a project — it's specifically why teams settle on a custom User model before real data exists, not after. Nothing about your Phase 2a testing is lost in any meaningful sense; it was test data.

## Running it locally (fresh start, covers both phases)

```bash
cp .env.example .env
# edit .env if you want, defaults work for local dev

# If you have an existing Phase 2a-only database, wipe it first:
docker compose down -v

docker compose up --build
```

In a second terminal, once containers are up:

```bash
# 1. Generate migrations for the new apps
docker compose exec web python manage.py makemigrations tenants accounts orgstructure

# 2. Apply shared-schema migrations
docker compose exec web python manage.py migrate_schemas --shared

# 3. Create the public tenant (also runs accounts/orgstructure migrations
#    into the public schema automatically, since it's created fresh)
docker compose exec web python manage.py bootstrap_public_tenant

# 4. Create your admin login, scoped to the public schema
docker compose exec web python manage.py tenant_command createsuperuser --schema=public

# 5. Seed the default roles into the public schema
docker compose exec web python manage.py tenant_command seed_roles --schema=public
```

Then:

- Visit `http://localhost:8000/` → signup form (public schema)
- Visit `http://localhost:8000/admin/` → tenant registry + org structure admin
- Sign up a test organisation, e.g. subdomain `wpsecretariat` — its schema automatically gets all the accounts/orgstructure tables too, since new tenants are always migrated with whatever migration files exist at creation time
- Seed its roles too: `docker compose exec web python manage.py tenant_command seed_roles --schema=wpsecretariat`
- Create an admin user scoped to that schema: `docker compose exec web python manage.py tenant_command createsuperuser --schema=wpsecretariat`

(No local wildcard DNS for `*.mms.local`? Test via `curl -H "Host: wpsecretariat.mms.local" http://localhost:8000/` instead.)

## Trying out Phase 2b specifically

1. Log in to your test org's `/admin/` with the superuser you created for it, and assign that user to one of the seeded role Groups (e.g. "Head of Branch").
2. Visit `/login/` and log in as that user → lands on the minimal dashboard placeholder.
3. Visit `/workflow-configuration/` → toggle the Sub-Branch tier on/off, save, confirm it persisted (refresh and check the checkbox state).
4. Back in `/admin/` → check Department/Division/SubDivision/Designation are all there, and that adding a Division inline under a Department works.

## Why it's built this way

- **Schema-per-tenant**, not a shared `tenant_id` column — matches the original "dedicated instance per client" requirement and removes an entire class of cross-tenant data-leak risk (Section 7).
- **No billing app** — free shared government service (Section 10, Q10).
- **Auth lives in `TENANT_APPS`, not `SHARED_APPS`** — each tenant's users are fully isolated per-schema, including the platform's own "public" tenant.
- **Roles as Django Groups, not a bespoke Role model** — gets Django's permission system for free, matches the "group/permission-based" RBAC approach from Section 7.
- **Docker Compose, not a more exotic stack** — WPITRDA operates this long-term (Section 10, Q9), so it needs to stay realistic for them to run.

## What's deliberately NOT here yet

- No correspondence model, registration screen, or workflow itself — Phase 2c/2d
- No department-scoped visibility enforcement — that logic lives in the correspondence app once it exists
- No email notifications, search, reports — later phases per Section 9
- No production security hardening — Phase 2h
- No Sri Lanka-hosted production deployment target — still needs confirming with WPITRDA's infrastructure team (Section 10, Q11)

## A note on testing status

Phase 2a was built offline with no live database, and two real bugs turned up on first real run (missing migration file, fiddly manual tenant-bootstrap steps) — both fixed and now baked into this copy as a real migration file and the `bootstrap_public_tenant` command.

Phase 2b was built the same way — offline, no live database — so treat your first run of the reset procedure above as the real first test of this phase. Flag anything that doesn't behave as described so it can get fixed before Phase 2c builds on top of it.
