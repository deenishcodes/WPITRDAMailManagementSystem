import {peonContext} from '@/lib/peon-auth';
import {save,failure,sameOrigin} from '@/lib/storage';
import {change,visible,publicLetter} from '@/lib/model';
export async function GET(req:Request){try{
  const {state,actor}=await peonContext(req);
  return Response.json({actor,people:state.people.map(({id,name,role,office,active,subject})=>({id,name,role,office,active,subject})),letters:state.letters.filter(l=>visible(actor,l)).map(l=>publicLetter(actor,l))},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e)}}
export async function POST(req:Request){try{
  sameOrigin(req);const {db,state,version,actor}=await peonContext(req);
  const body=await req.json() as Record<string,unknown>;
  if(!['register','view','handover-hod','deliver','missing','dispatch','receive','edit','dispatch-reply'].includes(String(body.type)))throw new Error('This action is not available to the letter receiving officer');
  const current=state.people.find(p=>p.id===actor.id)!;current.name=actor.name;
  const result=change(state,actor,{...body,requireReceipt:true});await save(db,state,version);
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e)}}
