import { redirect } from 'next/navigation';
import { requireRolePage } from '@/lib/role-page';
export default async function LegacyDashboard() { await requireRolePage('hod'); redirect('/hod'); }
