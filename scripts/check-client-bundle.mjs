import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { parseEnv } from "node:util";

const root=new URL("../",import.meta.url);
let secrets=[];
try {
  const env=parseEnv(await readFile(new URL(".env.local",root),"utf8"));
  secrets=Object.entries(env).filter(([k,v])=>v && !k.startsWith("NEXT_PUBLIC_")).map(([,v])=>v);
} catch(e) { if(e.code!=="ENOENT") throw e; }
let count=0;
async function scan(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const url=new URL(entry.name+(entry.isDirectory()?"/":""),dir);
    if(entry.isDirectory()) await scan(url);
    else {
      count++;
      const content=await readFile(url);
      for(const secret of secrets) assert.ok(!content.includes(Buffer.from(secret)),"Private environment value detected in browser output");
      assert.ok(!content.includes(Buffer.from("SUPABASE_SERVICE_ROLE_KEY")),"Privileged variable reference detected in browser output");
    }
  }
}
await scan(new URL(".next/static/",root));
assert.ok(count>0,"No built client assets found");
console.log("PASS: "+count+" browser assets scanned; no private environment values or service-key references.");

