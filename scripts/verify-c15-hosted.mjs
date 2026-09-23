// Hosted C15 route/privacy verification only. Never writes hosted event/source inventory.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createClient} from '@supabase/supabase-js';
import {chromium} from '@playwright/test';
const env=parseEnv(await readFile('.env.local','utf8')),base='https://vzuoscpwmytgibsxugcx.supabase.co';
if(env.NEXT_PUBLIC_SUPABASE_URL!==base)throw Error('Wrong hosted project');
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})}};
const service=createClient(base,env.SUPABASE_SECRET_KEY,opts),anon=createClient(base,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,opts);
const ids=[],accounts=[],checks=[],run=randomUUID();let browser,child,before,after,success=false,cleaned=true;
function check(ok,name){if(!ok)throw Error('FAIL: '+name);checks.push(name);console.log('PASS: '+name);}
async function inventory(){const out={};for(const table of ['events','event_sources','source_connectors','sync_runs','profiles','user_interests','user_skills','admin_memberships']){const r=await service.from(table).select('*',{head:true,count:'exact'});if(r.error)throw Error('Inventory unavailable');out[table]=r.count;}return out;}
try{
 before=await inventory();check(before.events===0,'genuine hosted event inventory is empty (no seed writes)');
 check(!!(await anon.rpc('for_you_candidates')).error,'anonymous candidate RPC denied');
 for(let i=0;i<2;i++){
  const email=`c15-temporary-${run}-${i}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';const created=await service.auth.admin.createUser({email,password,email_confirm:true});check(!created.error&&created.data.user?.id,'exact temporary account created');ids.push(created.data.user.id);
  const client=createClient(base,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,opts);check(!(await client.auth.signInWithPassword({email,password})).error,'temporary ordinary session authenticated');accounts.push({client,email,password});
  check(!(await client.from('profiles').upsert({user_id:ids[i]},{onConflict:'user_id',ignoreDuplicates:true})).error,'ordinary profile bootstrap');
  check(!(await client.rpc('save_profile_section',{section:'about',values_json:{name:'C15 PRIVATE '+i}})).error,'ordinary private profile saved');
  const result=await client.rpc('for_you_candidates');check(!result.error&&result.data.has_published===false&&result.data.items.length===0,'ordinary bounded RPC returns genuine empty inventory');
 }
 const a=accounts[0].client;check((await a.from('profiles').select('user_id').eq('user_id',ids[1])).data?.length===0,'cross-user profile hidden');
 const mutation=await a.from('profiles').update({name:'DENIED'}).eq('user_id',ids[1]).select();check(!mutation.error&&mutation.data.length===0,'cross-user profile write denied');
 check(!!(await a.rpc('for_you_candidates',{user_id:ids[1]})).error,'RPC rejects caller-supplied identity');
 const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r));const origin='http://127.0.0.1:'+port;
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port),'-H','127.0.0.1'],{env:{...process.env,...env,APP_URL:origin},stdio:'ignore',windowsHide:true});
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/login')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:900}});
 await page.goto(origin+'/for-you');check(new URL(page.url()).pathname==='/login'&&new URL(page.url()).searchParams.get('next')==='/for-you','anonymous For You redirects to existing login flow');
 await page.getByLabel('Email',{exact:true}).fill(accounts[0].email);await page.getByLabel('Password',{exact:true}).fill(accounts[0].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(origin+'/for-you');
 check(await page.getByRole('heading',{name:'For You',exact:true}).isVisible(),'actual authenticated production For You route');
 check(await page.getByText('No opportunities are available yet.',{exact:true}).isVisible(),'genuine hosted empty state rendered');
 check(await page.getByText('Complete more of your profile to improve your recommendations.',{exact:true}).isVisible(),'partial profile allowed without onboarding redirect');
 check(await page.getByText(/^Match: \d+%$/).count()===0,'no invented match scores');
 const response=await page.goto(origin+'/for-you?user_id='+ids[1]);check(response.headers()['cache-control']?.includes('no-store'),'personalized response not cached');
 check(new URL(page.url()).pathname==='/for-you'&&!(await page.textContent('body')).includes('C15 PRIVATE'),'query identity ignored and private values not rendered');
 check(!(await page.content()).includes('eligibility_rules'),'no raw AST in rendered response');
 await page.goto(origin+'/account');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.goto(origin+'/for-you');check(new URL(page.url()).pathname==='/login','logout removes personalized access');
 check((await accounts[1].client.from('profiles').select('name').single()).data?.name==='C15 PRIVATE 1','other temporary profile unchanged');
 success=true;
}catch(e){console.error(e instanceof Error&&e.message.startsWith('FAIL:')?e.message:'FAIL: C15 hosted verification; sensitive exception details suppressed.');process.exitCode=1;}
finally{
 await browser?.close();if(child){child.kill();await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(r,5000);});}
 for(const id of ids){try{if((await service.auth.admin.deleteUser(id)).error)cleaned=false;if((await service.auth.admin.getUserById(id)).error?.status!==404)cleaned=false;for(const table of ['profiles','user_interests','user_skills','admin_memberships']){const r=await service.from(table).select('user_id').eq('user_id',id);if(r.error||r.data.length)cleaned=false;}}catch{cleaned=false;}}
 try{after=await inventory();if(before&&JSON.stringify(before)!==JSON.stringify(after))cleaned=false;}catch{cleaned=false;}
 console.log(cleaned?'PASS: exact temporary accounts/dependents removed; inventories unchanged.':'FAIL: fixture cleanup requires attention.');if(!cleaned)process.exitCode=1;
 await mkdir('work/c15',{recursive:true});await writeFile('work/c15/hosted-results.json',JSON.stringify({run,ids,checks,before,after,success:success&&cleaned,cleaned,checkedAt:new Date().toISOString()},null,2));
}
