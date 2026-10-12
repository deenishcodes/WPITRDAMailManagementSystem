import { headers } from 'next/headers';
import { roleContext } from '../role-auth';
import { getPlatformIdentity, type PlatformIdentity } from './adapters/identity';
import { resolveCurrentUser } from './service';
import type { CorrUser } from './types';

export type CorrContext = { db: D1Database; identity: PlatformIdentity; user: CorrUser };

export async function corrContext(): Promise<CorrContext> {
  const { db, account } = await roleContext(new Request('https://wpitrda.internal', { headers: await headers() }));
  const identity: PlatformIdentity = { externalId: 'wpitrda:' + account.email, email: account.email, displayName: account.label, phone: null };
  const user = await resolveCurrentUser(db, identity);
  if (user.role !== account.corrRole || !user.isActive) throw new Error('Forbidden: account role assignment invalid.');
  return { db, identity, user };
}

export function failure(e: unknown): Response {
  const message = e instanceof Error ? e.message : 'Unable to complete this action. Please try again.';
  const status = message.startsWith('Sign in') ? 401 : (message.startsWith('Forbidden:') || message.includes('has not been onboarded')) ? 403 : 400;
  return Response.json({ error: message }, { status });
}

export function sameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) throw new Error('Request origin is not permitted');
}
