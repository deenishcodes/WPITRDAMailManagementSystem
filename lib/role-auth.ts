import { env } from 'cloudflare:workers';
import { context, read, sameOrigin } from './storage';
import { accountForEmail, accountActor, type AppRole } from './role-accounts';

const COOKIE = 'wpitrda_session';
const LIFETIME = 8 * 60 * 60;
export const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export const sessionToken = (req: Request) => req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
const cookie = (req: Request, token: string, age: number) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
const responseHeaders = { 'Cache-Control': 'no-store' };

export async function roleContext(req: Request, expected?: AppRole) {
  const { user, db } = await context();
  const token = sessionToken(req);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Sign in with your assigned WPITRDA account.');
  const session = await db.prepare('SELECT owner,email,expires FROM role_sessions WHERE token=?').bind(await digest(token)).first<{ owner: string; email: string; expires: number }>();
  const { state, version } = await read(user, db);
  const account = session && accountForEmail(session.email, state);
  if (!session || !account || session.owner !== user.userId || session.expires <= Date.now()) throw new Error('Sign in with your assigned WPITRDA account.');
  if (expected && account.role !== expected) throw new Error('Forbidden: this dashboard belongs to another role.');
  const actor = accountActor(state, account);
  return { user, db, state, version, actor, account };
}

export async function login(req: Request) {
  sameOrigin(req);
  const { user, db } = await context();
  const body = await req.json() as { email?: unknown; username?: unknown; password?: unknown };
  const email = typeof body.email === 'string' ? body.email : typeof body.username === 'string' ? body.username : '';
  const { state } = await read(user, db);
  const account = accountForEmail(email, state);
  const now = Date.now();
  // Shared limit prevents cycling through account names to evade throttling.
  await db.prepare('INSERT INTO peon_login_attempts (owner,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(owner) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END').bind(user.userId, now + 900000, now, now, now + 900000).run();
  const attempts = await db.prepare('SELECT attempts FROM peon_login_attempts WHERE owner=?').bind(user.userId).first<{ attempts: number }>();
  if ((attempts?.attempts || 0) > 10) return Response.json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }, { status: 429, headers: responseHeaders });
  const config = (env as unknown as { WPITRDA_ACCOUNT_CREDENTIALS?: string }).WPITRDA_ACCOUNT_CREDENTIALS;
  if (!config) throw new Error('Account sign-in is not configured. Contact the super authority.');
  const credentials = JSON.parse(config) as Record<string, { salt: string; hash: string }>;
  const stored = account && credentials[account.email];
  const password = typeof body.password === 'string' && body.password.length <= 256 ? body.password : '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const actual = hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(stored?.salt || 'unknown-account'), iterations: 100000, hash: 'SHA-256' }, key, 256)));
  let difference = 0;
  const expected = stored?.hash || '0'.repeat(64);
  for (let i = 0; i < 64; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  if (!account || !stored || expected.length !== 64 || difference !== 0) return Response.json({ error: 'Incorrect email or password.' }, { status: 401, headers: responseHeaders });
  accountActor(state, account);
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.batch([
    db.prepare('DELETE FROM role_sessions WHERE expires<=? OR token=?').bind(now, await digest(sessionToken(req))),
    db.prepare('INSERT INTO role_sessions (token,owner,email,expires) VALUES (?,?,?,?)').bind(await digest(token), user.userId, account.email, now + LIFETIME * 1000),
    db.prepare('DELETE FROM peon_login_attempts WHERE owner=?').bind(user.userId),
  ]);
  return Response.json({ user: { email: account.email, role: account.role }, redirect: account.home }, { headers: { ...responseHeaders, 'Set-Cookie': cookie(req, token, LIFETIME) } });
}

export async function logout(req: Request) {
  sameOrigin(req);
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare('DELETE FROM role_sessions WHERE token=?').bind(await digest(sessionToken(req))).run();
  return Response.json({ ok: true }, { headers: { ...responseHeaders, 'Set-Cookie': cookie(req, '', 0) } });
}
