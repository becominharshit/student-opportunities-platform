import {fixtures,fixtureId} from "../events/c06-harness.mjs";
import {load,moduleUrl,doc,all,pred} from "./harness.mjs";
export const A='14000000-0000-0000-0000-000000000010',B='14000000-0000-0000-0000-000000000020';
export async function serviceFixture(){
 const base=await fixtures(),db=base.db,calls=[];
 await db.query('insert into auth.users(id) values($1),($2)',[A,B]);
 await db.query(`insert into public.profiles(user_id,degree,study_year,institution,city,country,preferred_modes,preferred_categories,willingness_to_travel,preferred_team_min,preferred_team_max) values($1,'BTech',2,'PRIVATE_A_INSTITUTION','Pune','IN','{online}','{hackathon}',false,2,4),($2,'PRIVATE_B_DEGREE',9,'PRIVATE_B_INSTITUTION','Delhi','IN','{offline}','{workshop}',false,9,10)`,[A,B]);
 await db.query("insert into public.user_interests select $1,id from public.interests where slug='robotics'",[A]);
 await db.query("insert into public.user_skills select $1,id from public.skills where slug='python'",[A]);
 await db.query("insert into public.event_tags(event_id,kind,tag,skill_id) select $1,'skill',slug,id from public.skills where slug='python'",[fixtureId(1)]);
 await db.query("update public.events set eligibility_rules=$2,mode='online',individual_allowed=false,min_team_size=2,max_team_size=4,status='scheduled',registration_status='open' where id=$1",[fixtureId(1),doc(all(pred('degree','eq','BTech'),pred('study_year','eq',2)))]);
 let user=A,queue=Promise.resolve(),failure=false,hideRecheck=false;
 const client={from(table){let fields='',filters=[],limit;
 const q={select(f){fields=f;return q;},eq(k,v){filters.push([k,v]);return q;},limit(n){limit=n;return q;},maybeSingle(){return execute(true);},then(resolve,reject){return execute(false).then(resolve,reject);}};
 function execute(single){const identity=user;calls.push({table,fields,filters:[...filters],limit});const run=queue.then(async()=>{
  if(failure)return {data:null,error:{message:'PRIVATE_FAILURE'}};
  if(hideRecheck&&fields==='version')return {data:null,error:null};
  await db.exec('begin');try{await db.exec('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[identity??'']);
   if(!['events','profiles','user_interests','user_skills'].includes(table)||filters.some(([k])=>!['id','user_id','version','publication_status'].includes(k)))throw Error('Unexpected read');
   const where=filters.map(([k],i)=>`${k}=$${i+1}`).join(' and ')||'true';let rows;
   if(table==='user_interests'){rows=(await db.query(`select json_build_object('slug',i.slug) interests from public.user_interests u join public.interests i on i.id=u.interest_id where u.user_id=$1 limit 101`,[filters[0][1]])).rows;}
   else {const plain=fields.split(/,(?![^()]*\))/).filter(s=>!s.includes('('));if(plain.some(x=>!/^[a-z_]+$/.test(x)))throw Error('Unexpected projection');rows=(await db.query(`select ${plain.join(',')} from public.${table} where ${where}${limit?' limit '+Number(limit):''}`,filters.map(([,v])=>v))).rows;
    if(table==='events'&&fields.includes('event_tags'))for(const row of rows){row.event_categories=(await db.query('select slug from public.event_categories where id=(select category_id from public.events where id=$1)',[row.id])).rows[0]??null;row.event_tags=(await db.query('select kind,tag,skill_id from public.event_tags where event_id=$1',[row.id])).rows;}
   }
   rows=JSON.parse(JSON.stringify(rows));return {data:single?rows[0]??null:rows,error:null};
  }finally{await db.exec('rollback');}
 });queue=run.catch(()=>{});return run;}
 return q;}};
 globalThis.__c14Identity=async()=>({client,user:user?{id:user}:null});
 const identity=moduleUrl('export const resolveIdentity=()=>globalThis.__c14Identity();');
 const service=await import(await load('src/lib/recommendations/service.ts',{'../auth/identity':identity}));
 const version=async id=>(await db.query('select version from public.events where id=$1',[id])).rows[0]?.version;
 return {...base,service,calls,version,id:fixtureId(1),hidden:fixtureId(29),setUser:id=>{user=id;},fail:value=>{failure=value;},hideRecheck:value=>{hideRecheck=value;},close:async()=>{delete globalThis.__c14Identity;await base.close();}};
}
