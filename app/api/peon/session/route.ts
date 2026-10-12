import {login,logout} from '@/lib/peon-auth';
import {failure} from '@/lib/storage';
export async function POST(req:Request){try{return await login(req)}catch(e){return failure(e)}}
export async function DELETE(req:Request){try{return await logout(req)}catch(e){return failure(e)}}
