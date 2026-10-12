import { RoleBoundary } from '@/components/role-boundary';
import { requireRolePage } from '@/lib/role-page';
import HodDesk from '../hod-desk';
export const dynamic = 'force-dynamic';
export default async function Page() { await requireRolePage('hod'); return <RoleBoundary role="hod"><HodDesk/></RoleBoundary>; }
