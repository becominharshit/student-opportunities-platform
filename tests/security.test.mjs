import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import ts from "typescript";
import { getPublicSupabaseEnv } from "../src/lib/supabase/public-env.ts";

const root = new URL("../", import.meta.url);
async function sourceFiles(dir) {
  const out=[];
  for(const e of await readdir(dir,{withFileTypes:true})) {
    const url=new URL(e.name+(e.isDirectory()?"/":""),dir);
    if(e.isDirectory()) out.push(...await sourceFiles(url));
    else if(/\.(ts|tsx)$/.test(e.name)) out.push(url);
  }
  return out;
}
test("service client is guarded, sessionless, and the only source reading service credentials", async () => {
  const service=await readFile(new URL("src/lib/supabase/service.ts",root),"utf8");
  assert.match(service,/import "server-only"/);
  assert.match(service,/process\.env\.SUPABASE_SECRET_KEY/);
  assert.ok(!service.includes("SUPABASE_SERVICE_ROLE_KEY"), "Legacy variable must not be used as a fallback");
  for(const setting of ["persistSession","autoRefreshToken","detectSessionInUrl"]) assert.match(service,new RegExp(setting+": false"));
  for(const file of await sourceFiles(new URL("src/",root))) {
    if(file.pathname.endsWith("/service.ts")) continue;
    assert.ok(!/SUPABASE_(SECRET_KEY|SERVICE_ROLE_KEY)/.test(await readFile(file,"utf8")),"Privileged env access outside service module");
  }
});
test("client import graph cannot reach service/server modules", async () => {
  const files=await sourceFiles(new URL("src/",root));
  const compilerOptions={moduleResolution:ts.ModuleResolutionKind.Bundler,baseUrl:new URL("../",import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"),paths:{"@/*":["src/*"]}};
  const visit=async (file,seen=new Set()) => {
    const path=typeof file==="string"?file:await import("node:url").then(m=>m.fileURLToPath(file));
    if(seen.has(path)) return; seen.add(path);
    const code=await readFile(path,"utf8");
    assert.ok(!code.includes('import "server-only"'),"Client graph reaches server-only module");
    const ast=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true);
    for(const node of ast.statements) {
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)) {
        if(node.importClause?.isTypeOnly||node.isTypeOnly) continue;
        const resolved=ts.resolveModuleName(node.moduleSpecifier.text,path,compilerOptions,ts.sys).resolvedModule;
        if(resolved && !resolved.isExternalLibraryImport && !resolved.resolvedFileName.endsWith(".d.ts")) await visit(resolved.resolvedFileName,seen);
      }
    }
  };
  for(const file of files) if(/^["']use client["'];/.test(await readFile(file,"utf8"))) await visit(file);
});
test("public environment validation rejects privileged credentials without echoing them", () => {
  const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.test";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_secret_TEST_ONLY";
    assert.throws(getPublicSupabaseEnv,/publishable key/);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="x."+Buffer.from('{"role":"service_role"}').toString("base64url")+".x";
    assert.throws(getPublicSupabaseEnv,/publishable key/);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_TEST_ONLY";
    assert.equal(getPublicSupabaseEnv().url,"https://example.test");
    process.env.NEXT_PUBLIC_SUPABASE_URL="http://remote.example.test";
    assert.throws(getPublicSupabaseEnv,/HTTPS/);
  } finally {
    if(oldUrl===undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=oldKey;
  }
});
test("real local secrets are untracked and absent from Git history", async () => {
  const tracked=execFileSync("git",["ls-files","--cached","--others","--exclude-standard"],{encoding:"utf8"}).trim().split(/\r?\n/);
  assert.ok(!tracked.some(f=>/^\.env(\.|$)/.test(f)&&f!==".env.example"));
  execFileSync("git",["check-ignore",".env.local"]);
  let env;
  try { env=parseEnv(await readFile(new URL(".env.local",root),"utf8")); }
  catch(e) { if(e.code==="ENOENT") return; throw e; }
  const secrets=[env.SUPABASE_SECRET_KEY,env.SUPABASE_SERVICE_ROLE_KEY,env.AUTH_COOKIE_SECRET].filter(Boolean);
  for(const secret of secrets) {
    for(const file of tracked) assert.ok(!(await readFile(new URL(file,root))).includes(Buffer.from(secret)),"A tracked file contains a real secret");
    const history=execFileSync("git",["log","--all","-p"],{maxBuffer:20*1024*1024});
    assert.ok(!history.includes(Buffer.from(secret)),"Git history contains a real secret");
  }
});
