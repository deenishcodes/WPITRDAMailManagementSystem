import { RoleBoundary } from '@/components/role-boundary';
import { requireRolePage } from '@/lib/role-page';
import PeonDesk from '../peon-desk';
export const dynamic = 'force-dynamic';
export default async function Page() { await requireRolePage('peon'); return <RoleBoundary role="peon"><PeonDesk/></RoleBoundary>; }
