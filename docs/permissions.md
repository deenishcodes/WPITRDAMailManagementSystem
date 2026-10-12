# Roles and permissions

The four separate dashboards are guarded on the server. The browser cannot select its actor or grant itself another role. Internal `Government` means SUPER AUTHORITY; `DJANGO_GROUP_PERMISSIONS` is a compatibility identifier in TypeScript, not a Django dependency.

| Role | Scope |
| --- | --- |
| PEON | Registration, ordinary receipt corrections with reason and before/after audit, scans, HOD/officer handovers, office dispatch/arrival, physical reply dispatch. Retains visibility of handled correspondence. |
| HOD | Review office letters, assign active same-office officers, delegate to an active same-office HOD, route letters and record action. |
| OFFICER | Assigned correspondence, physical receipt, return with reason, ongoing action, physical reply requests. |
| SUPER AUTHORITY | Inspect all offices and history; manage account assignments. No operational registration, correction, assignment, delivery or action recording. |

Existing HOD office collaboration remains. Delegation records responsibility; sealed contents stay restricted to the addressed HOD and SUPER AUTHORITY. A second HOD is another account with the same role.

Account creation and password provisioning are separate. All mutations resolve an active person on the server and use optimistic workspace version checks. Audit records include actor ID, name, role and server time; corrections retain structured old/new values. Application users cannot replace history.
