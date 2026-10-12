import {deskContext} from '@/lib/desk-context';
import {context,read,save,failure,sameOrigin} from '@/lib/storage';
import {change,visible,publicLetter,principal} from '@/lib/model';
export async function GET(req:Request){try{const{state,actor}=await deskContext(req);return Response.json({people:state.people,letters:state.letters.filter(l=>visible(actor,l)).map(l=>publicLetter(actor,l)),actor},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(req:Request){try{sameOrigin(req);const{db,state,version,actor}=await deskContext(req);const body:any=await req.json();if(body.type==='file')throw new Error('Use the scan upload form');const result=change(state,actor,{...body,requireReceipt:actor.role==='Peon'});await save(db,state,version);return Response.json(result)}catch(e){return failure(e)}}
