import {env} from 'cloudflare:workers';
import {peonContext} from '@/lib/peon-auth';
import {save,failure,sameOrigin} from '@/lib/storage';
import {contents,change} from '@/lib/model';
const bucket=()=>(env as unknown as {BUCKET:R2Bucket}).BUCKET;
export async function GET(req:Request){try{
  const {state,actor}=await peonContext(req);
  const l=state.letters.find(l=>l.id===new URL(req.url).searchParams.get('id'));
  if(!l||!contents(actor,l)||!l.file)throw new Error('Scan unavailable for your role');
  const file=await bucket().get(l.file);if(!file)throw new Error('Scan not found');
  return new Response(file.body,{headers:{'Content-Type':l.fileType||'application/octet-stream','Content-Disposition':'inline','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}catch(e){return failure(e)}}
export async function POST(req:Request){let key='';try{
  sameOrigin(req);const {state,actor,db,version}=await peonContext(req);
  const data=await req.formData();const file=data.get('file');
  if(!(file instanceof File)||!file.size||!['application/pdf','image/jpeg','image/png'].includes(file.type)||file.size>10*1024*1024)throw new Error('Choose a non-empty PDF, JPEG or PNG up to 10 MB');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const valid=file.type==='application/pdf'?String.fromCharCode(...bytes.slice(0,5))==='%PDF-':file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes[0]===137&&String.fromCharCode(...bytes.slice(1,4))==='PNG';
  if(!valid)throw new Error('The file contents do not match its format');
  key='peon/'+crypto.randomUUID();
  state.people.find(p=>p.id===actor.id)!.name=actor.name;
  change(state,actor,{type:'file',id:String(data.get('id')),key,name:file.name.slice(0,150),mime:file.type});
  await bucket().put(key,bytes,{httpMetadata:{contentType:file.type}});await save(db,state,version);
  return Response.json({ok:true});
}catch(e){if(key)await bucket().delete(key).catch(()=>{});return failure(e)}}
