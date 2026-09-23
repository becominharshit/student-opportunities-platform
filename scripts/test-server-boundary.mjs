import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root=new URL("../",import.meta.url);
await mkdir(new URL("work/",root),{recursive:true});
const fixture=await mkdtemp(fileURLToPath(new URL("work/server-boundary-",root)));
await mkdir(fixture+"/app");
await writeFile(fixture+"/package.json",JSON.stringify({private:true}));
await writeFile(fixture+"/next.config.mjs","export default { turbopack: { root: "+JSON.stringify(fileURLToPath(root))+" } };");
await writeFile(fixture+"/app/layout.tsx",'export default function Layout({children}: {children: React.ReactNode}) { return <html><body>{children}</body></html>; }');
await writeFile(fixture+"/app/page.tsx",'"use client";\nimport {createServiceSupabaseClient} from "./service";\nexport default function Page(){ return <button onClick={() => createServiceSupabaseClient()}>TEST ONLY</button>; }');
await copyFile(new URL("src/lib/supabase/service.ts",root),fixture+"/app/service.ts");
await copyFile(new URL("src/lib/supabase/database.types.ts",root),fixture+"/app/database.types.ts");
let output="";
const status=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL("node_modules/next/dist/bin/next",root)),"build",fixture],{windowsHide:true,timeout:60000});
  child.stdout.on("data",x=>output+=x); child.stderr.on("data",x=>output+=x);
  child.on("error",reject); child.on("close",resolve);
});
assert.notEqual(status,0,"Unsafe fixture unexpectedly built");
assert.match(output,/server-only/);
assert.match(output,/Client Component|use client|Server Component/);
console.log("PASS: Next.js rejected a Client Component importing the actual service client.");
await mkdir(fixture+"/app/connectors");
for(const name of ["contracts","errors","policy","transport","fetcher"]){await copyFile(new URL("src/lib/connectors/"+name+".ts",root),fixture+"/app/connectors/"+name+".ts");}
await writeFile(fixture+"/app/page.tsx",'"use client";\nimport {BoundedFetcher} from "./connectors/fetcher";\nexport default function Page(){return <span>{BoundedFetcher.name}</span>;}');
output="";
const connectorStatus=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL("node_modules/next/dist/bin/next",root)),"build",fixture],{windowsHide:true,timeout:60000});
  child.stdout.on("data",x=>output+=x); child.stderr.on("data",x=>output+=x);
  child.on("error",reject); child.on("close",resolve);
});
assert.notEqual(connectorStatus,0,"Unsafe connector fixture unexpectedly built");
assert.match(output,/server-only/);
assert.match(output,/Client Component|use client|Server Component/);
console.log("PASS: Next.js rejected a Client Component importing the actual connector fetcher.");


await mkdir(fixture+"/app/recommendations");
await mkdir(fixture+"/app/events");
for(const name of ["types","explanations","eligibility","facts","scoring"])await copyFile(new URL("src/lib/recommendations/"+name+".ts",root),fixture+"/app/recommendations/"+name+".ts");
await copyFile(new URL("src/lib/events/validation.ts",root),fixture+"/app/events/validation.ts");
await writeFile(fixture+"/app/page.tsx",'"use client";\nimport {evaluateRecommendation} from "./recommendations/scoring";\nexport default function Page(){return <span>{evaluateRecommendation.name}</span>;}');
output="";
const recommendationStatus=await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL("node_modules/next/dist/bin/next",root)),"build",fixture],{windowsHide:true,timeout:60000});
 child.stdout.on("data",x=>output+=x);child.stderr.on("data",x=>output+=x);child.on("error",reject);child.on("close",resolve);
});
assert.notEqual(recommendationStatus,0,"Unsafe recommendation fixture unexpectedly built");
assert.match(output,/server-only/);assert.match(output,/Client Component|use client|Server Component/);
console.log("PASS: Next.js rejected a Client Component importing the actual recommendation evaluator.");
await mkdir(fixture+"/app/for-you");
await copyFile(new URL("src/lib/for-you/ranking.ts",root),fixture+"/app/for-you/ranking.ts");
await writeFile(fixture+"/app/page.tsx",'"use client";\nimport {rankCandidates} from "./for-you/ranking";\nexport default function Page(){return <span>{rankCandidates.name}</span>;}');
output="";
const forYouStatus=await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL("node_modules/next/dist/bin/next",root)),"build",fixture],{windowsHide:true,timeout:60000});
 child.stdout.on("data",x=>output+=x);child.stderr.on("data",x=>output+=x);child.on("error",reject);child.on("close",resolve);
});
assert.notEqual(forYouStatus,0,"Unsafe For You fixture unexpectedly built");
assert.match(output,/server-only/);assert.match(output,/Client Component|use client|Server Component/);
console.log("PASS: Next.js rejected a Client Component importing actual For You ranking.");

await mkdir(fixture+"/app/notifications");
for(const name of ["types","email","runner"])await copyFile(new URL("src/lib/notifications/"+name+".ts",root),fixture+"/app/notifications/"+name+".ts");
await writeFile(fixture+"/app/page.tsx",'"use client";\nimport {runAllNotificationJobs} from "./notifications/runner";\nexport default function Page(){return <span>{runAllNotificationJobs.name}</span>;}');
output="";
const notificationStatus=await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL("node_modules/next/dist/bin/next",root)),"build",fixture],{windowsHide:true,timeout:60000});
 child.stdout.on("data",x=>output+=x);child.stderr.on("data",x=>output+=x);child.on("error",reject);child.on("close",resolve);
});
assert.notEqual(notificationStatus,0,"Unsafe notification runner fixture unexpectedly built");
assert.match(output,/server-only/);assert.match(output,/Client Component|use client|Server Component/);
console.log("PASS: Next.js rejected a Client Component importing actual notification runner.");
