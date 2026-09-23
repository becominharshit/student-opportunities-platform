// C16 hosted negative/RLS and real empty-route checks; no hosted event fixtures.
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
const ids=[],accounts=[],checks=[],run=randomUUID(),missing=randomUUID();let browser,child,before,after,success=false,cleaned=true;
function check(ok,name){if(!ok)throw Error('FAIL: '+name);checks.push(name);console.log('PASS: '+name);}
async function inventory(){const out={};for(const table of ['events','event_sources','source_connectors','sync_runs','profiles','saved_events','user_interests','user_skills','admin_memberships']){const r=await service.from(table).select('*',{head:true,count:'exact'});if(r.error)throw Error('Inventory unavailable');out[table]=r.count;}return out;}
try{
 before=await inventory();check(before.events===0,'genuine hosted event inventory empty; no event writes');
 check(!!(await anon.from('saved_events').select('event_id')).error,'anonymous saves read denied');
 for(let i=0;i<2;i++){
  const email=`c16-temporary-${run}-${i}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';const created=await service.auth.admin.createUser({email,password,email_confirm:true});check(!created.error&&created.data.user?.id,'exact temporary ordinary account created');ids.push(created.data.user.id);
  const client=createClient(base,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,opts);check(!(await client.auth.signInWithPassword({email,password})).error,'temporary ordinary session authenticated');accounts.push({client,email,password});
  check(!(await client.from('profiles').upsert({user_id:ids[i]},{onConflict:'user_id',ignoreDuplicates:true})).error,'ordinary profile bootstrap');
  const own=await client.from('saved_events').select('event_id').eq('user_id',ids[i]);check(!own.error&&own.data.length===0,'ordinary own empty saves readable');
 }
 const a=accounts[0].client;
 check(!!(await anon.from('saved_events').insert({user_id:ids[0],event_id:missing})).error,'anonymous insert denied');
 check(!!(await anon.from('saved_events').delete().eq('user_id',ids[0]).eq('event_id',missing)).error,'anonymous delete denied');
 check(!!(await a.from('saved_events').insert({user_id:ids[1],event_id:missing})).error,'cross-user insert denied (no hosted event fixture)');
 check(!!(await a.from('saved_events').insert({user_id:ids[0],event_id:missing})).error,'nonpublished/nonexistent event cannot be saved');
 const cross=await a.from('saved_events').select('event_id').eq('user_id',ids[1]);check(!cross.error&&cross.data.length===0,'cross-user read returns no rows');
 const del=await a.from('saved_events').delete().eq('user_id',ids[1]).select('event_id');check(!del.error&&del.data.length===0,'cross-user delete affects no rows');
 const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r));const origin='http://127.0.0.1:'+port;
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port),'-H','127.0.0.1'],{env:{...process.env,...env,APP_URL:origin},stdio:'ignore',windowsHide:true});
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/login')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:900}});
 await page.goto(origin+'/saved');check(new URL(page.url()).pathname==='/login'&&new URL(page.url()).searchParams.get('next')==='/saved','anonymous Saved redirects through login with safe return');
 const post=(form,headers={})=>page.request.post(origin+'/saved/mutate',{form,headers:{origin,...headers},maxRedirects:0});
 for(const operation of ['save','unsave'])check((await post({operation,event_id:missing,return_to:'/saved'})).status()===401,'anonymous '+operation+' POST denied');
 await page.getByLabel('Email',{exact:true}).fill(accounts[0].email);await page.getByLabel('Password',{exact:true}).fill(accounts[0].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(origin+'/saved');
 check(await page.getByText("You haven't saved any opportunities yet.",{exact:true}).isVisible(),'actual production Saved route has genuine empty state');
 const response=await page.reload();check(response.headers()['cache-control']?.includes('no-store'),'private Saved response is not cached');
 check((await post({operation:'save',event_id:missing,return_to:'/saved'})).status()===404,'actual POST checks publication and missing event safely');
 for(let i=0;i<2;i++)check((await post({operation:'unsave',event_id:missing,return_to:'/saved'})).status()===303,'actual repeated unsave safely succeeds');
 check((await post({operation:'unsave',event_id:missing,user_id:ids[1]})).status()===400,'actual POST rejects browser owner injection');
 check((await post({operation:'unsave',event_id:missing},{origin:'https://evil.invalid'})).status()===403,'actual POST rejects cross-origin request');
 await page.goto(origin+'/saved?after=bad');check(await page.getByText('This saved-page link is invalid.',{exact:true}).isVisible(),'actual invalid cursor recovery');
 await page.goto(origin+'/account');check(await page.getByRole('link',{name:'Saved',exact:true}).isVisible(),'Saved is discoverable from account');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.goto(origin+'/saved');check(new URL(page.url()).pathname==='/login','logout removes saved-page access');
 success=true;
}catch(e){console.error(e instanceof Error&&e.message.startsWith('FAIL:')?e.message:'FAIL: C16 hosted verification; sensitive exception details suppressed.');process.exitCode=1;}
finally{
 await browser?.close();if(child){child.kill();await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(r,5000);});}
 for(const id of ids){try{if((await service.auth.admin.deleteUser(id)).error)cleaned=false;if((await service.auth.admin.getUserById(id)).error?.status!==404)cleaned=false;for(const table of ['profiles','saved_events','user_interests','user_skills','admin_memberships']){const r=await service.from(table).select('user_id').eq('user_id',id);if(r.error||r.data.length)cleaned=false;}}catch{cleaned=false;}}
 try{after=await inventory();if(before&&JSON.stringify(before)!==JSON.stringify(after))cleaned=false;}catch{cleaned=false;}
 console.log(cleaned?'PASS: exact temporary accounts/dependents removed; inventories unchanged.':'FAIL: fixture cleanup requires attention.');if(!cleaned)process.exitCode=1;
 await mkdir('work/c16',{recursive:true});await writeFile('work/c16/hosted-results.json',JSON.stringify({run,ids,checks,before,after,success:success&&cleaned,cleaned,path:'hosted empty route and negative RLS checks; populated save/ownership isolated',checkedAt:new Date().toISOString()},null,2));
}
