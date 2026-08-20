# MMS — Phase 2a + 2b + 2c

## Status

- **Phase 2a** (project skeleton, tenant provisioning, self-service signup) — verified working end-to-end.
- **Phase 2b** (User/Role/Department models, login, org structure, workflow config toggle) — verified working end-to-end.
- **Phase 2c** (correspondence model, registration screen, routing workflow, reassignment, search, bulk registration, attachments, reports, email notifications, and outgoing/reply correspondence) — verified working end-to-end, including automated test coverage for the trickier logic (registration numbering, per-role visibility, the Sub-Branch tier snapshot, reassignment eligibility, reply-after-close).

## What's in Phase 2a

- Docker + `django-tenants` project structure
- Shared/public schema (the tenant registry: `tenants.Client` / `tenants.Domain`)
- Self-service signup flow (`signup` app) that automatically provisions a real Postgres schema per organisation, seeds its default roles, and creates its first admin account — genuinely self-service end-to-end, not just schema provisioning. (This last part was added later, after a real signup left an operator having to manually run `seed_roles`/`createsuperuser` by hand before anyone could log in — see `signup/forms.py`.)
- `bootstrap_public_tenant` management command, replacing an earlier manual multi-line shell session

## What's new in Phase 2b

- **`accounts` app** — a real `User` model (extends Django's built-in one) with department/division/sub-division/designation, plus login/logout/dashboard screens.
- **`orgstructure` app** — `Department` → `Division` → `SubDivision` hierarchy, `Designation` (job titles), and `TenantWorkflowConfig` (the Sub-Branch tier on/off toggle from Section 10, Q2).
- **Roles as Django Groups** — Postal Officer, Head of Branch, Sub-Branch Officer, Subject Officer, Viewer. Seeded via a new management command, `seed_roles`, run per-tenant. "System Admin" isn't a group — it's Django's built-in superuser flag.
- **A dedicated Workflow Configuration screen** at `/workflow-configuration/` (not just Django admin) — Section 6 calls this out as its own screen.

## What's new in Phase 2c

No formal spec document exists for the correspondence workflow itself — this was built from the role names, the org hierarchy, and the `TenantWorkflowConfig` docstring's routing description, not a handed-down spec. See `.claude/plans/` history for the reasoning behind each design call (registration numbering, visibility scoping, tier snapshotting) if it needs revisiting.

- **`correspondence` app** — `Correspondence` (the letter itself), `RoutingEvent` (an immutable audit trail of every registration/forward/pending/close action), `RegistrationCounter` (backs sequential, year-scoped registration numbers like `2026/00001`, safe under concurrent registration via `select_for_update`).
- **Registration screen** at `/correspondence/register/` — Postal Officer only.
- **Routing workflow**: Postal Officer registers → Head of Branch forwards (to a Sub-Branch, if the tenant's Sub-Branch tier toggle is on, otherwise straight to a Subject Officer) → Sub-Branch Officer (if reached) forwards to a Subject Officer → Subject Officer marks pending or closes. Each `RoutingEvent` that involves a Head-of-Branch forward snapshots whether the tier was on *at that moment*, so a letter already in flight keeps following the rule that was active when it got there, even if the tenant flips the toggle afterwards — verified directly against the toggle mid-workflow.
- **Department/division/sub-division-scoped visibility** (`Correspondence.objects.visible_to(user)`) — the requirement Phase 2b's README flagged as belonging here. A user's visible letters are the union of whatever their role(s) grant: Postal Officer sees what they registered, Head of Branch sees their whole department, Sub-Branch Officer sees their sub-division, Subject Officer sees only what they're currently holding, Viewer sees their department read-only. Enforced in every list/detail/action view, including a direct-URL-guess check on detail/action views (confirmed: a user in a different department gets a 404, not just an empty list).
- **Reassignment** (`/correspondence/<pk>/reassign/`) — lets whoever currently holds a letter move it *sideways* within their own tier, without advancing it: Head of Branch corrects a misrouted Department, Sub-Branch Officer moves it to a different SubDivision, Subject Officer hands it to a peer (e.g. going on leave). Distinct from Forward, which advances to the next tier and sets `status=ASSIGNED` — reassignment leaves status untouched. Blocked once Closed. Since a reassignment routinely moves a letter out of the acting user's own visible scope (that's the point of a handoff), action views redirect to the list instead of the detail page when that happens, rather than 404ing the person who just acted.
- **Search** — the correspondence list (`/correspondence/`) has a `q` search box matching registration number, subject, or sender name (case-insensitive substring), combinable with the status filter and paginated results.
- **Bulk registration** (`/correspondence/bulk-register/`) — Postal Officer uploads a CSV to register several letters at once. All-or-nothing: every row is validated first, and if any row has a problem nothing is registered — the response names exactly which rows to fix, so a large batch never leaves the register in a half-imported state.
- **File attachments** — anyone who can view a letter can attach supporting documents to it (PDF/Word/Excel/image, 15MB max) and download what's already there. Local filesystem storage under `MEDIA_ROOT`, written to a tenant-schema-prefixed path for logical separation — **not** the same strength of guarantee as the Postgres schema boundary the rest of this project relies on, see the comment in `config/settings.py`. Deliberately **not** served via a generic `/media/...` URL, since that has no auth at all; downloads only ever go through an authenticated view that re-checks `visible_to()` before streaming the file, so attachment access follows the same rules as everything else.
- **Reports** (`/correspondence/reports/`) — counts by status and department, an overdue count, and average turnaround for closed letters (approximated from `updated_at`, since closing is the last action a closed letter can ever receive), scoped by the same `visible_to(user)` as the rest of the app rather than a separate reporting permission model. Plain HTML tables, no charting library — matches the rest of the project's minimal-dependency style. CSV export via `?format=csv`.
- **Email notifications** (`correspondence/notifications.py`) — deliberately narrow: only the two moments where a specific named person newly becomes responsible for something send an email — becoming the named Subject Officer (via Forward or Reassign), and the original registrant when their letter is Closed. Department/sub-division-level forwards and reassignments don't send anything, since there's no single obvious recipient and notifying a whole Group wasn't asked for. Defaults to Django's console `EmailBackend` (prints to the web container's logs) so this runs with zero external configuration — swap `EMAIL_BACKEND` and set the `EMAIL_HOST_*` values in `.env` for real SMTP, nothing in the sending code needs to change. A missing recipient email address, or a send failure, is logged and skipped rather than blocking the workflow action that triggered it.
- **Outgoing/reply correspondence** (`OutgoingCorrespondence`) — a letter this organisation *sends*, either a reply to a registered inbound letter (`in_reply_to` set) or a standalone outgoing letter. Deliberately simpler than inbound: no `RoutingEvent`-equivalent audit log, because no view ever edits a draft's fields after creation — the only two things that happen to a row are creation (Draft) and marking it Sent, which makes `updated_at` a reliable "sent at" proxy by construction, the same reasoning as inbound's CLOSED `updated_at`, just without needing a routing chain to log in the first place. Numbering reuses `RegistrationCounter`, generalized with a `kind` field (`in`/`out`) so incoming and outgoing draw from independent year-scoped sequences (`2026/00001` vs `OUT/2026/00001`) without colliding. Two entry points: a Subject Officer holding an inbound letter can draft a reply (`/correspondence/<pk>/reply/`) — **including after the inbound letter has been Closed**, a deliberate decision, since replying doesn't mutate the inbound letter's own state the way forward/reassign/mark-pending/close do, so there's no reason closing should block a follow-up reply; a Postal Officer can draft a standalone letter (`/correspondence/outgoing/new/`), mirroring the existing gate on inbound registration. Visibility (`OutgoingCorrespondenceQuerySet.visible_to`) is simpler than inbound's too — no routing chain to score against, just "who drafted it" plus department-scoped oversight for Head of Branch/Viewer. Replies show up in a "Replies" section on the inbound letter's detail page (the actual thread view). Deliberately out of scope: attachments on outgoing correspondence (would be the first use of a `GenericForeignKey`/contenttypes anywhere in this codebase for a "nice to have" that wasn't asked for) and email notification on sending.
- **`User.sub_division`** — a field Phase 2b didn't have; added because Sub-Branch Officer visibility has nothing to filter on without it.
- **Dashboard** now shows real new/assigned/pending/overdue/closed counts, scoped the same way.
- **`correspondence/tests.py`** — the first automated test coverage in this project (registration-number sequencing, visibility per role, tier-snapshot immutability). Everything before this was validated purely by hand against live docker-compose Postgres; this phase's concurrency and business-rule logic was judged trickier than what eyeballing alone reliably catches.

## Running it locally (fresh start)

```bash
cp .env.example .env
# edit .env if you want, defaults work for local dev

docker compose down -v   # wipe any existing local database first
docker compose up --build
```

In a second terminal, once containers are up:

```bash
# 1. Generate migrations for the new apps
docker compose exec web python manage.py makemigrations tenants accounts orgstructure correspondence

# 2. Apply shared-schema migrations
docker compose exec web python manage.py migrate_schemas --shared

# 3. Create the public tenant (also runs the TENANT_APPS migrations into the
#    public schema automatically, since it's created fresh)
docker compose exec web python manage.py bootstrap_public_tenant

# 4. Create your admin login, scoped to the public schema
docker compose exec web python manage.py tenant_command createsuperuser --schema=public

# 5. Seed the default roles into the public schema
docker compose exec web python manage.py tenant_command seed_roles --schema=public
```

Then:

- Visit `http://localhost:8000/` → signup form (public schema)
- Visit `http://localhost:8000/admin/` → tenant registry + org structure admin
- Sign up a test organisation, e.g. subdomain `wpsecretariat` — its schema automatically gets all the TENANT_APPS tables too (new tenants are always migrated with whatever migration files exist at creation time), its default roles are seeded, and the admin username/password you chose on the form is ready to log in with immediately — no extra CLI steps needed.
- Log in at `http://wpsecretariat.mms.local:8000/login/` with that account, then in `/admin/`, give some users a Department/Division/SubDivision and add them to a role Group (Postal Officer, Head of Branch, Sub-Branch Officer, Subject Officer, Viewer) to exercise the correspondence workflow.

(No local wildcard DNS for `*.mms.local`? Test via `curl -H "Host: wpsecretariat.mms.local" http://localhost:8000/` instead.)

## Running the test suite

```bash
docker compose exec web python manage.py test correspondence
```

## Why it's built this way

- **Schema-per-tenant**, not a shared `tenant_id` column — matches the original "dedicated instance per client" requirement and removes an entire class of cross-tenant data-leak risk (Section 7).
- **No billing app** — free shared government service (Section 10, Q10).
- **Auth lives in `TENANT_APPS`, folded into `SHARED_APPS` too** — each tenant's users are fully isolated per-schema, *including* the platform's own "public" tenant, which also needs auth/admin/sessions for platform-admin users. (`django-tenants`'s router only syncs an app onto the public schema if it's listed in `SHARED_APPS`; `TENANT_APPS` alone are silently skipped there. `config/settings.py` folds `TENANT_APPS` into `SHARED_APPS` to get both.)
- **Roles as Django Groups, not a bespoke Role model** — gets Django's permission system for free, matches the "group/permission-based" RBAC approach from Section 7.
- **Correspondence routing targets an org unit (Department/Sub-Division), not a named person, until the final Subject Officer step** — a Division can have several people in the "Head of Branch" group; forcing a specific-person choice at every hop would assume exactly one person always holds each role, which isn't true here.
- **`RoutingEvent` is the audit trail, not a separate `audit` app** — it's core to running the workflow (who has the file now, and its history), not a reporting feature, so it didn't need its own app for Phase 2c.
- **Docker Compose, not a more exotic stack** — WPITRDA operates this long-term (Section 10, Q9), so it needs to stay realistic for them to run.

## What's deliberately NOT here yet

- Multi-level approval/sign-off beyond the single forward chain (register → Head of Branch → [Sub-Branch] → Subject Officer → closed) — nothing in the existing role names implies more than this
- Attachments on outgoing correspondence, and email notification on sending one
- Automatic SLA/due-date escalation — `due_date` is a plain manually-set field; overdue is computed at query time, nothing flips it automatically
- Production security hardening — Phase 2h
- No Sri Lanka-hosted production deployment target — still needs confirming with WPITRDA's infrastructure team (Section 10, Q11)

## A note on testing status

Every phase so far has been validated for real against live docker-compose Postgres, not just eyeballed — and every phase so far has turned up at least one real bug on first run that offline development alone wouldn't have caught (a missing migration file and fiddly manual bootstrap steps in Phase 2a; a `django-tenants` router gap that silently skipped creating `TENANT_APPS` tables in the public schema in Phase 2b). Phase 2c added its first automated tests specifically because its concurrency and business-rule logic (registration numbering, tier snapshotting, role-scoped visibility) is meaningfully easier to regress silently than prior phases' straightforward CRUD — treat that as the bar for when a future phase should get tests too, not a hard rule that everything now needs them.
