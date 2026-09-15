import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";

// Read-only hosted check. Never log credentials, response bodies or user records.
const env = parseEnv(await readFile(".env.local", "utf8"));
const historical = parseEnv(execFileSync("git", ["show", "d485c59:.env.local"], { encoding: "utf8" }));
const base = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
if (base !== "https://vzuoscpwmytgibsxugcx.supabase.co") throw new Error("Unexpected C03 project");
const old = historical.SUPABASE_SERVICE_ROLE_KEY;
const current = env.SUPABASE_SECRET_KEY;
const pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!old || !current?.startsWith("sb_secret_") || !pub) throw new Error("Required C03 credentials missing");
const adminPath = "/auth/v1/admin/users?page=1&per_page=1";
const dataPath = "/rest/v1/event_categories?select=id&limit=1";
const checks = [
  ["historicalAdmin", old, old, adminPath],
  ["historicalData", old, old, dataPath],
  ["historicalBearerAdmin", pub, old, adminPath],
  ["currentPublishable", pub, pub, dataPath],
  ["currentSecretAdmin", current, current, adminPath],
];
const statuses = {};
for (const [name, apiKey, bearer, path] of checks) {
  const response = await fetch(base + path, {
    headers: { apikey: apiKey, Authorization: "Bearer " + bearer },
    signal: AbortSignal.timeout(20000),
  });
  statuses[name] = response.status;
  await response.body?.cancel();
}
const passed = ["historicalAdmin", "historicalData", "historicalBearerAdmin"].every(k => [401, 403].includes(statuses[k]))
  && statuses.currentPublishable === 200 && statuses.currentSecretAdmin === 200;
const result = { project: "vzuoscpwmytgibsxugcx", checkedAt: new Date().toISOString(), statuses, passed };
await mkdir("work", { recursive: true });
await writeFile("work/final-c03-credentials.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (!passed) process.exitCode = 1;
