import { redirect } from 'next/navigation';
import { requireRolePage } from '@/lib/role-page';
export default async function LegacyDashboard() { const { account } = await requireRolePage(); redirect(account.home); }
