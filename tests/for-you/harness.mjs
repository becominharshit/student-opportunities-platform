import {serviceFixture,A,B} from '../recommendations/service-harness.mjs';
import {load,moduleUrl} from '../recommendations/harness.mjs';
export {A,B};
export async function fixture(){
 const base=await serviceFixture(),db=base.db,calls=[];let user=A,queue=Promise.resolve(),failure=false,recheck=false;
 async function serial(fn){const identity=user;const run=queue.then(async()=>{await db.exec('begin');try{await db.exec('set local role '+(identity?'authenticated':'anon'));await db.query("select set_config('request.jwt.claim.sub',$1,true)",[identity??'']);return await fn();}finally{await db.exec('rollback');}});queue=run.catch(()=>{});return run;}
 const client={rpc:async(name)=>{calls.push({rpc:name});if(failure)return {error:true};return serial(async()=>({data:(await db.query('select public.for_you_candidates() value')).rows[0].value,error:null}));},from(table){let fields,filters=[],limit,order;const q={select(v){fields=v;return q;},eq(k,v){filters.push([k,'=',v]);return q;},in(k,v){filters.push([k,'= any',v]);return q;},limit(v){limit=v;return q;},order(v){order=v;return q;},maybeSingle(){return exec(true);},then(resolve,reject){return exec(false).then(resolve,reject);}};
 function exec(single){calls.push({table,fields,filters,limit});if(failure)return Promise.resolve({data:null,error:true});return serial(async()=>{
 if(recheck&&fields==='id,version')return {data:[],error:null};
 if(!['events','profiles','interests','skills','user_interests','user_skills'].includes(table))throw Error('Unexpected table');
 const parts=fields.split(/,(?![^()]*\))/),plain=parts.filter(s=>!s.includes('('));
 if(plain.some(s=>!/^[a-z_]+$/.test(s))||filters.some(([k])=>!['id','user_id','publication_status'].includes(k))||order&&order!=='name')throw Error('Unsafe adapter');
 const where=filters.map(([k,op],i)=>op==='= any'?`${k}=any($${i+1}::uuid[])`:`${k}=$${i+1}`).join(' and ')||'true';
 const rows=(await db.query(`select ${plain.join(',')} from public.${table} where ${where}${order?' order by name':''}${limit?' limit '+Number(limit):''}`,filters.map(x=>x[2]))).rows;
 for(const row of rows)for(const part of parts.filter(s=>s.includes('('))){const [,rel,cols]=part.match(/^(\w+)\(([a-z_,]+)\)$/);if(!['organizers','event_categories','event_tags','event_deadlines'].includes(rel))throw Error('Unexpected relation');const join=rel==='organizers'?'id=(select organizer_id from public.events where id=$1)':rel==='event_categories'?'id=(select category_id from public.events where id=$1)':'event_id=$1';const related=(await db.query(`select ${cols} from public.${rel} where ${join}`,[row.id])).rows;row[rel]=['organizers','event_categories'].includes(rel)?related[0]??null:related;}
 const data=JSON.parse(JSON.stringify(rows,(k,v)=>['start_date','end_date','local_date'].includes(k)?v?.slice(0,10)??null:v));return {data:single?data[0]??null:data,error:null};
 });}return q;}};
 globalThis.__c15Identity=async()=>({client,user:user?{id:user}:null});
 const identity=moduleUrl('export const resolveIdentity=()=>globalThis.__c15Identity();');
 const service=await import(await load('src/lib/for-you/service.ts',{'../auth/identity':identity}));
 return {...base,client,calls,service,setUser:v=>{user=v;},fail:v=>{failure=v;},hide:v=>{recheck=v;},rpc:()=>client.rpc('for_you_candidates'),close:async()=>{delete globalThis.__c15Identity;await base.close();}};
}
