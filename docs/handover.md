# Handover: approved four-dashboard application

Reference: [Process flow for letter handling — 28 September 2026](https://notes.granola.ai/d/e3f2855a-d33e-41dc-89a3-3c17e38b26f4). The project owner confirmed that the application built together is authoritative and conflicting implementation should be replaced.

## What changed

| Area | Implementation |
| --- | --- |
| Repository | Replaces Django with the existing Sites application from `69b3421`. The earlier Django commit `461edd3` remains in Git history. |
| PEON dispatch | Prominent dashboard tasks name the destination office or reply recipient, with direct dispatch/arrival actions. |
| PEON corrections | Receiving PEON can correct ordinary receipt metadata after handover. A reason, actor, time and before/after values are retained. References, routing and history remain intact. |
| Multiple HODs | Adds `hod2@wpitrda.lk` mapped to existing COL-h2, plus support for additional provisioned active people. Same-office delegation logs both HODs. Officer dropdowns validate active same-office officers. |
| Dates | Separate initial receipt, digital registration, digital assignment, officer physical receipt and latest action. Old missing dates display “Not recorded”. |
| Physical receipt | Officer confirms unrecorded receipt; PEON can enter actual receipt during delivery. Dates cannot precede initial receipt or be in the future. Reassignment clears the current receipt while retaining history. |
| Reply handling | Assigned officer queues recipient, address and reply details; PEON records physical dispatch and tracking. No external email or forced closure. |
| Labels | Mail branding, clear role/office, shorter text, physical-stage wording. No reported “male” typo was found in the approved source. |
| Old workflow | Legacy screens redirect to final dashboards; old APIs are retired. No database is dropped or wiped. |

## Main files

- `app/peon-desk.tsx`, `app/hod-desk.tsx`, `app/officer-desk.tsx`, `app/authority-desk.tsx`: separate dashboards.
- `lib/model.ts`: visibility, transitions, corrections, dates, dispatch and audit.
- `lib/role-accounts.ts`, `lib/role-auth.ts`, `components/role-boundary.tsx`: identity, authentication, same-role account switching.
- `components/letter-progress.tsx`: shared date/reply display.
- `app/api/desk/route.ts`, `app/api/peon/route.ts`: authenticated operations. Register reads no longer write the workspace.
- `app/correspondence/**`, `app/api/correspondence/**`, `lib/retired-correspondence.ts`: legacy redirects and retirement.
- `tests/`, `scripts/setup-local.mjs`, `scripts/migrate-local.mjs`: checks and local setup.

## Database and remaining work

Authoritative records live in `workspaces.data` JSON with a version check on writes. Added fields are optional: no destructive SQL migration or fabricated historical dates. Existing identifiers, letters and audit history remain. Committed migrations initialize workspace, sessions and historical relational tables.

Before production rollout:

1. Provision credentials for the second/additional HODs through the existing runtime secret process. Adding a person alone does not create a password.
2. Determine whether real PostgreSQL or retired `corr_*` records need migration. These stores are distinct; no automatic import is performed. Back up and reconcile identifiers, scans, users, office mappings and history before importing.
3. If JSON storage becomes insufficient, normalize records and append-only audit events with transactional writes. Current optimistic locking rejects conflicting saves; it is not a database-enforced immutable audit ledger.
4. Confirm production access, backups, R2 retention and recovery. The app requires the Sites identity gateway and Cloudflare D1/R2 bindings.
5. Obtain WPITRDA's confidential-letter and completion policies. Existing sealed-letter behavior is preserved, without inventing a universal closure rule.

SUPER AUTHORITY retains account management but cannot edit operational correspondence. Existing localization remains; new controls are English pending a confirmed translation requirement.

GitHub push and live deployment are separate. This change does not modify a live Site version, production database, or secret.
