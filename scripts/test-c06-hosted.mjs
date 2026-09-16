// Read-only C06 smoke check of a local production Next.js build against hosted Supabase.
// No test events, users or sources are created.
import assert from "node:assert/strict";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {parseEnv} from "node:util";
import {spawn} from "node:child_process";
import {createClient} from "@supabase/supabase-js";
const env=parseEnv(await readFile(".env.local","utf8"));
if(env.NEXT_PUBLIC_SUPABASE_URL!=="https://vzuoscpwmytgibsxugcx.supabase.co") throw Error("Unexpected hosted project");
const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const origin="http://127.0.0.1:3136";
let child;
try {
  const {data,error}=await client.from("events").select("id,slug,title").eq("publication_status","published").order("id").limit(1);
  if(error) throw Error("Hosted public read failed");
  child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3136"],{env:{...process.env,...env,APP_URL:origin},windowsHide:true,stdio:"ignore"});
  child.on("error",()=>{});
  let ready=false;
  for(let i=0;i<60;i++){try{const r=await fetch(origin);await r.body?.cancel();if(r.ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,500));}
  assert.ok(ready,"Production server ready");
  const explore=await fetch(origin+"/explore"),text=await explore.text(); assert.equal(explore.status,200);
  assert.ok(!text.includes("Temporarily unavailable"));
  let status;
  if(!data.length){assert.ok(text.includes("No published opportunities are available yet."));status="Hosted empty state verified; real-event detail pending genuine inventory";}
  else {assert.ok(text.includes(`/events/${data[0].slug}`));const detail=await fetch(origin+"/events/"+data[0].slug);assert.equal(detail.status,200);assert.ok((await detail.text()).includes("Visit the organizer"));status="Hosted published Explore/detail journey verified";}
  console.log("PASS: "+status);
  const missing=await fetch(origin+"/events/nonexistent-c06-smoke-"+crypto.randomUUID());assert.equal(missing.status,404);assert.ok((await missing.text()).includes("Event not found"));
  console.log("PASS: nonexistent public event returns HTTP 404");
  const invalid=await fetch(origin+"/explore?after=invalid");assert.ok((await invalid.text()).includes("This page link is invalid"));console.log("PASS: malformed pagination link is recoverable");
  await mkdir("work/c06",{recursive:true});await writeFile("work/c06/hosted.json",JSON.stringify({success:true,status,checkedAt:new Date().toISOString(),writes:0},null,2));
}finally{child?.kill();}
