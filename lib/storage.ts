import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {seed,type State,type AuthenticatedUser} from './model';

const WORKSPACE_KEY='colombo-district-correspondence';
export async function context(){const user=await getChatGPTUser();if(!user)throw new Error('Sign in to open the correspondence workspace');const db=(env as any).DB as D1Database;if(!db)throw new Error('Storage is unavailable');return{user:{userId:user.userId,email:user.email,displayName:user.displayName} as AuthenticatedUser,db}}
export async function read(user:AuthenticatedUser,db:D1Database){await db.prepare('INSERT OR IGNORE INTO workspaces(owner,version,data) VALUES(?,0,?)').bind(WORKSPACE_KEY,JSON.stringify(seed(user))).run();const row=await db.prepare('SELECT data,version FROM workspaces WHERE owner=?').bind(WORKSPACE_KEY).first<{data:string;version:number}>();if(!row)throw new Error('Workspace unavailable');return{state:JSON.parse(row.data) as State,version:row.version}}
export async function save(db:D1Database,state:State,version:number){const r=await db.prepare('UPDATE workspaces SET data=?,version=version+1 WHERE owner=? AND version=?').bind(JSON.stringify(state),WORKSPACE_KEY,version).run();if(!r.meta.changes)throw new Error('Another change was saved. Refresh and try again.');}
export function failure(e:unknown){const message=e instanceof Error?e.message:'Unable to save. Please try again.';return Response.json({error:message},{status:message.startsWith('Sign in')?401:message.startsWith('Forbidden:')?403:400})}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new Error('Request origin is not permitted')}
