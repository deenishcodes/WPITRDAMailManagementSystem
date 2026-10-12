import { roleContext } from './role-auth';
export { login, logout } from './role-auth';
export const peonContext = (req: Request) => roleContext(req, 'peon');
