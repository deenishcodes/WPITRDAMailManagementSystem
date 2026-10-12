import { redirect } from 'next/navigation';
import { requireRolePage } from '@/lib/role-page';
export const dynamic = 'force-dynamic';
export default async function Home() { const { account } = await requireRolePage(); redirect(account.home); }
