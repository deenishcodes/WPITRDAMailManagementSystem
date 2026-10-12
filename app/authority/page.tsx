import { RoleBoundary } from '@/components/role-boundary';
import { requireRolePage } from '@/lib/role-page';
import AuthorityDesk from '../authority-desk';
export const dynamic = 'force-dynamic';
export default async function Page() { await requireRolePage('super_authority'); return <RoleBoundary role="super_authority"><AuthorityDesk/></RoleBoundary>; }
