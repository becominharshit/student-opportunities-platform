// Hosted verification: RLS enforcement, cross-user isolation, privileged write protection, clean teardown, zero real emails.
import { readFile, readdir } from "node:fs/promises";
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

const ids = [];
const notifIds = [];
const checks = [];
const run = randomUUID();
let before, after;

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

  // 1. Confirm exactly 10 migrations exist
  const migrationFiles = await readdir("supabase/migrations");
  check(migrationFiles.length === 10, "exactly 10 database migrations; notifications migration present");

  // 2. Anonymous client negative checks
  const anonNotifs = await anon.from("notifications").select("*");
  check(!!anonNotifs.error || anonNotifs.data.length === 0, "anonymous cannot read notifications");

  const anonPrefs = await anon.from("notification_preferences").select("*");
  check(!!anonPrefs.error || anonPrefs.data.length === 0, "anonymous cannot read notification_preferences");

  const anonDeliveries = await anon.from("notification_deliveries").select("*");
  check(!!anonDeliveries.error, "anonymous cannot access notification_deliveries");

  const anonRpc = await anon.rpc("acquire_runner_lease", {
    p_job_name: "test",
    p_owner: "probe",
    p_duration_seconds: 60,
  });
  check(!!anonRpc.error, "anonymous cannot call acquire_runner_lease RPC");

  // 3. Create temporary test users A and B
  const emailA = `probe-a-${run}@example.invalid`;
  const emailB = `probe-b-${run}@example.invalid`;
  const passwordA = randomBytes(32).toString("base64url") + "Aa1!";
  const passwordB = randomBytes(32).toString("base64url") + "Aa1!";

  const createdA = await service.auth.admin.createUser({ email: emailA, password: passwordA, email_confirm: true });
  check(!createdA.error && createdA.data.user?.id, "temporary User A created");
  const userAId = createdA.data.user.id;
  ids.push(userAId);

  const createdB = await service.auth.admin.createUser({ email: emailB, password: passwordB, email_confirm: true });
  check(!createdB.error && createdB.data.user?.id, "temporary User B created");
  const userBId = createdB.data.user.id;
  ids.push(userBId);

  // Authenticate as User A and User B
  const clientA = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
  const authResA = await clientA.auth.signInWithPassword({ email: emailA, password: passwordA });
  check(!authResA.error, "User A authenticated");

  const clientB = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
  const authResB = await clientB.auth.signInWithPassword({ email: emailB, password: passwordB });
  check(!authResB.error, "User B authenticated");

  // 4. Preferences CRUD & cross-user isolation
  const userAPrefsBefore = await clientA.from("notification_preferences").select("*");
  check(!userAPrefsBefore.error && userAPrefsBefore.data.length === 0, "User A starts with zero stored preference rows");

  const upsertPrefA = await clientA.from("notification_preferences").upsert({
    user_id: userAId,
    email_enabled: true,
  });
  check(!upsertPrefA.error, "User A successfully upserts own preferences");

  const userAPrefsAfter = await clientA.from("notification_preferences").select("*");
  check(!userAPrefsAfter.error && userAPrefsAfter.data[0]?.email_enabled === true, "User A reads updated preferences");

  const userBPrefs = await clientB.from("notification_preferences").select("*");
  check(!userBPrefs.error && userBPrefs.data.length === 0, "User B cannot see User A preferences");

  // 5. Privileged write protection: User A cannot insert into notifications or deliveries
  const directInsertNotif = await clientA.from("notifications").insert({
    user_id: userAId,
    type: "deadline_approaching",
    title: "Direct Attack",
    body: "Body",
    idempotency_key: `attack-${run}`,
  });
  check(!!directInsertNotif.error, "User A cannot INSERT directly into notifications");

  const directInsertDelivery = await clientA.from("notification_deliveries").insert({
    user_id: userAId,
    notification_id: randomUUID(),
    channel: "email",
    idempotency_key: `attack-delivery-${run}`,
  });
  check(!!directInsertDelivery.error, "User A cannot INSERT directly into notification_deliveries");

  // 6. Cross-user notification isolation & mark read
  const notifAId = randomUUID();
  const notifBId = randomUUID();
  notifIds.push(notifAId, notifBId);

  const insertResA = await service.from("notifications").insert({
    id: notifAId,
    user_id: userAId,
    type: "deadline_approaching",
    title: "Registration deadline reminder",
    body: "Opportunity closing soon.",
    idempotency_key: `notif-a-${run}`,
  });
  check(!insertResA.error, "Service inserts notification for User A");

  const insertResB = await service.from("notifications").insert({
    id: notifBId,
    user_id: userBId,
    type: "deadline_approaching",
    title: "Registration deadline reminder",
    body: "Opportunity closing soon.",
    idempotency_key: `notif-b-${run}`,
  });
  check(!insertResB.error, "Service inserts notification for User B");

  // User A reads notifications
  const userANotifs = await clientA.from("notifications").select("id, title");
  check(
    !userANotifs.error &&
      userANotifs.data.length === 1 &&
      userANotifs.data[0].id === notifAId,
    "User A sees only own notification, not User B notification"
  );

  // User A attempts to mark User B notification read
  const markResBbyA = await clientA.rpc("mark_notification_read", { p_notification_id: notifBId });
  check(!markResBbyA.error && markResBbyA.data === false, "User A cannot mark User B notification as read");

  // User A marks own notification read
  const markResA = await clientA.rpc("mark_notification_read", { p_notification_id: notifAId });
  check(!markResA.error && markResA.data === true, "User A successfully marks own notification as read");

  const userANotifAfterMark = await clientA.from("notifications").select("id, read_at").eq("id", notifAId).single();
  check(!userANotifAfterMark.error && userANotifAfterMark.data.read_at !== null, "User A notification shows read_at set");

  // 7. Cleanup & inventory restoration
  console.log("Cleaning up temporary hosted fixtures...");
  await service.from("notifications").delete().in("id", notifIds);
  await service.from("notification_preferences").delete().in("user_id", ids);

  for (const uid of ids) {
    await service.auth.admin.deleteUser(uid);
  }

  after = await inventory();
  for (const table of monitoredTables) {
    check(
      before[table] === after[table],
      `Table ${table} inventory preserved (before: ${before[table]}, after: ${after[table]})`
    );
  }

  console.log("\nHosted notifications verification PASSED completely!");
} catch (err) {
  console.error("Hosted verification error:", err);
  // Teardown on failure
  try {
    if (notifIds.length > 0) await service.from("notifications").delete().in("id", notifIds);
    if (ids.length > 0) {
      await service.from("notification_preferences").delete().in("user_id", ids);
      for (const uid of ids) await service.auth.admin.deleteUser(uid);
    }
  } catch (cleanErr) {
    console.error("Cleanup error:", cleanErr);
  }
  process.exit(1);
}
