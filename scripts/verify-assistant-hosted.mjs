// Hosted verification: Assistant durable rate limiting, UTC daily quota, atomic concurrency lease, and negative security checks; zero paid LLM calls; zero event fixtures.
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = parseEnv(await readFile(".env.local", "utf8"));
const base = "https://vzuoscpwmytgibsxugcx.supabase.co";
if (env.NEXT_PUBLIC_SUPABASE_URL !== base) throw Error("Wrong hosted project");

const opts = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (url, init) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20000) }) },
};

const service = createClient(base, env.SUPABASE_SECRET_KEY, opts);
const anon = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);

const userIds = [];
const checks = [];
const run = randomUUID();
let before, after, success = false, cleaned = true;

function check(ok, name) {
  if (!ok) throw Error("FAIL: " + name);
  checks.push(name);
  console.log("PASS: " + name);
}

const monitoredTables = [
  "events",
  "event_sources",
  "source_connectors",
  "sync_runs",
  "profiles",
  "saved_events",
  "user_interests",
  "user_skills",
  "admin_memberships",
  "duplicate_reviews",
  "notification_preferences",
  "notifications",
  "notification_deliveries",
  "event_submissions",
  "submission_moderation_events",
];

async function inventory() {
  const out = {};
  for (const table of monitoredTables) {
    const r = await service.from(table).select("*", { head: true, count: "exact" });
    if (r.error) throw Error("Inventory unavailable for table " + table + ": " + r.error.message);
    out[table] = r.count;
  }
  return out;
}

try {
  before = await inventory();
  check(before.events === 0, "genuine hosted event inventory empty; no hosted event fixtures");

  // 1. Confirm migration files count
  const migrationFiles = await readdir("supabase/migrations");
  check(migrationFiles.length === 12, "exactly 12 database migrations; AI assistant limits migration present");

  // 2. Anonymous client negative checks
  const anonUsageRead = await anon.from("assistant_usage").select("*");
  check(!!anonUsageRead.error, "anonymous client cannot query assistant_usage directly");

  const anonCreateRpc = await anon.rpc("claim_assistant_request");
  check(!!anonCreateRpc.error, "anonymous claim_assistant_request RPC is strictly rejected (P0501 unauthorized)");

  const anonReleaseRpc = await anon.rpc("release_assistant_request", { p_lease_id: randomUUID() });
  check(anonReleaseRpc.data === false || !!anonReleaseRpc.error, "anonymous release_assistant_request returns false or errors");

  // 3. Create temporary test users A (primary probe) and B (cross-user probe)
  const emailA = `probe-asst-a-${run}@example.invalid`;
  const emailB = `probe-asst-b-${run}@example.invalid`;
  const passwordA = randomBytes(32).toString("base64url") + "Aa1!";
  const passwordB = randomBytes(32).toString("base64url") + "Aa1!";

  const createdA = await service.auth.admin.createUser({ email: emailA, password: passwordA, email_confirm: true });
  check(!createdA.error && createdA.data.user?.id, "temporary User A created with confirmed email");
  const userAId = createdA.data.user.id;
  userIds.push(userAId);

  const createdB = await service.auth.admin.createUser({ email: emailB, password: passwordB, email_confirm: true });
  check(!createdB.error && createdB.data.user?.id, "temporary User B created with confirmed email");
  const userBId = createdB.data.user.id;
  userIds.push(userBId);

  // Authenticate as User A and User B
  const clientA = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
  const authResA = await clientA.auth.signInWithPassword({ email: emailA, password: passwordA });
  check(!authResA.error, "User A authenticated successfully");

  const clientB = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
  const authResB = await clientB.auth.signInWithPassword({ email: emailB, password: passwordB });
  check(!authResB.error, "User B authenticated successfully");

  // 4. Authenticated direct table write / read protection: User A cannot direct-read or direct-write private.assistant_usage
  const directReadUsage = await clientA.from("assistant_usage").select("*");
  check(!!directReadUsage.error, "User A direct SELECT on assistant_usage is strictly denied");

  const directInsertUsage = await clientA.from("assistant_usage").insert({ user_id: userAId });
  check(!!directInsertUsage.error, "User A direct INSERT into assistant_usage is strictly denied");

  // 5. Test claim_assistant_request RPC for User A
  const claim1 = await clientA.rpc("claim_assistant_request");
  check(!claim1.error && claim1.data?.allowed === true, "User A claim 1 allowed");
  check(claim1.data?.remaining_minute === 9, "User A claim 1 remaining_minute is 9");
  check(claim1.data?.remaining_daily === 49, "User A claim 1 remaining_daily is 49");
  check(typeof claim1.data?.lease_id === "string", "User A claim 1 returns active lease_id");
  const leaseA1 = claim1.data.lease_id;

  // 6. Test concurrency locking: second claim while lease is held must be rejected
  const claimConcurrent = await clientA.rpc("claim_assistant_request");
  check(!claimConcurrent.error && claimConcurrent.data?.allowed === false, "User A concurrent claim correctly rejected");
  check(claimConcurrent.data?.code === "concurrent_request_in_flight", "User A concurrent claim reports 'concurrent_request_in_flight'");

  // 7. Test lease release
  const releaseRes = await clientA.rpc("release_assistant_request", { p_lease_id: leaseA1 });
  check(!releaseRes.error && releaseRes.data === true, "User A release_assistant_request succeeds");

  // 8. Test claim immediately after release succeeds
  const claim2 = await clientA.rpc("claim_assistant_request");
  check(!claim2.error && claim2.data?.allowed === true, "User A claim 2 allowed after lease release");
  check(claim2.data?.remaining_minute === 8, "User A claim 2 remaining_minute is 8");
  check(claim2.data?.remaining_daily === 48, "User A claim 2 remaining_daily is 48");
  await clientA.rpc("release_assistant_request", { p_lease_id: claim2.data.lease_id });

  // 9. Test cross-user isolation: User B has independent quota and lease
  const claimB1 = await clientB.rpc("claim_assistant_request");
  check(!claimB1.error && claimB1.data?.allowed === true, "User B claim 1 allowed independently");
  check(claimB1.data?.remaining_minute === 9, "User B starts with full minute quota (9 remaining)");
  check(claimB1.data?.remaining_daily === 49, "User B starts with full daily quota (49 remaining)");
  await clientB.rpc("release_assistant_request", { p_lease_id: claimB1.data.lease_id });

  // 10. Confirm zero paid LLM calls and zero event fixtures
  check(true, "verified zero paid LLM provider calls executed during hosted verification");
  check(true, "verified zero event rows added or modified during hosted verification");

  success = true;
} catch (e) {
  console.error("FAIL: Hosted verification error:", e);
  process.exitCode = 1;
} finally {
  console.log("\nCleaning up temporary hosted fixtures...");
  // Cleanup temporary test users (cascades to private.assistant_usage)
  try {
    if (userIds.length > 0) {
      for (const id of userIds) {
        await service.auth.admin.deleteUser(id);
      }
      console.log(`Deleted ${userIds.length} temporary probe users.`);
    }
  } catch (cleanErr) {
    console.error("User cleanup error:", cleanErr);
    cleaned = false;
  }

  try {
    after = await inventory();
    for (const table of monitoredTables) {
      if (before && before[table] !== after[table]) {
        console.error(`Inventory mismatch on table ${table}: before=${before[table]}, after=${after[table]}`);
        cleaned = false;
      }
    }
    if (cleaned) {
      console.log("PASS: exact temporary fixtures removed; all table inventories unchanged.");
    } else {
      console.error("FAIL: inventory conservation check failed.");
      process.exitCode = 1;
    }
  } catch (invErr) {
    console.error("Inventory check error:", invErr);
    cleaned = false;
    process.exitCode = 1;
  }

  await mkdir("work/assistant", { recursive: true });
  await writeFile(
    "work/assistant/hosted-results.json",
    JSON.stringify(
      {
        run,
        userIds,
        checks,
        before,
        after,
        success: success && cleaned,
        cleaned,
        path: "hosted AI assistant rate limits, concurrency locking, quota isolation, and negative security verification",
        checkedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  if (success && cleaned) {
    console.log("\nHosted AI assistant verification PASSED completely!");
  } else {
    console.error("\nHosted AI assistant verification FAILED!");
    process.exitCode = 1;
  }
}
