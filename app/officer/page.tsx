import { RoleBoundary } from '@/components/role-boundary';
import { requireRolePage } from '@/lib/role-page';
import OfficerDesk from '../officer-desk';
export const dynamic = 'force-dynamic';
export default async function Page() { await requireRolePage('officer'); return <RoleBoundary role="officer"><OfficerDesk/></RoleBoundary>; }
