import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { replay } from "../database/harness.mjs";
import { load } from "../recommendations/harness.mjs";

const {
  submitOpportunity,
  editSubmission,
  withdrawSubmission,
  listUserSubmissions,
  listAdminSubmissions,
  getAdminSubmission,
  getAdminSubmissionHistory,
  startReviewSubmission,
  rejectSubmission,
  acceptSubmission,
} = await import(await load("src/lib/submissions/service.ts"));

const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";
const ADMIN = "cccccccc-0000-0000-0000-000000000003";

let db;

before(async () => {
  db = await replay();

  // Ensure auth.users has email and email_confirmed_at columns
  await db.exec(`
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
  `);

  // Seed baseline users, organizers, categories
  await db.exec(`
    BEGIN;
    INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
      ('${USER_A}', 'student-a@example.test', '{}', now()),
      ('${USER_B}', 'student-b@example.test', '{}', now()),
      ('${ADMIN}', 'admin@example.test', '{"role":"admin"}', now());

    INSERT INTO public.profiles (user_id, name) VALUES
      ('${USER_A}', 'Student A'),
      ('${USER_B}', 'Student B');

    -- Grant admin role via admin_memberships table
    INSERT INTO public.admin_memberships (user_id, role) VALUES
      ('${ADMIN}', 'admin');

    INSERT INTO public.organizers (id, name, normalized_identity) VALUES
      ('55555555-0000-0000-0000-000000000001', 'Test Organizer', 'test-organizer');

    INSERT INTO public.event_categories (id, slug, name) VALUES
      ('66666666-0000-0000-0000-000000000001', 'hackathon', 'Hackathon')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.source_connectors (id, name, source_url, type) VALUES
      ('44444444-0000-0000-0000-000000000001', 'Test Connector', 'https://example.test', 'feed')
    ON CONFLICT DO NOTHING;

    COMMIT;
  `);
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`
    DELETE FROM public.event_submissions;
  `);
});

// Helper for simulated role execution in tests
async function asRole(role, uid, fn) {
  if (!role || role === "service_role") {
    return await fn();
  }
  await db.exec("begin");
  try {
    await db.exec("set local role " + role);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    if (uid === ADMIN) {
      await db.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
      await db.query("select set_config('request.jwt.claims', '{\"role\":\"authenticated\",\"app_metadata\":{\"role\":\"admin\"}}', true)");
    } else if (uid) {
      await db.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
      await db.query("select set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', true)");
    }
    const res = await fn();
    await db.exec("commit");
    return res;
  } catch (err) {
    await db.exec("rollback");
    throw err;
  }
}

function createTestClient(role, uid) {
  return {
    from(table) {
      return {
        select() {
          const queryBuilder = {
            async maybeSingle() {
              return { data: null, error: null };
            },
            async single() {
              return { data: null, error: null };
            },
            order() {
              return queryBuilder;
            },
            limit() {
              return queryBuilder;
            },
            ilike() {
              return queryBuilder;
            },
            or() {
              return queryBuilder;
            },
            then(resolve) {
              const sql = `SELECT * FROM public.${table}`;
              return asRole(role, uid, () => db.query(sql))
                .then((res) => resolve({ data: res.rows, error: null }))
                .catch((err) => resolve({ data: null, error: err }));
            },
          };
          return queryBuilder;
        },
        insert(values) {
          return {
            then(resolve) {
              const keys = Object.keys(values);
              const vals = Object.values(values);
              const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
              const sql = `INSERT INTO public.${table} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`;
              return asRole(role, uid, () => db.query(sql, vals))
                .then((res) => resolve({ data: res.rows, error: null }))
                .catch((err) => resolve({ data: null, error: err }));
            },
          };
        },
        update(values) {
          return {
            eq(col, val) {
              return {
                then(resolve) {
                  const keys = Object.keys(values);
                  const vals = Object.values(values);
                  vals.push(val);
                  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
                  const sql = `UPDATE public.${table} SET ${sets} WHERE ${col} = $${vals.length} RETURNING *`;
                  return asRole(role, uid, () => db.query(sql, vals))
                    .then((res) => resolve({ data: res.rows, error: null }))
                    .catch((err) => resolve({ data: null, error: err }));
                },
              };
            },
          };
        },
        delete() {
          return {
            eq(col, val) {
              return {
                then(resolve) {
                  const sql = `DELETE FROM public.${table} WHERE ${col} = $1`;
                  return asRole(role, uid, () => db.query(sql, [val]))
                    .then((res) => resolve({ data: res.rows, error: null }))
                    .catch((err) => resolve({ data: null, error: err }));
                },
              };
            },
          };
        },
      };
    },
    rpc(name, params = {}) {
      return asRole(role, uid, async () => {
        try {
          if (name === "submit_event_opportunity") {
            const res = await db.query(
              "SELECT to_jsonb(public.submit_event_opportunity($1::jsonb)) AS val",
              [JSON.stringify(params.p_payload)]
            );
            return { data: res.rows[0]?.val, error: null };
          }
          if (name === "edit_event_submission") {
            const res = await db.query(
              "SELECT to_jsonb(public.edit_event_submission($1::jsonb)) AS val",
              [JSON.stringify(params.p_command)]
            );
            return { data: res.rows[0]?.val, error: null };
          }
          if (name === "withdraw_event_submission") {
            const res = await db.query(
              "SELECT to_jsonb(public.withdraw_event_submission($1::jsonb)) AS val",
              [JSON.stringify(params.p_command)]
            );
            return { data: res.rows[0]?.val, error: null };
          }
          if (name === "list_user_submissions") {
            const res = await db.query(
              "SELECT public.list_user_submissions($1, $2, $3) AS val",
              [params.p_limit, params.p_cursor_created_at, params.p_cursor_id]
            );
            let val = res.rows[0]?.val ?? [];
            if (typeof val === "string") {
              try { val = JSON.parse(val); } catch {}
            }
            return { data: val, error: null };
          }
          if (name === "list_admin_submissions") {
            const res = await db.query(
              "SELECT public.list_admin_submissions($1, $2, $3, $4) AS val",
              [params.p_status, params.p_limit, params.p_cursor_created_at, params.p_cursor_id]
            );
            let val = res.rows[0]?.val ?? [];
            if (typeof val === "string") {
              try { val = JSON.parse(val); } catch {}
            }
            return { data: val, error: null };
          }
          if (name === "get_admin_submission") {
            const res = await db.query(
              "SELECT public.get_admin_submission($1::uuid) AS val",
              [params.p_submission_id]
            );
            return { data: res.rows[0]?.val, error: null };
          }
          if (name === "get_admin_submission_history") {
            const res = await db.query(
              "SELECT public.get_admin_submission_history($1::uuid) AS val",
              [params.p_submission_id]
            );
            return { data: res.rows[0]?.val, error: null };
          }
          if (name === "start_review_event_submission") {
            const res = await db.query(
              "SELECT public.start_review_event_submission($1::jsonb) AS val",
              [JSON.stringify(params.p_command)]
            );
            return { data: res.rows[0]?.val, error: null };
          }
          if (name === "reject_event_submission") {
            const res = await db.query(
              "SELECT public.reject_event_submission($1::jsonb) AS val",
              [JSON.stringify(params.p_command)]
            );
            return { data: res.rows[0]?.val, error: null };
          }
          if (name === "accept_event_submission") {
            const res = await db.query(
              "SELECT public.accept_event_submission($1::jsonb) AS val",
              [JSON.stringify(params.p_command)]
            );
            return { data: res.rows[0]?.val, error: null };
          }
          return { data: null, error: { message: `Unhandled test RPC: ${name}` } };
        } catch (err) {
          return { data: null, error: err };
        }
      });
    },
  };
}

test("Community Submissions: Anonymous user cannot submit", async () => {
  const anonClient = createTestClient("anon", null);
  const result = await submitOpportunity(anonClient, {
    title: "Anonymous Hackathon",
    organizerName: "Anon Org",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test",
    submitterRelationship: "participant",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "unauthorized");
});

test("Community Submissions: Submitter creates valid submission", async () => {
  const clientA = createTestClient("authenticated", USER_A);
  const result = await submitOpportunity(clientA, {
    title: "Hack The Future 2026",
    organizerName: "Future Builders",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/hack-future",
    registrationUrl: "https://example.test/register",
    startDate: "2026-11-01",
    endDate: "2026-11-03",
    deadlinePrecision: "date_only",
    deadlineLocalDate: "2026-10-25",
    deadlineTimezone: "UTC",
    description: "An annual innovation hackathon for engineering students.",
    eligibilitySummary: "Open to all enrolled university students worldwide.",
    submitterRelationship: "organizer",
    submitterNotes: "I am the lead organizer. Please let me know if you need verification docs.",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.title, "Hack The Future 2026");
  assert.equal(result.value.status, "submitted");
  assert.equal(result.value.version, 1);
  assert.equal(result.value.publishedEventSlug, null);

  // Verify moderation audit history recorded the 'submitted' event
  const history = await getAdminSubmissionHistory(createTestClient("authenticated", ADMIN), result.value.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].action, "submitted");
  assert.equal(history[0].actor_role, "submitter");
});

test("Community Submissions: 24-Hour duplicate title flood guard rejects repeat", async () => {
  const clientA = createTestClient("authenticated", USER_A);
  const first = await submitOpportunity(clientA, {
    title: "Duplicate Test Title",
    organizerName: "Future Builders",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/dup-1",
    submitterRelationship: "participant",
  });
  assert.equal(first.ok, true);

  const repeat = await submitOpportunity(clientA, {
    title: "Duplicate Test Title",
    organizerName: "Different Builders",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/dup-2",
    submitterRelationship: "participant",
  });

  assert.equal(repeat.ok, false);
  assert.equal(repeat.code, "duplicate_submission");
});

test("Community Submissions: 24-Hour rate limit allows max 5 submissions", async () => {
  const clientA = createTestClient("authenticated", USER_A);

  for (let i = 1; i <= 5; i++) {
    const res = await submitOpportunity(clientA, {
      title: `Hackathon Opportunity Batch ${i}`,
      organizerName: "Test Org",
      categorySlug: "hackathon",
      mode: "online",
      officialUrl: `https://example.test/batch-${i}`,
      submitterRelationship: "participant",
    });
    assert.equal(res.ok, true, `Submission ${i} should succeed`);
  }

  // 6th submission should be rejected with rate_limit_exceeded
  const sixth = await submitOpportunity(clientA, {
    title: "Hackathon Opportunity Batch 6",
    organizerName: "Test Org",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/batch-6",
    submitterRelationship: "participant",
  });

  assert.equal(sixth.ok, false);
  assert.equal(sixth.code, "rate_limit_exceeded");
});

test("Community Submissions: Submitter edits submission while submitted", async () => {
  const clientB = createTestClient("authenticated", USER_B);

  const created = await submitOpportunity(clientB, {
    title: "Original Title B",
    organizerName: "Org B",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/b",
    submitterRelationship: "organizer",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const edited = await editSubmission(clientB, created.value.id, created.value.version, {
    title: "Updated Title B",
    organizerName: "Org B Updated",
    categorySlug: "hackathon",
    mode: "hybrid",
    officialUrl: "https://example.test/b-updated",
    submitterRelationship: "organizer",
  });

  assert.equal(edited.ok, true);
  if (!edited.ok) return;

  assert.equal(edited.value.title, "Updated Title B");
  assert.equal(edited.value.mode, "hybrid");
  assert.equal(edited.value.version, 2);

  // Version conflict guard
  const conflict = await editSubmission(clientB, created.value.id, 1, {
    title: "Stale Edit",
    organizerName: "Org B",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/b",
    submitterRelationship: "organizer",
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "version_conflict");
});

test("Community Submissions: Submitter withdraws submission while submitted", async () => {
  const clientB = createTestClient("authenticated", USER_B);

  const created = await submitOpportunity(clientB, {
    title: "Withdrawn Hackathon",
    organizerName: "Org B",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/withdrawn",
    submitterRelationship: "organizer",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const withdrawn = await withdrawSubmission(clientB, created.value.id, created.value.version, "Event cancelled by organizers");
  assert.equal(withdrawn.ok, true);
  if (!withdrawn.ok) return;

  assert.equal(withdrawn.value.status, "withdrawn");
  assert.equal(withdrawn.value.version, 2);

  // Subsequent edit should fail
  const editFail = await editSubmission(clientB, created.value.id, withdrawn.value.version, {
    title: "Cannot edit withdrawn",
    organizerName: "Org B",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/withdrawn",
    submitterRelationship: "organizer",
  });
  assert.equal(editFail.ok, false);
  assert.equal(editFail.code, "invalid_transition");
});

test("Community Submissions: Cross-user RLS isolation and direct table write revocation", async () => {
  const clientA = createTestClient("authenticated", USER_A);
  const clientB = createTestClient("authenticated", USER_B);

  // Create submission by User A
  const created = await submitOpportunity(clientA, {
    title: "User A Private Opportunity",
    organizerName: "Org A",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/private-a",
    submitterRelationship: "participant",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  // User B attempts to edit User A's submission -> fails with not_found (row not visible under RLS)
  const maliciousEdit = await editSubmission(clientB, created.value.id, created.value.version, {
    title: "Hijacked by User B",
    organizerName: "Hacker Org",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/hijacked",
    submitterRelationship: "participant",
  });
  assert.equal(maliciousEdit.ok, false);
  assert.equal(maliciousEdit.code, "forbidden");

  // User B lists submissions -> does not see User A's submission
  const userBList = await listUserSubmissions(clientB);
  assert.equal(userBList.items.some((sub) => sub.id === created.value.id), false);

  // Direct table writes (INSERT / UPDATE / DELETE) are revoked from ordinary authenticated users
  const directInsert = await clientA.from("event_submissions").insert({
    title: "Direct Table Injection",
    organizer_name: "Illegal",
    category_slug: "hackathon",
    mode: "online",
    official_url: "https://example.test",
    submitter_relationship: "participant",
  });
  assert.equal(directInsert.error !== null, true);

  const directUpdate = await clientA.from("event_submissions").update({ status: "accepted" }).eq("id", created.value.id);
  assert.equal(directUpdate.error !== null, true);

  const directDelete = await clientA.from("event_submissions").delete().eq("id", created.value.id);
  assert.equal(directDelete.error !== null, true);
});

test("Community Submissions: Admin authorization checks on admin RPCs", async () => {
  const clientA = createTestClient("authenticated", USER_A);

  // Non-admin attempts to call admin RPCs -> P0503 forbidden
  const adminList = await listAdminSubmissions(clientA);
  assert.equal(adminList.items.length, 0);

  const adminGet = await getAdminSubmission(clientA, "00000000-0000-0000-0000-000000000000");
  assert.equal(adminGet, null);

  const reviewAttempt = await startReviewSubmission(clientA, "00000000-0000-0000-0000-000000000000", 1);
  assert.equal(reviewAttempt.ok, false);
  assert.equal(reviewAttempt.code, "forbidden");

  const rejectAttempt = await rejectSubmission(clientA, "00000000-0000-0000-0000-000000000000", 1, "duplicate");
  assert.equal(rejectAttempt.ok, false);
  assert.equal(rejectAttempt.code, "forbidden");

  const acceptAttempt = await acceptSubmission(clientA, "00000000-0000-0000-0000-000000000000", 1, {
    action: "create",
    reason: "Test",
    event: { title: "Test", slug: "test" },
  });
  assert.equal(acceptAttempt.ok, false);
  assert.equal(acceptAttempt.code, "forbidden");
});

test("Community Submissions: Admin starts review and rejects submission", async () => {
  const clientA = createTestClient("authenticated", USER_A);
  const adminClient = createTestClient("authenticated", ADMIN);

  const sub = await submitOpportunity(clientA, {
    title: "Rejectable Submission 2026",
    organizerName: "Dubious Org",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/dubious",
    submitterRelationship: "participant",
  });
  assert.equal(sub.ok, true);
  if (!sub.ok) return;

  // 1. Admin starts review
  const reviewResult = await startReviewSubmission(adminClient, sub.value.id, sub.value.version, "Checking organizer domain credentials");
  assert.equal(reviewResult.ok, true);
  assert.equal(reviewResult.value?.status, "under_review");

  // Submitter cannot edit while under review
  const editWhileReview = await editSubmission(clientA, sub.value.id, 2, {
    title: "Edit While Review",
    organizerName: "Dubious Org",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/dubious",
    submitterRelationship: "participant",
  });
  assert.equal(editWhileReview.ok, false);
  assert.equal(editWhileReview.code, "invalid_transition");

  // 2. Admin rejects with reason code
  const rejectResult = await rejectSubmission(
    adminClient,
    sub.value.id,
    2,
    "cannot_verify",
    "We could not confirm the event on the official organizer channel.",
    "Domain was registered yesterday and no social footprint exists."
  );
  assert.equal(rejectResult.ok, true);
  assert.equal(rejectResult.value?.status, "rejected");

  // 3. Submitter inspects their submission list -> sees rejection reason
  const userSubmissions = await listUserSubmissions(clientA);
  const found = userSubmissions.items.find((item) => item.id === sub.value.id);
  assert.ok(found);
  assert.equal(found.status, "rejected");
  assert.equal(found.rejectionReasonCode, "cannot_verify");
  assert.equal(found.rejectionReasonDetails, "We could not confirm the event on the official organizer channel.");
  // Internal notes are NOT leaked to submitter
  assert.equal("internal_notes" in found, false);
});

test("Community Submissions: Admin accepts submission, creates draft canonical event, and publishes", async () => {
  const clientA = createTestClient("authenticated", USER_A);
  const adminClient = createTestClient("authenticated", ADMIN);

  const sub = await submitOpportunity(clientA, {
    title: "Awesome Robotics Hackathon",
    organizerName: "RoboClub",
    categorySlug: "hackathon",
    mode: "offline",
    officialUrl: "https://example.test/roboclub",
    registrationUrl: "https://example.test/roboclub/reg",
    startDate: "2026-12-01",
    endDate: "2026-12-03",
    deadlinePrecision: "date_only",
    deadlineLocalDate: "2026-11-20",
    venue: "Main Hall",
    city: "San Francisco",
    state: "CA",
    country: "US",
    submitterRelationship: "organizer",
  });
  assert.equal(sub.ok, true);
  if (!sub.ok) return;

  // Admin accepts submission
  const categoryId = (await db.query("SELECT id FROM public.event_categories WHERE slug = 'hackathon'")).rows[0].id;

  const acceptResult = await acceptSubmission(
    adminClient,
    sub.value.id,
    sub.value.version,
    {
      action: "create",
      reason: `Accepting verified submission ${sub.value.id}`,
      event: {
        title: "Awesome Robotics Hackathon 2026",
        slug: "awesome-robotics-hackathon-2026",
        category_id: categoryId,
        mode: "offline",
        official_url: "https://example.test/roboclub",
        registration_url: "https://example.test/roboclub/reg",
        start_date: "2026-12-01",
        end_date: "2026-12-03",
        venue: "Main Hall",
        city: "San Francisco",
        state: "CA",
        country: "US",
      },
    },
    "Contacted organizer at official domain and confirmed dates.",
    "Congratulations! Your opportunity has been accepted."
  );

  assert.equal(acceptResult.ok, true);
  if (!acceptResult.ok) return;

  const canonicalEventId = acceptResult.value.canonicalEventId;
  assert.ok(canonicalEventId);

  // 1. Verify canonical event invariants: draft, community_submitted, pending
  const evRes = await db.query(
    "SELECT id, slug, publication_status, verification_level, verification_status FROM public.events WHERE id = $1",
    [canonicalEventId]
  );
  assert.equal(evRes.rows.length, 1);
  const createdEvent = evRes.rows[0];
  assert.equal(createdEvent.publication_status, "draft");
  assert.equal(createdEvent.verification_level, "community_submitted");
  assert.equal(createdEvent.verification_status, "pending");

  // 2. Submitter reads list -> published_event_slug must be NULL while publication_status is draft
  let userList = await listUserSubmissions(clientA);
  let userSub = userList.items.find((item) => item.id === sub.value.id);
  assert.ok(userSub);
  assert.equal(userSub.status, "accepted");
  assert.equal(userSub.publishedEventSlug, null); // INVARIANT: NULL until published

  // 3. Double acceptance prevention
  const doubleAccept = await acceptSubmission(
    adminClient,
    sub.value.id,
    2,
    {
      action: "create",
      reason: "Double accept",
      event: { title: "Double", slug: "double-test" },
    }
  );
  assert.equal(doubleAccept.ok, false);
  assert.equal(doubleAccept.code, "already_accepted");

  // 4. Now simulate admin verifying and publishing the canonical event via standard C05 mutate_event
  await db.query(`
    INSERT INTO public.event_sources (
      id, event_id, connector_id, external_id, source_url, normalized_url,
      last_checked_at, validated_observation, field_evidence, raw_storage_ref
    ) VALUES (
      gen_random_uuid(), $1, '44444444-0000-0000-0000-000000000001',
      'test-ext-accepted', 'https://example.test/roboclub', 'https://example.test/roboclub',
      now(), '{"official_url":"https://example.test/roboclub","registration_url":"https://example.test/roboclub/reg"}',
      '{"official_url":{"status":"checked"},"registration_url":{"status":"checked"}}', 'private/raw-acc'
    )
  `, [canonicalEventId]);

  await db.query(`
    UPDATE public.events
    SET publication_status = 'published',
        organizer_id = '55555555-0000-0000-0000-000000000001',
        verification_status = 'current',
        short_description = 'A premier robotics hackathon in SF',
        source_updated_at = now(),
        last_checked_at = now()
    WHERE id = $1
  `, [canonicalEventId]);

  // 5. Submitter reads list again -> published_event_slug dynamically resolves!
  userList = await listUserSubmissions(clientA);
  userSub = userList.items.find((item) => item.id === sub.value.id);
  assert.ok(userSub);
  assert.equal(userSub.publishedEventSlug, "awesome-robotics-hackathon-2026");
});

test("Community Submissions: Admin acceptance transaction rolls back cleanly on error", async () => {
  const clientA = createTestClient("authenticated", USER_A);
  const adminClient = createTestClient("authenticated", ADMIN);

  const sub = await submitOpportunity(clientA, {
    title: "Rollback Test Hackathon",
    organizerName: "Test Org",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/rollback",
    submitterRelationship: "participant",
  });
  assert.equal(sub.ok, true);
  if (!sub.ok) return;

  // Attempt acceptance with an invalid/unsupported event action that causes mutate_event to fail
  const failedAccept = await acceptSubmission(
    adminClient,
    sub.value.id,
    sub.value.version,
    {
      action: "invalid_action_causes_error",
      reason: "Will fail",
      event: { title: "Bad", slug: "bad" },
    }
  );

  assert.equal(failedAccept.ok, false);

  // Verify atomic rollback: submission remains in 'submitted' status with original version
  const detail = await getAdminSubmission(adminClient, sub.value.id);
  assert.ok(detail);
  assert.equal(detail.submission.status, "submitted");
  assert.equal(detail.submission.version, sub.value.version);
  assert.equal(detail.moderation.canonical_event_id, null);

  // Verify no orphaned moderation event was committed
  const history = await getAdminSubmissionHistory(adminClient, sub.value.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].action, "submitted");
});

test("Community Submissions: Admin queue status filtering", async () => {
  const clientA = createTestClient("authenticated", USER_A);
  const adminClient = createTestClient("authenticated", ADMIN);

  const sub = await submitOpportunity(clientA, {
    title: "Queue Filter Test",
    organizerName: "Filter Org",
    categorySlug: "hackathon",
    mode: "online",
    officialUrl: "https://example.test/filter",
    submitterRelationship: "participant",
  });
  assert.equal(sub.ok, true);
  if (!sub.ok) return;

  // Filter for 'submitted' -> should include sub
  const submittedQueue = await listAdminSubmissions(adminClient, { status: "submitted" });
  assert.ok(submittedQueue.items.some((item) => item.id === sub.value.id));

  // Filter for 'accepted' -> should NOT include sub
  const acceptedQueue = await listAdminSubmissions(adminClient, { status: "accepted" });
  assert.equal(acceptedQueue.items.some((item) => item.id === sub.value.id), false);
});
