# Accounts

| Email | Role | Person | Dashboard |
| --- | --- | --- | --- |
| peon@wpitrda.lk | PEON | COL-p | /peon |
| hod@wpitrda.lk | HOD | COL-h1 | /hod |
| hod2@wpitrda.lk | HOD | COL-h2 | /hod |
| officer@wpitrda.lk | OFFICER | COL-o1 | /officer |
| authority@wpitrda.lk | SUPER AUTHORITY | gov | /authority |

No passwords are committed. Existing active person records are required; the standard workspace already contains both HODs. The second account creates neither a new office nor a new role.

Additional active PEON/HOD/OFFICER people can sign in by their linked work email after an operator provisions credentials. Their person role and office determine access. Deactivation blocks new logins and existing sessions.

The server-only `WPITRDA_ACCOUNT_CREDENTIALS` JSON maps emails to `{ "salt": "...", "hash": "..." }`: PBKDF2-HMAC-SHA256, 100,000 iterations, 32 bytes encoded as hexadecimal, independent random salt per account. Use the existing private runtime secret process; never copy local test passwords into production.

Opaque sessions are hashed in D1, expire after eight hours and are bound to the outer Sites identity. Cookies are HTTP-only, SameSite=Strict and Secure over HTTPS. Login attempts are throttled across account names. Logout revokes the token. Switching between HOD accounts refreshes the dashboard identity.

Run `npm run setup:local` for generated development credentials, saved only in ignored files. The login integration test reads `.sites-runtime/local-accounts.json` and covers all five accounts.
