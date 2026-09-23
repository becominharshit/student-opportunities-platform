import {fixture as baseFixture,A,B} from '../for-you/harness.mjs';
import {load,moduleUrl} from '../recommendations/harness.mjs';
export {A,B};
export async function fixture(){
 const base=await baseFixture(),db=base.db,calls=[];let user=A,queue=Promise.resolve(),failure=false,hide=false;
 const client={auth:{getUser:async()=>({data:{user:user?{id:user,email_confirmed_at:'TEST_ONLY'}:null},error:null})},from(table){let fields='',op='select',body,filters=[],limit,orders=[],cursor;
 const q={select(v){fields=v;return q;},eq(k,v){filters.push([k,'=',v]);return q;},in(k,v){filters.push([k,'any',v]);return q;},limit(v){limit=v;return q;},order(k){orders.push(k);return q;},or(v){cursor=v;return q;},upsert(v,options){if(options.ignoreDuplicates!==true)throw Error('Unexpected update');body=v;op='insert';return q;},delete(){op='delete';return q;},maybeSingle(){return exec(true);},then(resolve,reject){return exec(false).then(resolve,reject);}};
 function exec(single){calls.push({table,fields,op,filters,limit,orders,cursor});const identity=user;
 const run=queue.then(async()=>{if(failure)return {data:null,error:{message:'PRIVATE_PROVIDER'}};await db.exec('begin');try{await db.exec('set local role '+(identity?'authenticated':'anon'));await db.query("select set_config('request.jwt.claim.sub',$1,true)",[identity??'']);
 if(!['saved_events','events'].includes(table))throw Error('Unexpected table');
 if(op==='insert'){await db.query('insert into public.saved_events(user_id,event_id)values($1,$2) on conflict(user_id,event_id)do nothing',[body.user_id,body.event_id]);return {data:null,error:null};}
 const values=[],where=[];for(const [k,operator,v] of filters){if(!['user_id','event_id','id','publication_status','events.publication_status'].includes(k))throw Error('Unexpected filter');if(k==='events.publication_status')continue;values.push(v);where.push(`${k} ${operator==='any'?'= any($'+values.length+'::uuid[])':'=$'+values.length}`);}
 if(op==='delete'){await db.query('delete from public.saved_events where '+where.join(' and '),values);return {data:null,error:null};}
 if(hide&&table==='events'&&fields==='id')return {data:[],error:null};
 if(cursor){const m=cursor.match(/^created_at.lt.(.+),and\(created_at.eq.(.+),event_id.lt.([0-9a-f-]+)\)$/);if(!m||m[1]!==m[2])throw Error('Unsafe cursor');values.push(m[1],m[3]);where.push(`(created_at,event_id)<($${values.length-1}::timestamptz,$${values.length}::uuid)`);}
 let rows;if(table==='saved_events'&&fields.includes('events!inner')){
  where.push("exists(select 1 from public.events e where e.id=event_id and e.publication_status='published')");
  rows=(await db.query(`select event_id,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"') created_at from public.saved_events where ${where.join(' and ')} order by created_at desc,event_id desc limit ${Number(limit)}`,values)).rows;
  const parts=fields.slice(fields.indexOf('events!inner(')+13,-1).split(/,(?![^()]*\))/);
  const plain=parts.filter(x=>!x.includes('('));if(plain.some(x=>!/^[a-z_]+$/.test(x)))throw Error('Unsafe card');
  for(const row of rows){const event=(await db.query('select '+plain.join(',')+" from public.events where id=$1 and publication_status='published'",[row.event_id])).rows[0];
   for(const part of parts.filter(x=>x.includes('('))){const [,rel,cols]=part.match(/^(\w+)\(([a-z_,]+)\)$/);if(!['organizers','event_categories','event_deadlines'].includes(rel))throw Error('Unsafe relation');const join=rel==='organizers'?'id=(select organizer_id from public.events where id=$1)':rel==='event_categories'?'id=(select category_id from public.events where id=$1)':'event_id=$1';const related=(await db.query(`select ${cols} from public.${rel} where ${join}`,[row.event_id])).rows;event[rel]=['organizers','event_categories'].includes(rel)?related[0]??null:related;}
   row.events=event;
  }
 }else{if(!/^[a-z_,]+$/.test(fields))throw Error('Unsafe fields');rows=(await db.query(`select ${fields} from public.${table} where ${where.join(' and ')||'true'}${limit?' limit '+Number(limit):''}`,values)).rows;}
 rows=JSON.parse(JSON.stringify(rows,(k,v)=>['start_date','end_date','local_date'].includes(k)?v?.slice(0,10)??null:v));return {data:single?rows[0]??null:rows,error:null};
 }catch(e){return {data:null,error:{code:e.code??'TEST_ERROR'}};}finally{await db.exec(op==='select'?'rollback':'commit');}});queue=run.catch(()=>{});return run;
 }return q;}};
 globalThis.__c16Identity=async()=>({client,user:user?{id:user}:null});
 const identity=moduleUrl('export const resolveIdentity=()=>globalThis.__c16Identity();');
 const service=await import(await load('src/lib/saves/service.ts',{'../auth/identity':identity}));
 return {...base,client,calls,service,setUser:v=>{user=v;},fail:v=>{failure=v;},hide:v=>{hide=v;},close:async()=>{delete globalThis.__c16Identity;await base.close();}};
}
