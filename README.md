# WPITRDA Mail Management System

The approved four-dashboard application built with the project owner, incorporating the 28 September 2026 handover review. Replaces the earlier Django implementation (commit `461edd3`), which remains recoverable in Git history. Approved application baseline: Sites source `69b3421`.

## Dashboards

- `/peon`: registration, scans, audited corrections, physical handovers and visible dispatch tasks.
- `/hod`: office review, officer dropdown, same-office HOD delegation and office routing.
- `/officer`: assigned letters, physical receipt date, ongoing action, returns and physical reply requests.
- `/authority`: read-only correspondence oversight, with existing account administration.

Separate components and server role guards are preserved. A second HOD account is a distinct identity using the HOD dashboard. Physical delivery does not complete a case. Reply requests create a PEON task; no external email is sent.

See [handover](docs/handover.md), [accounts](docs/role-logins.md) and [permissions](docs/permissions.md).

## Stack

React/TypeScript, Vinext/Vite and Cloudflare Workers. D1 stores workspace JSON and sessions; R2 stores scans. Sites/ChatGPT identity precedes application login. `.openai/hosting.json` retains the existing Site identity and bindings.

The final dashboards use `lib/model.ts`, `/api/desk` and `/api/peon`. Older `/correspondence/*` screens redirect to these dashboards; their obsolete APIs return authenticated HTTP 410. Historical `corr_*` tables, migrations and unused service source remain for recovery; their records are not silently imported.

## Fresh local setup

Use Node **22.23 or newer** and npm:

```sh
npm ci
npm run setup:local
npm run build
node scripts/migrate-local.mjs
npm run dev
```

Open the printed localhost URL, normally port 5173. Portable development supplies the Sites identity mock. If prompted, follow “Open your private workspace with ChatGPT”. Local-only passwords are in ignored `.sites-runtime/local-accounts.json`; hashes are in ignored `.dev.vars`. Setup refuses to overwrite existing credentials. Never commit these files or use local passwords in production.

The migration helper only targets local D1. It applies committed migrations with a ledger and never resets data. If an existing database used another migration tool, reconcile its ledger before running the helper.

## Checks

```sh
npm test
npm run typecheck
npm run build
# With the local development server running:
node tests/role-login.integration.mjs .sites-runtime/local-accounts.json
node tests/handover.integration.mjs .sites-runtime/local-accounts.json
```

The handover integration test creates labeled test letters only on localhost. Use a disposable local workspace.

## Deployment

Pushing GitHub transfers source; it does not deploy the Site or provision production passwords. Preserve the Sites gateway, D1 `DB`, R2 `BUCKET` and `WPITRDA_ACCOUNT_CREDENTIALS` runtime secret. Never expose a standalone Worker that trusts unverified identity headers. Provision `hod2@wpitrda.lk` credentials before production use.

Old Django commands do not apply. Any PostgreSQL or retired `corr_*` data requires an explicit reviewed migration. See [remaining work](docs/handover.md#database-and-remaining-work).
