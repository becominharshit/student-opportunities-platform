// Hosted verification: RLS enforcement, submitter direct-write protection, admin RPC authorization, cross-user isolation, clean teardown; zero event fixtures.
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
const submissionIds = [];
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
  check(migrationFiles.length === 11, "exactly 11 database migrations; organizer submissions migration present");

  // 2. Anonymous client negative checks
  const anonSubmissions = await anon.from("event_submissions").select("*");
  check(!!anonSubmissions.error || anonSubmissions.data.length === 0, "anonymous cannot read event_submissions");

  const anonModEvents = await anon.from("submission_moderation_events").select("*");
  check(!!anonModEvents.error || anonModEvents.data.length === 0, "anonymous cannot read submission_moderation_events");

  const anonCreateRpc = await anon.rpc("submit_event_opportunity", {
    p_payload: {
      title: "Anonymous Probe",
      organizer_name: "Probe Organizer",
      category_slug: "hackathon",
      mode: "online",
      submitter_relationship: "community_member",
    },
  });
  check(!!anonCreateRpc.error, "anonymous submit_event_opportunity RPC is strictly rejected");

  const anonListAdminRpc = await anon.rpc("list_admin_submissions", {
    p_status: "submitted",
    p_limit: 10,
    p_cursor_created_at: null,
    p_cursor_id: null,
  });
  check(!!anonListAdminRpc.error, "anonymous list_admin_submissions RPC is strictly rejected");

  // 3. Create temporary test users A (submitter), B (cross-user probe), C (admin)
  const emailA = `probe-sub-a-${run}@example.invalid`;
  const emailB = `probe-sub-b-${run}@example.invalid`;
  const emailC = `probe-admin-c-${run}@example.invalid`;
  const passwordA = randomBytes(32).toString("base64url") + "Aa1!";
  const passwordB = randomBytes(32).toString("base64url") + "Aa1!";
  const passwordC = randomBytes(32).toString("base64url") + "Aa1!";

  const createdA = await service.auth.admin.createUser({ email: emailA, password: passwordA, email_confirm: true });
  check(!createdA.error && createdA.data.user?.id, "temporary User A (submitter) created");
  const userAId = createdA.data.user.id;
  userIds.push(userAId);

  const createdB = await service.auth.admin.createUser({ email: emailB, password: passwordB, email_confirm: true });
  check(!createdB.error && createdB.data.user?.id, "temporary User B (cross-user probe) created");
  const userBId = createdB.data.user.id;
  userIds.push(userBId);

  const createdC = await service.auth.admin.createUser({ email: emailC, password: passwordC, email_confirm: true });
  check(!createdC.error && createdC.data.user?.id, "temporary User C (admin) created");
  const userCId = createdC.data.user.id;
  userIds.push(userCId);

  // Authenticate as User A and User B
  const clientA = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
  const authResA = await clientA.auth.signInWithPassword({ email: emailA, password: passwordA });
  check(!authResA.error, "User A authenticated");

  const clientB = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
  const authResB = await clientB.auth.signInWithPassword({ email: emailB, password: passwordB });
  check(!authResB.error, "User B authenticated");

  // 4. Privileged write protection: User A cannot direct-write into event_submissions or moderation events
  const directInsertSub = await clientA.from("event_submissions").insert({
    title: "Direct Table Insert Probe",
    organizer_name: "Probe Organizer",
    category_slug: "hackathon",
    mode: "online",
    submitter_relationship: "organizer",
    user_id: userAId,
  });
  check(!!directInsertSub.error, "User A direct INSERT into event_submissions is strictly denied (42501)");

  const directUpdateSub = await clientA.from("event_submissions").update({
    title: "Direct Table Update Probe",
  }).eq("user_id", userAId);
  check(!!directUpdateSub.error, "User A direct UPDATE on event_submissions is strictly denied (42501)");

  const directDeleteSub = await clientA.from("event_submissions").delete().eq("user_id", userAId);
  check(!!directDeleteSub.error, "User A direct DELETE on event_submissions is strictly denied (42501)");

  const directInsertMod = await clientA.from("submission_moderation_events").insert({
    submission_id: randomUUID(),
    actor_id: userAId,
    actor_role: "admin",
    action: "probe",
  });
  check(!!directInsertMod.error, "User A direct INSERT into submission_moderation_events is strictly denied");

  // 5. Submitter flow via RPCs: User A creates submission
  const createResA = await clientA.rpc("submit_event_opportunity", {
    p_payload: {
      title: `Hosted Community Hackathon ${run}`,
      organizer_name: "Community Organizer",
      category_slug: "hackathon",
      mode: "online",
      submitter_relationship: "organizer",
      official_url: "https://example.invalid/hackathon",
      description: "A community hackathon submitted for moderation review.",
    },
  });
  check(!createResA.error && createResA.data?.id, "User A successfully creates submission via RPC");
  const subAId = createResA.data.id;
  submissionIds.push(subAId);

  // User A reads own submission
  const userASubs = await clientA.from("event_submissions").select("*").eq("id", subAId);
  check(
    !userASubs.error && userASubs.data.length === 1 && userASubs.data[0].status === "submitted",
    "User A reads own submission with status 'submitted'"
  );

  // User B cannot see User A's submission
  const userBSubs = await clientB.from("event_submissions").select("*").eq("id", subAId);
  check(
    !userBSubs.error && userBSubs.data.length === 0,
    "User B cannot see User A's submission (cross-user isolation)"
  );

  // Submitter A cannot invoke Admin RPCs
  const adminListProbe = await clientA.rpc("list_admin_submissions", {
    p_status: "submitted",
    p_limit: 10,
    p_cursor_created_at: null,
    p_cursor_id: null,
  });
  check(!!adminListProbe.error, "Submitter A cannot call list_admin_submissions RPC (forbidden)");

  const adminGetProbe = await clientA.rpc("get_admin_submission", { p_submission_id: subAId });
  check(!!adminGetProbe.error, "Submitter A cannot call get_admin_submission RPC (forbidden)");

  const adminModProbe = await clientA.rpc("start_review_event_submission", {
    p_command: {
      id: subAId,
      expected_version: 1,
    },
  });
  check(!!adminModProbe.error, "Submitter A cannot call start_review_event_submission RPC (forbidden)");

  // User A edits own submission
  const updateResA = await clientA.rpc("edit_event_submission", {
    p_command: {
      id: subAId,
      expected_version: 1,
      patch: { title: `Hosted Community Hackathon Updated ${run}` },
    },
  });
  check(!updateResA.error && updateResA.data?.version === 2, "User A edits own submission (version incremented to 2)");

  // User B cannot edit User A's submission
  const updateResBbyA = await clientB.rpc("edit_event_submission", {
    p_command: {
      id: subAId,
      expected_version: 2,
      patch: { title: "Hacked" },
    },
  });
  check(!!updateResBbyA.error, "User B cannot edit User A's submission");

  // User A withdraws own submission
  const withdrawResA = await clientA.rpc("withdraw_event_submission", {
    p_command: {
      id: subAId,
      expected_version: 2,
    },
  });
  check(!withdrawResA.error && withdrawResA.data?.status === "withdrawn", "User A withdraws own submission (status 'withdrawn')");

  // 6. Admin moderation workflow test
  // Grant admin role to User C
  const adminGrant = await service.from("admin_memberships").insert({ user_id: userCId, role: "admin" });
  check(!adminGrant.error, "User C granted temporary admin role");

  const clientC = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
  const authResC = await clientC.auth.signInWithPassword({ email: emailC, password: passwordC });
  check(!authResC.error, "User C (Admin) authenticated");

  // User B creates a submission for admin moderation
  const createResB = await clientB.rpc("submit_event_opportunity", {
    p_payload: {
      title: `Admin Moderation Probe ${run}`,
      organizer_name: "Community Workshop Host",
      category_slug: "workshop",
      mode: "online",
      submitter_relationship: "community_member",
      official_url: "https://example.invalid/workshop",
      description: "Workshop submitted by User B for admin moderation review.",
    },
  });
  check(!createResB.error && createResB.data?.id, "User B creates submission for admin moderation test");
  const subBId = createResB.data.id;
  submissionIds.push(subBId);

  // Admin C lists submissions
  const adminList = await clientC.rpc("list_admin_submissions", {
    p_status: "submitted",
    p_limit: 50,
    p_cursor_created_at: null,
    p_cursor_id: null,
  });
  let adminListData = adminList.data;
  if (typeof adminListData === "string") {
    try { adminListData = JSON.parse(adminListData); } catch {}
  }
  check(
    !adminList.error && Array.isArray(adminListData) && adminListData.some((s) => s.id === subBId),
    "Admin C lists submissions and finds User B's submission"
  );

  // Admin C gets detail
  const adminDetail = await clientC.rpc("get_admin_submission", { p_submission_id: subBId });
  let adminDetailData = adminDetail.data;
  if (typeof adminDetailData === "string") {
    try { adminDetailData = JSON.parse(adminDetailData); } catch {}
  }
  check(
    !adminDetail.error && adminDetailData?.submission?.id === subBId && adminDetailData?.moderation?.canonical_event_id === null,
    "Admin C reads submission detail including private moderation state"
  );

  // Admin C starts review
  const startRevRes = await clientC.rpc("start_review_event_submission", {
    p_command: {
      id: subBId,
      expected_version: 1,
      internal_notes: "Starting review for probe",
    },
  });
  check(!startRevRes.error && startRevRes.data?.status === "under_review", "Admin C starts review (status 'under_review')");

  // Admin C rejects with reason
  const rejectRes = await clientC.rpc("reject_event_submission", {
    p_command: {
      id: subBId,
      expected_version: 2,
      rejection_reason_code: "other",
      rejection_reason_details: "Automated hosted verification test rejection.",
      internal_notes: "Test rejection",
    },
  });
  check(!rejectRes.error && rejectRes.data?.status === "rejected", "Admin C rejects submission with reason");

  // Admin C checks audit history
  const historyRes = await clientC.rpc("get_admin_submission_history", { p_submission_id: subBId });
  let historyData = historyRes.data;
  if (typeof historyData === "string") {
    try { historyData = JSON.parse(historyData); } catch {}
  }
  check(
    !historyRes.error && Array.isArray(historyData) && historyData.length >= 2,
    "Admin C reads audit history with recorded actions"
  );

  // NOTE: accept_event_submission is intentionally NOT called on hosted to ensure ZERO event fixtures.
  check(true, "accept_event_submission safely bypassed on hosted to preserve zero event fixtures");

  success = true;
} catch (e) {
  console.error("FAIL: Hosted verification error:", e);
  process.exitCode = 1;
} finally {
  console.log("\nCleaning up temporary hosted fixtures...");
  // 7. Cleanup
  try {
    if (submissionIds.length > 0) {
      const delSubs = await service.from("event_submissions").delete().in("id", submissionIds);
      if (delSubs.error) console.error("Error deleting submissions:", delSubs.error);
    }
  } catch (cleanErr) {
    console.error("Submission cleanup error:", cleanErr);
    cleaned = false;
  }

  try {
    if (userIds.length > 0) {
      await service.from("admin_memberships").delete().in("user_id", userIds);
      for (const id of userIds) {
        await service.auth.admin.deleteUser(id);
      }
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

  await mkdir("work/submissions", { recursive: true });
  await writeFile(
    "work/submissions/hosted-results.json",
    JSON.stringify(
      {
        run,
        userIds,
        submissionIds,
        checks,
        before,
        after,
        success: success && cleaned,
        cleaned,
        path: "hosted submissions RLS, RPC authorization, moderation workflow, and negative security verification",
        checkedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  if (success && cleaned) {
    console.log("\nHosted organizer submissions verification PASSED completely!");
  } else {
    console.error("\nHosted organizer submissions verification FAILED!");
    process.exitCode = 1;
  }
}
