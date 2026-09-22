// C12.5 hosted verification only: no event/source writes or source collection.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const env = parseEnv(await readFile(process.env.C125_ENV_FILE || ".env.local", "utf8"));
const project = "vzuoscpwmytgibsxugcx", base = "https://" + project + ".supabase.co";
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, base, "Intended project only");
assert.ok(env.SUPABASE_SECRET_KEY?.startsWith("sb_secret_"), "Server credential required");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
 global: { fetch: (url, init) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20000) }) } };
const service = createClient(base, env.SUPABASE_SECRET_KEY, options);
const anon = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
const ordinary = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
const checks = [], malformed = [];
const run = randomUUID();
let userId, child, browser, baseline, success = false, cleaned = false;
function check(ok, name) { if (!ok) throw Error("FAIL: " + name); checks.push(name); console.log("PASS: " + name); }
async function count(table, field, value) {
 let q = service.from(table).select("*", { head: true, count: "exact" });
 if (field) q = q.eq(field, value);
 const r = await q;
 if (r.error) throw Error("FAIL: count for " + table);
 return r.count;
}
async function inventory() {
 const result = {};
 for (const table of ["events", "event_sources", "source_connectors", "sync_runs", "admin_memberships", "profiles"]) result[table] = await count(table);
 result.published = await count("events", "publication_status", "published");
 result.enabled = await count("source_connectors", "enabled", true);
 return result;
}
const cardKeys = "id slug title short_description start_date end_date start_at end_at timezone date_precision mode venue city state country status registration_status verification_level verification_status last_checked_at organizers event_categories event_deadlines".split(" ").sort();
async function publicRows(rows) {
 check(Array.isArray(rows) && rows.length <= 25, "RPC returns bounded array");
 for (const row of rows) {
  assert.deepEqual(Object.keys(row).sort(), ["card", "key"]);
  assert.deepEqual(Object.keys(row.card).sort(), cardKeys);
  assert.deepEqual(Object.keys(row.card.organizers).sort(), ["id","name","website"]);
  assert.deepEqual(Object.keys(row.card.event_categories).sort(), ["id","name","slug"]);
  for (const d of row.card.event_deadlines) assert.deepEqual(Object.keys(d).sort(), "id kind label local_date due_at timezone precision active is_primary".split(" ").sort());
 }
 if (rows.length) {
  const r = await service.from("events").select("id,publication_status").in("id", rows.map(row => row.card.id));
  check(!r.error && r.data.length === rows.length && r.data.every(e => e.publication_status === "published"), "every returned ID is genuinely published");
 }
 const forbidden = /"(?:field_evidence|raw_storage_ref|policy_metadata|eligibility_rules|date_metadata|image_rights|search_vector|admin_memberships|profiles|diagnostics|source_id)"\s*:/;
 check(!forbidden.test(JSON.stringify(rows)), "RPC contains no private fields or records");
}
try {
 baseline = await inventory();
 console.log("Hosted inventory counts: " + JSON.stringify(baseline));
 const password = randomBytes(32).toString("base64url") + "Aa1!";
 const email = "c125-" + run + "@example.invalid";
 const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
 check(!created.error && !!created.data.user?.id, "temporary ordinary Auth account created without email delivery");
 userId = created.data.user.id;
 const signed = await ordinary.auth.signInWithPassword({ email, password });
 check(!signed.error && !!signed.data.session?.access_token, "real ordinary authenticated session obtained");
 check(await count("admin_memberships","user_id",userId) === 0, "ordinary account has no admin membership");

 for (const [name, client] of [["anonymous", anon], ["authenticated", ordinary]]) {
  const r = await client.rpc("search_published_events", { filters: { sort: "relevance" }, page_after: null });
  check(!r.error && r.status === 200, name + " hosted RPC executes over PostgREST");
  await publicRows(r.data);
  if (baseline.published === 0) check(r.data.length === 0, name + " real empty inventory returns []");
  const forged = await client.rpc("search_published_events", { filters: { publication_status: "draft", include_private: true }, page_after: null });
  check(!forged.error, name + " injected publication/private flags cannot change RPC scope");
  await publicRows(forged.data);
  if (baseline.events === 0) check(forged.data.length === 0, name + " unpublished/private flags return no rows");
  for (const [label,filters,page_after,mustReject] of [
   ["nonobject filters",[],null,true],
   ["unsupported sort",{sort:"match"},null,true],
   ["oversized query",{q:"x".repeat(201)},null,true],
   ["malformed cursor",{},[],true],
   ["missing cursor fields",{},{id:randomUUID()},true],
   ["bad UUID/numeric cursor",{},{id:"not-a-uuid",key:"not-a-number"},false],
   ["malformed date",{date_from:"invalid-date"},null,false],
   ["malformed team",{team:"not-a-number"},null,false],
  ]) {
   const bad=await client.rpc("search_published_events",{filters,page_after});
   const rejected=!!bad.error && bad.status>=400 && bad.status<500 && bad.error.code!=="PGRST202";
   const safeEmpty=!bad.error && bad.status===200 && Array.isArray(bad.data) && bad.data.length===0;
   check(mustReject ? rejected : rejected||safeEmpty, name+" "+label+" fails safely");
   if(bad.error) {
    check(!/(sb_secret_|Bearer |raw_storage_ref|policy_metadata)/.test(JSON.stringify(bad.error)),name+" "+label+" exposes no credentials/private row data");
   }
   malformed.push({role:name,label,status:bad.status,code:bad.error?.code??null,empty: safeEmpty});
  }
  for(const table of ["event_sources","source_connectors","sync_runs","admin_memberships"]) {
   const r=await client.from(table).select("*").limit(1);
   check(!!r.error || r.data?.length===0,name+" cannot read "+table+" private records");
  }
  let profiles=client.from("profiles").select("user_id").limit(1);
  if(name==="authenticated")profiles=profiles.neq("user_id",userId);
  const pr=await profiles;check(!!pr.error || pr.data?.length===0,name+" cannot read other private profiles");
  const unpublished=await client.from("events").select("id").neq("publication_status","published").limit(1);
  check(!unpublished.error && unpublished.data.length===0,name+" published-only RLS excludes unpublished query");
 }
 // Start the real production Next server; env is passed in memory, never copied to disk.
 const portProbe=createServer();await new Promise(resolve=>portProbe.listen(0,"127.0.0.1",resolve));
 const port=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
 const origin="http://127.0.0.1:"+port;
 child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env,...env,APP_URL:origin},windowsHide:true,stdio:"ignore"});
 let serverError=false;child.on("error",()=>{serverError=true;});
 let ready=false;
 for(let n=0;n<60;n++){if(serverError||child.exitCode!==null)break;try{const r=await fetch(origin);await r.body?.cancel();if(r.ok){ready=true;break;}}catch{} await new Promise(resolve=>setTimeout(resolve,500));}
 check(ready,"real production Next server starts with hosted Supabase");
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const r=await page.goto(origin+"/explore");
 check(r.status()===200,"hosted-backed /explore HTTP 200");
 if(baseline.published===0)check(await page.getByRole("heading",{name:"No published opportunities are available yet"}).isVisible(),"genuine hosted empty Explore state");
 check(await page.locator("article").count()<=24,"Explore stays page bounded");
 await page.getByLabel("Search",{exact:true}).fill("C125 no-match "+run);
 await page.getByRole("button",{name:"Search events",exact:true}).click();
 await page.waitForURL(/q=/);
 check(await page.getByRole("heading",{name:"No events match these filters"}).isVisible(),"real hosted search form renders no-match without missing RPC");
 await page.locator("summary").click();
 await page.getByLabel("Participation mode",{exact:true}).selectOption("online");
 await page.getByLabel("Country code",{exact:true}).fill("IN");
 await page.getByRole("button",{name:"Apply filters",exact:true}).click();
 await page.waitForURL(/mode=online/);
 check(await page.getByRole("heading",{name:"No events match these filters"}).isVisible(),"real hosted combined filter form works");
 check(!/PGRST202|Could not find the function|Public event catalogue unavailable/.test(await page.textContent("body")),"search/filter UI has no RPC-not-found error");
 await page.reload();check(await page.getByRole("heading",{name:"No events match these filters"}).isVisible(),"hosted-backed filter URL survives refresh");
 await page.goto(origin+"/explore?mode=invalid&after=invalid");
 check(await page.getByRole("heading",{name:/This page link is invalid/}).isVisible(),"hosted-backed invalid cursor recovery");
 await page.goto(origin+"/explore?date_from=bad&sort=match");
 check(await page.getByText(/Some unsupported or invalid query values/).isVisible(),"hosted-backed malformed filter notice is safe");
 check(!/PGRST202|Could not find the function/.test(await page.textContent("body")),"malformed form query does not expose RPC diagnostics");
 const privateValues=Object.entries(env).filter(([key,value])=>value&&!key.startsWith("NEXT_PUBLIC_")).map(([,value])=>value);
 async function inspectAssets(dir) {
  for(const item of await readdir(dir,{withFileTypes:true})){const path=dir+"/"+item.name;if(item.isDirectory())await inspectAssets(path);else {const bytes=await readFile(path);for(const secret of privateValues)check(!bytes.includes(Buffer.from(secret)),"built client asset excludes actual private configuration");}}
 }
 await inspectAssets(".next/static");
 success=true;
} catch(error) {
 console.error(error?.message?.startsWith("FAIL:")?error.message:"Hosted verification failed; sensitive response details suppressed.");
 process.exitCode=1;
} finally {
 await browser?.close();
 if(child&&child.exitCode===null){const exited=once(child,"exit").catch(()=>{});child.kill();await exited;}
 try {
  if(userId){
   check(!(await service.auth.admin.deleteUser(userId)).error,"exact temporary Auth user deleted");
   const absent=await service.auth.admin.getUserById(userId);
   check(absent.error?.status===404,"temporary Auth account absence verified");
   check(await count("profiles","user_id",userId)===0,"temporary profile removed");
   check(await count("admin_memberships","user_id",userId)===0,"no temporary admin membership remains");
  }
  const final=await inventory();
  check(JSON.stringify(final)===JSON.stringify(baseline),"event/source/sync/profile/admin counts unchanged after cleanup");
  cleaned=true;
 }catch{console.error("FAIL: exact Auth cleanup or inventory check needs attention");process.exitCode=1;}
 await mkdir("work/c125",{recursive:true});
 await writeFile("work/c125/hosted-results.json",JSON.stringify({project,run,checkedAt:new Date().toISOString(),success:success&&cleaned,cleaned,userId,checks,malformed,baseline,syntheticEventsCreated:0,sourceWrites:0},null,2));
}
