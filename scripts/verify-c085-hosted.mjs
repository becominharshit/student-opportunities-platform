// Hosted C08.5 verification only. No connector creation/activation or source fetch capability.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const dir = new URL("work/c085/", root);
await mkdir(dir, { recursive: true });
const env = parseEnv(await readFile(new URL(".env.local", root), "utf8"));
const project = "vzuoscpwmytgibsxugcx";
const base = `https://${project}.supabase.co`;
if (env.NEXT_PUBLIC_SUPABASE_URL !== base || !env.SUPABASE_SECRET_KEY?.startsWith("sb_secret_")) throw Error("Unexpected verification configuration");
for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]) process.env[key] = env[key];
// Execute the actual service helper; strip only Next's build-time marker for standalone Node.
const source = (await readFile(new URL("src/lib/supabase/service.ts", root), "utf8")).replace('import "server-only";', "");
await writeFile(new URL("service.mjs", dir), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { createServiceSupabaseClient } = await import(new URL("service.mjs", dir));
const service = createServiceSupabaseClient();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const anon = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
const user = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
const checks = [];
function check(ok, name) { if (!ok) throw Error("FAIL: " + name); checks.push(name); console.log("PASS: " + name); }
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function snapshot() {
  const out = { project };
  for (const table of ["source_connectors", "sync_runs"]) {
    const { data, error, count } = await service.from(table).select("*", { count: "exact" }).order("id").range(0, 999);
    if (error || count !== data?.length) throw Error("Runtime baseline read failed or exceeds bound");
    // Additive sync columns do not alter the baseline comparison.
    const rows = data.map(row => Object.fromEntries(Object.entries(row).filter(([k]) => table !== "sync_runs" || !["lease_token", "fencing_token", "parser_version", "policy_snapshot", "request_count"].includes(k))));
    out[table] = { count, hash: digest(rows) };
    if (table === "source_connectors") out.enabled = data.filter(row => row.enabled).length;
  }
  return out;
}
if (process.argv.includes("--snapshot")) {
  await writeFile(new URL("before.json", dir), JSON.stringify(await snapshot(), null, 2));
  console.log("PASS: pre-migration source/trigger baseline captured without storing row contents.");
} else {
  const before = JSON.parse(await readFile(new URL("before.json", dir), "utf8"));
  const run = randomUUID();
  const object = `${randomUUID()}/${run}/${randomUUID()}`;
  const attemptedObject = `${randomUUID()}/${run}/${randomUUID()}`;
  const host = `c085-${run}.invalid`;
  const absentConnector = randomUUID(), absentRun = randomUUID(), evidenceId = randomUUID();
  const payload = Buffer.from("SYNTHETIC C08.5 PRIVATE OBJECT " + run);
  let userId, token, success = false, cleaned = true;
  const expectedPermission = r => r.error?.code === "42501";
  async function http(path, headers = {}, init = {}) {
    // Exact project origin only, never follow redirects to an event source.
    const response = await fetch(base + path, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(20000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, leaks: bytes.includes(payload) };
  }
  try {
    check(JSON.stringify(await snapshot()) === JSON.stringify(before), "source connectors and sync records match pre-migration baseline");
    for (const table of ["connector_evidence", "connector_host_budgets"]) {
      const r = await service.from(table).select("*", { head: true, count: "exact" });
      check(!r.error, table + " exists and actual server-only helper can read it");
    }
    check(!(await service.from("sync_runs").select("lease_token,fencing_token,parser_version,policy_snapshot,request_count").limit(1)).error, "all five sync_runs additions are accessible");
    const rpc = await service.rpc("connector_runtime", { command: { op: "claim", connectorId: absentConnector, version: "c085-test" } });
    check(rpc.error?.code === "P0001" && rpc.error?.message === "permission_denied", "service RPC exists and executes its absent-source guard without creating a run");
    const bucket = await service.storage.getBucket("connector-raw");
    check(!bucket.error && bucket.data.public === false && Number(bucket.data.file_size_limit) === 2097152, "actual raw Storage bucket is private with 2 MiB limit");
    check(!(await service.from("connector_host_budgets").insert({ host, window_start: new Date().toISOString().slice(0, 10), requests: 0, daily_limit: 1, min_interval_ms: 0 })).error, "service can write exact synthetic runtime budget record");
    const evidence = { id: evidenceId, connector_id: absentConnector, run_id: absentRun, external_id: run, source_url: "https://fixture.invalid/raw", content_hash: createHash("sha256").update(payload).digest("hex"), parser_version: "c085-test", storage_path: object, content_type: "application/octet-stream", byte_count: payload.length, fetched_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() };
    check((await service.from("connector_evidence").insert(evidence)).error?.code === "23503", "service evidence INSERT reaches FK validation; no connector/evidence fixture is created");
    const password = randomBytes(32).toString("base64url") + "Aa1!";
    const email = `c085-${run}@example.invalid`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    check(!created.error && !!created.data.user?.id, "exact temporary ordinary Auth account created without email delivery");
    userId = created.data.user.id;
    const login = await user.auth.signInWithPassword({ email, password });
    check(!login.error && !!login.data.session?.access_token, "temporary ordinary user authenticated");
    token = login.data.session.access_token;
    check((await service.from("admin_memberships").select("user_id").eq("user_id", userId)).data?.length === 0, "temporary user has no administrator membership");
    for (const [name, client] of [["anon", anon], ["ordinary user", user]]) {
      check(expectedPermission(await client.from("connector_evidence").select("id")), name + " cannot read evidence metadata");
      check(expectedPermission(await client.from("connector_evidence").insert(evidence)), name + " cannot insert evidence metadata");
      check(expectedPermission(await client.from("connector_evidence").update({ parser_version: "denied" }).eq("id", evidenceId)), name + " cannot update evidence metadata");
      check(expectedPermission(await client.from("connector_evidence").delete().eq("id", evidenceId)), name + " cannot delete evidence metadata");
      check(expectedPermission(await client.from("connector_host_budgets").select("host").eq("host", host)), name + " cannot read runtime budget fixture");
      check(expectedPermission(await client.from("connector_host_budgets").update({ requests: 1 }).eq("host", host)), name + " cannot change runtime budget fixture");
      check(expectedPermission(await client.rpc("connector_runtime", { command: { op: "claim", connectorId: absentConnector, version: "c085-test" } })), name + " cannot execute connector runtime RPC");
      const sync = await client.from("sync_runs").select("id").limit(1);
      check(!!sync.error || sync.data?.length === 0, name + " cannot see sync runtime records");
    }
    const uploaded = await service.storage.from("connector-raw").upload(object, payload, { contentType: "application/octet-stream", upsert: false });
    check(!uploaded.error, "server-only client uploads exact private test object over Storage HTTP");
    const downloaded = await service.storage.from("connector-raw").download(object);
    check(!downloaded.error && Buffer.from(await downloaded.data.arrayBuffer()).equals(payload), "server-only Storage HTTP download matches test bytes");
    for (const [name, headers] of [["public URL", {}], ["publishable public URL", { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }], ["authenticated public URL", { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token }]]) {
      const r = await http("/storage/v1/object/public/connector-raw/" + object, headers);
      check([400,401,403,404].includes(r.status) && !r.leaks, name + " cannot deliver private object");
    }
    for (const [name, client] of [["anon", anon], ["ordinary user", user]]) {
      check(!!(await client.storage.from("connector-raw").download(object)).error, name + " cannot download exact private object");
      const listing = await client.storage.from("connector-raw").list(object.split("/").slice(0, 2).join("/"));
      check(!!listing.error || listing.data?.length === 0, name + " cannot list private object");
      check(!!(await client.storage.from("connector-raw").upload(attemptedObject, payload, { contentType: "application/octet-stream", upsert: false })).error, name + " cannot upload raw bytes");
      check(!!(await client.storage.from("connector-raw").update(object, Buffer.from("DENIED"), { contentType: "application/octet-stream" })).error, name + " cannot overwrite private object");
      const removal = await client.storage.from("connector-raw").remove([object]);
      check(!!removal.error || removal.data?.length === 0, name + " cannot delete private object");
      check(!!(await client.storage.from("connector-raw").createSignedUrl(object, 30)).error, name + " cannot create signed raw-object access");
    }
    const intact = await service.storage.from("connector-raw").download(object);
    check(!intact.error && Buffer.from(await intact.data.arrayBuffer()).equals(payload), "private object remains unchanged after ordinary-user mutation attempts");
    check(JSON.stringify(await snapshot()) === JSON.stringify(before), "no connector created/enabled/changed and no sync run started");
    success = true;
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith("FAIL:") ? error.message : "Verification failed; sensitive details suppressed.");
    process.exitCode = 1;
  } finally {
    try {
      const removed = await service.storage.from("connector-raw").remove([object, attemptedObject]);
      if (removed.error) cleaned = false;
      for (const key of [object, attemptedObject]) {
        const remaining = await service.storage.from("connector-raw").list(key.split("/").slice(0, 2).join("/"));
        if (remaining.error || remaining.data?.some(row => row.name === key.split("/").at(-1))) cleaned = false;
      }
      if ((await service.from("connector_host_budgets").delete().eq("host", host)).error) cleaned = false;
      if ((await service.from("connector_host_budgets").select("host").eq("host", host)).data?.length !== 0) cleaned = false;
      // Normally rejected by FK; exact-ID cleanup also handles an unexpected success safely.
      if ((await service.from("connector_evidence").delete().eq("id", evidenceId)).error) cleaned = false;
      if ((await service.from("connector_evidence").select("id").eq("id", evidenceId)).data?.length !== 0) cleaned = false;
      if (userId) {
        if ((await service.auth.admin.deleteUser(userId)).error) cleaned = false;
        const remaining = await service.auth.admin.getUserById(userId);
        if (!remaining.error || remaining.error.status !== 404) cleaned = false;
        for (const table of ["profiles", "admin_memberships"]) if ((await service.from(table).select("user_id").eq("user_id", userId)).data?.length !== 0) cleaned = false;
      }
      if (JSON.stringify(await snapshot()) !== JSON.stringify(before)) cleaned = false;
    } catch { cleaned = false; }
    console.log(cleaned ? "PASS: exact fixtures deleted and absence verified; source/sync baseline unchanged." : "FAIL: exact fixture cleanup needs attention.");
    if (!cleaned) process.exitCode = 1;
    await writeFile(new URL("results.json", dir), JSON.stringify({ project, checkedAt: new Date().toISOString(), run, success: success && cleaned, cleaned, checks, sourceFetches: 0, fixtures: { userId, host, object, attemptedObject, evidenceId }, baseline: before }, null, 2));
  }
}
