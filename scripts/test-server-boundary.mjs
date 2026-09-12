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

