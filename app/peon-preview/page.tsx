import { redirect } from 'next/navigation';
import { requireRolePage } from '@/lib/role-page';
export const dynamic = 'force-dynamic';
export default async function Page() { await requireRolePage('peon'); redirect('/peon'); }
