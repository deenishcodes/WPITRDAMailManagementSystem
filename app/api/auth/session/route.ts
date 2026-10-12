import { login, logout, roleContext } from '@/lib/role-auth';
import { failure } from '@/lib/storage';
export async function GET(req: Request) {
  try { const { account } = await roleContext(req); return Response.json({ user: { email: account.email, role: account.role }, redirect: account.home }, { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return failure(e); }
}
export async function POST(req: Request) { try { return await login(req); } catch (e) { return failure(e); } }
export async function DELETE(req: Request) { try { return await logout(req); } catch (e) { return failure(e); } }
