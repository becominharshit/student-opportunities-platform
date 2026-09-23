// C14 hosted profile/RLS verification; no event/source writes or generated recommendations.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {load,moduleUrl} from '../tests/recommendations/harness.mjs';
const env=parseEnv(await readFile('.env.local','utf8'));
const base='https://vzuoscpwmytgibsxugcx.supabase.co';
if(env.NEXT_PUBLIC_SUPABASE_URL!==base)throw Error('Wrong hosted project');
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})}};
const service=createClient(base,env.SUPABASE_SECRET_KEY,opts),anon=createClient(base,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,opts);
const run=randomUUID(),ids=[],clients=[],checks=[];
let before,after,success=false,cleaned=true;
function check(ok,name){if(!ok)throw Error('FAIL: '+name);checks.push(name);console.log('PASS: '+name);}
async function inventory(){const out={};for(const table of ['events','source_connectors','sync_runs','profiles','user_interests','user_skills','admin_memberships']){const r=await service.from(table).select('*',{head:true,count:'exact'});if(r.error)throw Error('Inventory unavailable');out[table]=r.count;}return out;}
try{
 before=await inventory();
 const interests=await anon.from('interests').select('id,slug'),skills=await anon.from('skills').select('id,slug');
 const interest=interests.data?.find(x=>x.slug==='robotics')?.id,skill=skills.data?.find(x=>x.slug==='python')?.id;
 check(!interests.error&&!skills.error&&interest&&skill,'controlled vocabulary available');
 for(let i=0;i<2;i++){
  const email=`c14-temporary-${run}-${i}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await service.auth.admin.createUser({email,password,email_confirm:true});
  check(!created.error&&created.data.user?.id,'exact temporary ordinary account created');ids.push(created.data.user.id);
  const client=createClient(base,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,opts);
  check(!(await client.auth.signInWithPassword({email,password})).error,'temporary ordinary session authenticated');clients.push(client);
  check(!(await client.from('profiles').upsert({user_id:ids[i]},{onConflict:'user_id',ignoreDuplicates:true})).error,'ordinary profile bootstrap');
  check(!(await client.rpc('save_profile_section',{section:'about',values_json:{name:'C14 TEMP PRIVATE '+i}})).error,'own profile transactional save');
  check(!(await client.from('user_interests').insert({user_id:ids[i],interest_id:interest})).error,'own interest fixture saved');
  check(!(await client.from('user_skills').insert({user_id:ids[i],skill_id:skill})).error,'own skill fixture saved');
 }
 const [A,B]=ids,[a,b]=clients;
 for(const [table,key,value] of [['profiles','name','C14 DENIED'],['user_interests','interest_id',interest],['user_skills','skill_id',skill]]){
  const own=await a.from(table).select('user_id').eq('user_id',A);check(!own.error&&own.data.length===1,'own '+table+' readable');
  const read=await a.from(table).select('*').eq('user_id',B);check(!read.error&&read.data.length===0,'cross-user '+table+' read hidden');
  const update=await a.from(table).update({[key]:value}).eq('user_id',B).select();check(!update.error&&update.data.length===0,'cross-user '+table+' update denied');
  check(!!(await a.from(table).upsert({user_id:B,[key]:value})).error,'cross-user '+table+' upsert denied');
  const publicRead=await anon.from(table).select('*');check(!!publicRead.error||publicRead.data.length===0,'anonymous '+table+' read denied');
 }
 check((await b.from('profiles').select('name').single()).data?.name==='C14 TEMP PRIVATE 1','other profile unchanged');
 check(!!(await a.rpc('save_profile_section',{section:'about',values_json:{user_id:B,name:'C14 DENIED'}})).error,'profile RPC rejects supplied other identity');
 check(!!(await a.from('admin_memberships').insert({user_id:A})).error,'ordinary user cannot promote membership');
 const identityKey=Symbol.for('c14-hosted-identity');
 globalThis[identityKey]={client:anon,user:null};
 const identity=moduleUrl('export async function resolveIdentity(){return globalThis[Symbol.for("c14-hosted-identity")];}');
 const {recommendationForEvent}=await import(await load('src/lib/recommendations/service.ts',{'../auth/identity':identity}));
 const missing=randomUUID();
 check((await recommendationForEvent(missing,1)).kind==='anonymous','actual recommendation service has no anonymous personalized result');
 for(const client of clients){
  const verified=await client.auth.getUser();check(!verified.error&&verified.data.user,'hosted Auth validates ordinary identity');
  globalThis[identityKey]={client,user:verified.data.user};
  check((await recommendationForEvent(missing,1)).kind==='not_found','actual service with hosted own RLS reads returns no match for absent event');
 }
 delete globalThis[identityKey];
 success=true;
}catch(e){console.error(e instanceof Error&&e.message.startsWith('FAIL:')?e.message:'FAIL: hosted C14 verification; sensitive exception details suppressed.');process.exitCode=1;}
finally{
 for(const id of ids){try{if((await service.auth.admin.deleteUser(id)).error)cleaned=false;if((await service.auth.admin.getUserById(id)).error?.status!==404)cleaned=false;for(const table of ['profiles','user_interests','user_skills','admin_memberships']){const r=await service.from(table).select('user_id').eq('user_id',id);if(r.error||r.data.length)cleaned=false;}}catch{cleaned=false;}}
 try{after=await inventory();if(before&&JSON.stringify(after)!==JSON.stringify(before))cleaned=false;}catch{cleaned=false;}
 console.log(cleaned?'PASS: exact temporary accounts/dependents removed; inventory unchanged.':'FAIL: exact cleanup requires attention.');if(!cleaned)process.exitCode=1;
 await mkdir('work/c14',{recursive:true});await writeFile('work/c14/hosted-results.json',JSON.stringify({run,ids,success:success&&cleaned,cleaned,checks,before,after,path:'hosted profile/RLS only; full event scoring isolated',checkedAt:new Date().toISOString()},null,2));
}
