// Creates development-only credentials. Never copies production credentials.
import fs from 'node:fs';
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { ACCOUNTS } from '../lib/role-accounts.ts';

if (fs.existsSync('.dev.vars')) throw new Error('.dev.vars already exists. Keep existing credentials or move that file before creating a new local test setup.');
const credentials = {}, accounts = [];
for (const account of ACCOUNTS) {
  const password = randomBytes(24).toString('base64url'), salt = randomBytes(16).toString('hex');
  credentials[account.email] = { salt, hash: pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex') };
  accounts.push({ email: account.email, password, role: account.role, home: account.home });
}
fs.mkdirSync('.sites-runtime', { recursive: true });
fs.writeFileSync('.dev.vars', 'WPITRDA_ACCOUNT_CREDENTIALS=' + JSON.stringify(credentials) + '\n', { mode: 0o600 });
fs.writeFileSync('.sites-runtime/local-accounts.json', JSON.stringify(accounts, null, 2), { mode: 0o600 });
console.log('Development credentials written to ignored .dev.vars and .sites-runtime/local-accounts.json. Do not commit or use them in production.');
