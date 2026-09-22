// Explicit C13 hosted verification. Only exact temporary accounts are mutated.
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {parseEnv} from "node:util";
import {randomUUID,randomBytes} from "node:crypto";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {createClient} from "@supabase/supabase-js";
import {chromium} from "@playwright/test";
const env=parseEnv(await readFile('.env.local','utf8'));
const base='https://vzuoscpwmytgibsxugcx.supabase.co';
if(env.NEXT_PUBLIC_SUPABASE_URL!==base)throw Error('Wrong project');
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})}};
const service=createClient(base,env.SUPABASE_SECRET_KEY,opts),anon=createClient(base,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,opts);
const ids=[],accounts=[],checks=[];let browser,child,before,success=false,cleaned=true;
const run=randomUUID();
function check(ok,name){if(!ok)throw Error('FAIL: '+name);checks.push(name);console.log('PASS: '+name);}
async function inventory(){const out={};for(const table of ['events','source_connectors','sync_runs','profiles','user_interests','user_skills','admin_memberships']){const r=await service.from(table).select('*',{head:true,count:'exact'});if(r.error)throw Error('Baseline unavailable');out[table]=r.count;}return out;}
async function rpc(client,section,values){return client.rpc('save_profile_section',{section,values_json:values});}
try{
 before=await inventory();
 const interests=await anon.from('interests').select('id,slug');const skills=await anon.from('skills').select('id,slug');
 check(!interests.error&&!skills.error,'controlled reference vocabulary readable');
 const interest=interests.data.find(x=>x.slug==='robotics')?.id,skill=skills.data.find(x=>x.slug==='python')?.id;
 check(!!interest&&!!skill,'required reference vocabulary present');
 for(let i=0;i<2;i++){
  const email=`c13-temporary-${run}-${i}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await service.auth.admin.createUser({email,password,email_confirm:true});
  check(!created.error&&!!created.data.user?.id,'temporary ordinary account provisioned');ids.push(created.data.user.id);
  const client=createClient(base,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,opts);
  const login=await client.auth.signInWithPassword({email,password});check(!login.error,'temporary ordinary session authenticated');
  accounts.push({email,password,client});
 }
 const [A,B]=ids,[a,b]=accounts.map(x=>x.client);
 // B uses the same idempotent insert semantics as C04; A is bootstrapped by actual login below.
 check(!(await b.from('profiles').upsert({user_id:B},{onConflict:'user_id',ignoreDuplicates:true})).error,'ordinary bootstrap identity-only insert works');
 const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r));const origin='http://127.0.0.1:'+port;
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port),'-H','127.0.0.1'],{env:{...process.env,...env,APP_URL:origin},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/login')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:900}});
 const outside=[];page.on('request',r=>{if(!r.url().startsWith(origin+'/'))outside.push(new URL(r.url()).origin);});
 await page.goto(origin+'/onboarding');check(new URL(page.url()).pathname==='/login','anonymous onboarding redirects to login');
 await page.getByLabel('Email',{exact:true}).fill(accounts[0].email);await page.getByLabel('Password',{exact:true}).fill(accounts[0].password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(origin+'/onboarding');
 check(await page.getByRole('heading',{name:'Build your student profile'}).isVisible(),'actual C04 login bootstraps and opens protected onboarding');
 const initial=await a.from('profiles').select('*').single();check(!initial.error&&initial.data.user_id===A,'own profile read with ordinary publishable client');
 check(['name','country','study_year','willingness_to_travel','portfolio_links'].every(k=>initial.data[k]===null),'initial optional values remain null');
 await page.getByLabel('Display or full name',{exact:true}).fill('C13 TEMPORARY PRIVATE '+run);
 const form=page.getByRole('form',{name:'About you',exact:true});await form.getByRole('button',{name:'Save about you',exact:true}).click();await form.getByRole('status').filter({hasText:'Saved.'}).waitFor();
 await page.reload();check((await page.getByLabel('Display or full name',{exact:true}).inputValue()).includes(run),'hydrated profile form saves and reloads with real authenticated RLS');
 check((await a.from('profiles').select('city,country,degree').single()).data.country===null,'partial save leaves optional sections unset');
 await page.getByLabel('Robotics',{exact:true}).check();const intForm=page.getByRole('form',{name:'Interests',exact:true});await intForm.getByRole('button').click();await intForm.getByRole('status').filter({hasText:'Saved.'}).waitFor();
 await page.getByLabel('Python',{exact:true}).check();const skillForm=page.getByRole('form',{name:'Skills',exact:true});await skillForm.getByRole('button').click();await skillForm.getByRole('status').filter({hasText:'Saved.'}).waitFor();
 check((await a.from('user_interests').select('interest_id')).data?.some(x=>x.interest_id===interest),'own interests saved from real UI');
 check((await a.from('user_skills').select('skill_id')).data?.some(x=>x.skill_id===skill),'own skills saved from real UI');
 check(!(await rpc(b,'about',{name:'C13 TEMP B'})).error,'ordinary B profile update works');
 for(const [table,fk,id] of [['user_interests','interest_id',interest],['user_skills','skill_id',skill]]){
  check(!(await b.from(table).insert({user_id:B,[fk]:id})).error,'B owns '+table+' fixture');
  const read=await a.from(table).select('*').eq('user_id',B);check(!read.error&&read.data.length===0,'cross-user '+table+' read hidden');
  const update=await a.from(table).update({[fk]:id}).eq('user_id',B).select();check(!update.error&&update.data.length===0,'cross-user '+table+' update denied');
  const del=await a.from(table).delete().eq('user_id',B).select();check(!del.error&&del.data.length===0,'cross-user '+table+' delete denied');
  check(!!(await a.from(table).upsert({user_id:B,[fk]:id})).error,'cross-user '+table+' insertion denied');
 }
 check((await a.from('profiles').select('*').eq('user_id',B)).data?.length===0,'cross-user profile read hidden');
 const change=await a.from('profiles').update({name:'DENIED'}).eq('user_id',B).select();check(!change.error&&change.data.length===0,'cross-user profile update denied');
 check((await b.from('profiles').select('name').single()).data?.name==='C13 TEMP B','B profile remains intact');
 for(const table of ['profiles','user_interests','user_skills']){const r=await anon.from(table).select('*');check(!!r.error||r.data.length===0,'anonymous '+table+' read denied');}
 check(!!(await rpc(anon,'about',{name:'DENIED'})).error,'anonymous mutation denied');
 check(!!(await rpc(a,'about',{user_id:B,name:'DENIED'})).error,'browser identity injection rejected by RPC');
 check(!(await rpc(a,'preferences',{willingness_to_travel:false,preferred_modes:null,any_category:null,preferred_categories:null,preferred_team_min:null,preferred_team_max:null})).error,'explicit false and nullable preferences accepted');
 check(!(await rpc(a,'links',{portfolio_links:['https://example.invalid/c13-never-fetch']})).error,'safe links stored without fetching');
 check(!!(await rpc(a,'links',{portfolio_links:['javascript:alert(1)']})).error,'unsafe link rejected on hosted database');
 check(!(await rpc(a,'links',{portfolio_links:null})).error,'optional links can be cleared');
 check(!(await rpc(a,'interests',{ids:[]})).error&&!(await rpc(a,'skills',{ids:[]})).error,'ordinary user clears own selections');
 check((await a.from('user_interests').select('*')).data?.length===0&&(await a.from('user_skills').select('*')).data?.length===0,'removed interests and skills stay absent');
 await page.goto(origin+'/account');check((await page.textContent('body')).includes(run),'private account shows saved profile');
 await page.goto(origin+'/explore');check(!(await page.textContent('body')).includes(run),'public Explore contains no private profile');
 check(outside.length===0,'browser never fetched profile links or external sources');
 // A subsequent C04 bootstrap cannot overwrite student information.
 check(!(await a.from('profiles').upsert({user_id:A},{onConflict:'user_id',ignoreDuplicates:true})).error,'repeat C04 bootstrap succeeds');
 check((await a.from('profiles').select('name').single()).data?.name.includes(run),'repeat bootstrap preserves saved information');
 success=true;
}catch(e){console.error(e instanceof Error&&e.message.startsWith('FAIL:')?e.message:'FAIL: hosted verification; sensitive exception details suppressed.');process.exitCode=1;}
finally{
 await browser?.close();if(child){child.kill();await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(r,5000);});}
 for(const id of ids){try{const del=await service.auth.admin.deleteUser(id);if(del.error)cleaned=false;const absent=await service.auth.admin.getUserById(id);if(absent.error?.status!==404)cleaned=false;for(const table of ['profiles','user_interests','user_skills','admin_memberships']){const r=await service.from(table).select('user_id').eq('user_id',id);if(r.error||r.data.length)cleaned=false;}}catch{cleaned=false;}}
 try{if(before&&JSON.stringify(await inventory())!==JSON.stringify(before))cleaned=false;}catch{cleaned=false;}
 console.log(cleaned?'PASS: exact temporary users and dependent rows deleted; inventory unchanged.':'FAIL: fixture cleanup needs attention.');if(!cleaned)process.exitCode=1;
 await mkdir('work/c13',{recursive:true});await writeFile('work/c13/hosted-results.json',JSON.stringify({run,ids,success:success&&cleaned,cleaned,checks,baseline:before,checkedAt:new Date().toISOString()},null,2));
}
