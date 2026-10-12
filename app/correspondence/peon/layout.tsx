import { RoleBoundary } from '@/components/role-boundary';
import { requireRolePage } from '@/lib/role-page';
export const dynamic = 'force-dynamic';
export default async function Layout({children}: {children: React.ReactNode}) { await requireRolePage('peon'); return <RoleBoundary role="peon">{children}</RoleBoundary>; }
