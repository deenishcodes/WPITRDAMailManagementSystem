import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { roleContext } from './role-auth';
import type { AppRole } from './role-accounts';

export async function requireRolePage(expected?: AppRole) {
  let session;
  try {
    session = await roleContext(new Request('https://wpitrda.internal', { headers: await headers() }));
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('Sign in') || error.message.startsWith('Forbidden:'))) redirect('/login');
    throw error;
  }
  if (expected && session.account.role !== expected) redirect(session.account.home);
  return session;
}
