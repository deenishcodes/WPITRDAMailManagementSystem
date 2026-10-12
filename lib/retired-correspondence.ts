import { roleContext } from './role-auth';
import { failure, sameOrigin } from './storage';

export async function retiredCorrespondence(req: Request) {
  try {
    if (req.method !== 'GET') sameOrigin(req);
    const { account } = await roleContext(req);
    return Response.json(
      { error: 'This earlier workflow has been retired. Open your current dashboard.', redirect: account.home },
      { status: 410, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) { return failure(error); }
}
