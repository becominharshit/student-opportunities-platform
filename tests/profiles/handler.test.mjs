import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {NextRequest} from "next/server.js";
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const validation=compile(await readFile('src/lib/profiles/validation.ts','utf8'));
const stub=compile('export const createRequestSupabaseClient=(req,res)=>{if(globalThis.__c13Cookies){res.cookies.set("session.0","TEST_A");res.cookies.set("session.1","TEST_B");}return globalThis.__profileClient;};');
const config=compile('export const appOrigin=()=>"https://profile.example.test";');
let source=(await readFile('src/lib/profiles/handler.ts','utf8')).replace('import "server-only";','').replace('"next/server"',JSON.stringify(import.meta.resolve('next/server.js'))).replace('"../supabase/request"',JSON.stringify(stub)).replace('"../auth/config"',JSON.stringify(config)).replace('"./validation"',JSON.stringify(validation));
const {profilePost}=await import(compile(source));
const request=(body,headers={})=>new NextRequest('https://profile.example.test/account/profile/save',{method:'POST',headers:{origin:'https://profile.example.test','content-type':'application/x-www-form-urlencoded',...headers},body});
function client(user={id:'SESSION-IDENTITY',email_confirmed_at:'yes'},error=null){const calls=[];globalThis.__profileClient={auth:{getUser:async()=>({data:{user},error:null})},rpc:async(...args)=>{calls.push(args);return {data:!error,error};}};return calls;}
test('authenticated mutation never sends a browser-supplied owner or uses service role',async()=>{const calls=client();const r=await profilePost(request('section=about&name=Student'));assert.equal(r.status,200);assert.equal(calls.length,1);assert.equal(calls[0][0],'save_profile_section');assert.deepEqual(calls[0][1].values_json,{name:'Student',city:null,country:null});assert.match(r.headers.get('cache-control'),/no-store/);assert.doesNotMatch(await readFile('src/lib/profiles/handler.ts','utf8'),/supabase\/service|SUPABASE_SECRET/);});
test('anonymous POST rejected before RPC',async()=>{const calls=client(null);assert.equal((await profilePost(request('section=about'))).status,401);assert.equal(calls.length,0);});
test('cross-origin, wrong content type and oversized form rejected',async()=>{const calls=client();assert.equal((await profilePost(request('section=about',{origin:'https://evil.test'}))).status,403);assert.equal((await profilePost(request('{}',{'content-type':'application/json'}))).status,403);assert.equal((await profilePost(request('section=about&name='+'x'.repeat(17000)))).status,413);assert.equal(calls.length,0);});
test('owner injection and malformed values never reach RPC',async()=>{const calls=client();assert.equal((await profilePost(request('section=about&user_id=OTHER'))).status,400);assert.equal((await profilePost(request('section=education&study_year=0'))).status,400);assert.equal(calls.length,0);});
test('provider errors never reach user',async()=>{client(undefined,{code:'23514',message:'PRIVATE_SQL_SECRET'});const r=await profilePost(request('section=about&name=Student'));const s=await r.text();assert.equal(r.status,400);assert.doesNotMatch(s,/PRIVATE_SQL_SECRET|23514/);assert.match(s,/Check this section/);});

test('error responses retain refreshed cookie chunks separately',async()=>{globalThis.__c13Cookies=true;try{client(null);const r=await profilePost(request('section=about'));assert.equal(r.status,401);assert.deepEqual(r.cookies.getAll().map(c=>c.name),['session.0','session.1']);}finally{delete globalThis.__c13Cookies;}});
