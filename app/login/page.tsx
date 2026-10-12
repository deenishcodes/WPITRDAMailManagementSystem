import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { roleContext } from '@/lib/role-auth';
import LoginForm from './form';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  let home: string | undefined;
  try { home = (await roleContext(new Request('https://wpitrda.internal', { headers: await headers() }))).account.home; }
  catch (e) { if (!(e instanceof Error) || (!e.message.startsWith('Sign in') && !e.message.startsWith('Forbidden:'))) throw e; }
  if (home) redirect(home);
  return <LoginForm />;
}
