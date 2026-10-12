import { requireRolePage } from '@/lib/role-page';
export const dynamic = 'force-dynamic';
export default async function Layout({children}: {children: React.ReactNode}) { await requireRolePage(); return children; }
