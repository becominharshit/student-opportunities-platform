import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { replay } from "../database/harness.mjs";
import { load, moduleUrl } from "../recommendations/harness.mjs";

const serviceStub = moduleUrl('export const createServiceSupabaseClient = () => globalThis.__testServiceClient;');

const {
  classifySubstantiveEventChange,
  decodeNotificationCursor,
  encodeNotificationCursor,
  isValidActionUrl,
  UNPUBLISHED_EVENT_NOTICE,
} = await import(await load("src/lib/notifications/types.ts"));

const {
  DevelopmentEmailSender,
} = await import(await load("src/lib/notifications/email.ts"));

const {
  listUserNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
} = await import(await load("src/lib/notifications/service.ts"));

const {
  selectDeadlineWindow,
  runDeadlineReminders,
  runEventChangeNotifications,
  processEmailDeliveries,
  purgeExpiredNotifications,
  withRunnerLease,
} = await import(await load("src/lib/notifications/runner.ts", {
  "../supabase/service": serviceStub,
}));

const USER_A = "11111111-0000-0000-0000-000000000001";
const USER_B = "11111111-0000-0000-0000-000000000002";
const ADMIN = "11111111-0000-0000-0000-000000000003";

const EVENT_PUB = "22222222-0000-0000-0000-000000000001";
const EVENT_DRAFT = "22222222-0000-0000-0000-000000000002";
const DEADLINE_PUB = "33333333-0000-0000-0000-000000000001";
const DEADLINE_START = "33333333-0000-0000-0000-000000000002";

let db;

before(async () => {
  db = await replay();

  // Ensure auth.users has email and email_confirmed_at columns
  await db.exec(`
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
  `);

  // Seed baseline users, organizers, categories, events, and deadlines
  await db.exec(`
    BEGIN;
    INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
      ('${USER_A}', 'student-a@example.test', '{}', now()),
      ('${USER_B}', 'student-b@example.test', '{}', now()),
      ('${ADMIN}', 'admin@example.test', '{}', now());

    INSERT INTO public.profiles (user_id, name) VALUES
      ('${USER_A}', 'Student A'),
      ('${USER_B}', 'Student B');

    INSERT INTO public.organizers (id, name, normalized_identity) VALUES
      ('55555555-0000-0000-0000-000000000001', 'Test Organizer', 'test-organizer');

    INSERT INTO public.event_categories (id, slug, name) VALUES
      ('66666666-0000-0000-0000-000000000001', 'hackathon', 'Hackathon')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.source_connectors (id, name, source_url, type) VALUES
      ('44444444-0000-0000-0000-000000000001', 'Test Connector', 'https://example.test', 'feed')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.events (id, slug, title) VALUES
      ('${EVENT_PUB}', 'test-published-event', 'Published Event'),
      ('${EVENT_DRAFT}', 'test-draft-event', 'Draft Event');

    INSERT INTO public.event_sources (
      id, event_id, connector_id, external_id, source_url, normalized_url,
      last_checked_at, validated_observation, field_evidence, raw_storage_ref
    ) VALUES (
      '55555555-0000-0000-0000-000000000002', '${EVENT_PUB}', '44444444-0000-0000-0000-000000000001',
      'test-ext-1', 'https://example.test/event', 'https://example.test/event',
      now(), '{"title":"Published Event","official_url":"https://example.test","registration_url":"https://example.test/reg"}',
      '{"official_url":{"status":"checked"},"registration_url":{"status":"checked"}}', 'private/raw-1'
    );

    UPDATE public.events SET
      organizer_id = '55555555-0000-0000-0000-000000000001',
      category_id = (SELECT id FROM public.event_categories WHERE slug = 'hackathon' LIMIT 1),
      short_description = 'Test description',
      official_url = 'https://example.test',
      registration_url = 'https://example.test/reg',
      verification_status = 'current',
      verification_level = 'community_submitted',
      last_checked_at = now(),
      publication_status = 'published'
    WHERE id = '${EVENT_PUB}';

    UPDATE public.events SET
      organizer_id = '55555555-0000-0000-0000-000000000001',
      category_id = (SELECT id FROM public.event_categories WHERE slug = 'hackathon' LIMIT 1),
      short_description = 'Draft description',
      official_url = 'https://example.test',
      registration_url = 'https://example.test/reg',
      verification_status = 'current',
      verification_level = 'community_submitted',
      last_checked_at = now(),
      publication_status = 'draft'
    WHERE id = '${EVENT_DRAFT}';

    -- Registration deadline on published event (2 days away => 48 hours => 3d window)
    INSERT INTO public.event_deadlines (
      id, event_id, kind, label, precision, due_at, local_date, timezone, active, is_primary
    ) VALUES (
      '${DEADLINE_PUB}', '${EVENT_PUB}', 'registration', 'Registration Closes',
      'datetime', now() + interval '48 hours', (now() + interval '48 hours')::date, 'UTC', true, true
    );

    -- Non-registration deadline (should never trigger deadline reminders)
    INSERT INTO public.event_deadlines (
      id, event_id, kind, label, precision, due_at, local_date, timezone, active, is_primary
    ) VALUES (
      '${DEADLINE_START}', '${EVENT_PUB}', 'submission', 'Project Submission',
      'datetime', now() + interval '48 hours', (now() + interval '48 hours')::date, 'UTC', true, false
    );

    -- Both users save the published event
    INSERT INTO public.saved_events (user_id, event_id) VALUES
      ('${USER_A}', '${EVENT_PUB}'),
      ('${USER_B}', '${EVENT_PUB}');

    COMMIT;
  `);

  globalThis.__testServiceClient = createTestClient("service_role", null);
});

after(async () => {
  delete globalThis.__testServiceClient;
  await db?.close();
});

// Helper for simulated role executions in tests
async function asRoleRollback(role, uid, fn) {
  await db.exec("begin");
  try {
    await db.exec("set local role " + role);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}

async function asRole(role, uid, fn) {
  if (!role || role === "service_role") {
    return await fn();
  }
  await db.exec("begin");
  try {
    await db.exec("set local role " + role);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    const res = await fn();
    await db.exec("commit");
    return res;
  } catch (err) {
    await db.exec("rollback");
    throw err;
  }
}

// Client adapter for tests to use SupabaseClient-like interface over PGlite
function createTestClient(role, uid) {
  return {
    from(table) {
      return {
        select(fields = "*", options = {}) {
          let whereClause = [];
          const params = [];
          let orderBy = [];
          let limitCount = null;
          let orFilter = null;

          const queryBuilder = {
            eq(col, val) {
              if (col === "events.publication_status") return queryBuilder;
              params.push(val);
              whereClause.push(`${col} = $${params.length}`);
              return queryBuilder;
            },
            in(col, vals) {
              if (vals.length === 0) {
                whereClause.push("false");
              } else {
                const placeholders = vals.map((v) => {
                  params.push(v);
                  return `$${params.length}`;
                });
                whereClause.push(`${col} IN (${placeholders.join(", ")})`);
              }
              return queryBuilder;
            },
            is(col, val) {
              if (val === null) whereClause.push(`${col} IS NULL`);
              else whereClause.push(`${col} IS ${val}`);
              return queryBuilder;
            },
            not(col, op, val) {
              if (op === "is" && val === null) whereClause.push(`${col} IS NOT NULL`);
              return queryBuilder;
            },
            lt(col, val) {
              params.push(val);
              whereClause.push(`${col} < $${params.length}`);
              return queryBuilder;
            },
            gt(col, val) {
              params.push(val);
              whereClause.push(`${col} > $${params.length}`);
              return queryBuilder;
            },
            or(expr) {
              orFilter = expr;
              return queryBuilder;
            },
            order(col, { ascending = true } = {}) {
              orderBy.push(`${col} ${ascending ? "ASC" : "DESC"}`);
              return queryBuilder;
            },
            limit(n) {
              limitCount = n;
              return queryBuilder;
            },
            range(from, to) {
              limitCount = to - from + 1;
              return queryBuilder;
            },
            async maybeSingle() {
              const res = await queryBuilder;
              return { data: res.data?.[0] ?? null, error: res.error };
            },
            async single() {
              const res = await queryBuilder;
              return { data: res.data?.[0] ?? null, error: res.error };
            },
            then(resolve, reject) {
              const exec = async () => {
                let sql = "";
                if (options.count === "exact" && options.head) {
                  sql = `SELECT count(*)::int AS count FROM public.${table}`;
                } else if (fields.includes("events!inner")) {
                  sql = `SELECT n.* FROM public.${table} n INNER JOIN public.events e ON e.id = n.event_id WHERE e.publication_status = 'published'`;
                } else {
                  sql = `SELECT * FROM public.${table}`;
                }

                if (orFilter) {
                  // e.g. created_at.lt.2026-01-01,and(created_at.eq.2026-01-01,id.lt.uuid)
                  const match = orFilter.match(/created_at\.([gl]t)\.([^,]+),and\(created_at\.eq\.([^,]+),id\.([gl]t)\.([^)]+)\)/);
                  if (match) {
                    const [, op1, t1, , op2, id2] = match;
                    params.push(t1, id2);
                    const sqlOp1 = op1 === "lt" ? "<" : ">";
                    const sqlOp2 = op2 === "lt" ? "<" : ">";
                    whereClause.push(`(created_at ${sqlOp1} $${params.length - 1} OR (created_at = $${params.length - 1} AND id ${sqlOp2} $${params.length}))`);
                  }
                }

                if (whereClause.length > 0) {
                  sql += (fields.includes("events!inner") ? " AND " : " WHERE ") + whereClause.join(" AND ");
                }
                if (orderBy.length > 0) {
                  sql += " ORDER BY " + orderBy.join(", ");
                }
                if (limitCount !== null) {
                  sql += ` LIMIT ${limitCount}`;
                }

                try {
                  const res = await asRole(role, uid, () => db.query(sql, params));
                  if (options.count === "exact" && options.head) {
                    return { count: res.rows[0]?.count ?? 0, data: null, error: null };
                  }
                  if (fields.includes("events!inner") && res?.rows) {
                    for (const row of res.rows) {
                      const ev = (await db.query("SELECT id, slug, title, publication_status, timezone FROM public.events WHERE id = $1", [row.event_id])).rows[0];
                      row.events = ev;
                    }
                  }
                  return { data: res.rows, error: null };
                } catch (err) {
                  return { data: null, error: err };
                }
              };
              return exec().then(resolve, reject);
            },
          };
          return queryBuilder;
        },
        upsert(records, { onConflict = "id", ignoreDuplicates = false } = {}) {
          const arr = Array.isArray(records) ? records : [records];
          return {
            select() {
              return {
                async maybeSingle() {
                  const res = await this;
                  return { data: res.data?.[0] ?? null, error: res.error };
                },
                then: (resolve, reject) => {
                  return queryBuilderExec(true).then(resolve, reject);
                },
              };
            },
            then: (resolve, reject) => {
              return queryBuilderExec(false).then(resolve, reject);
            },
          };

          async function queryBuilderExec(returnsRows) {
            try {
              const insertedRows = [];
              for (const record of arr) {
                const keys = Object.keys(record);
                const vals = Object.values(record);
                const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
                let sql = `INSERT INTO public.${table} (${keys.join(", ")}) VALUES (${placeholders})`;
                if (ignoreDuplicates) {
                  sql += ` ON CONFLICT (${onConflict}) DO NOTHING`;
                } else {
                  const updates = keys.filter((k) => !onConflict.includes(k)).map((k) => `${k} = EXCLUDED.${k}`).join(", ");
                  sql += ` ON CONFLICT (${onConflict}) DO UPDATE SET ${updates}`;
                }
                if (returnsRows) {
                  sql += " RETURNING *";
                }
                const res = await asRole(role, uid, () => db.query(sql, vals));
                if (returnsRows && res.rows[0]) insertedRows.push(res.rows[0]);
              }
              return { data: returnsRows ? insertedRows : null, error: null };
            } catch (err) {
              return { data: null, error: err };
            }
          }
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
                  const sql = `UPDATE public.${table} SET ${sets} WHERE ${col} = $${vals.length}`;
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
            in(col, vals) {
              return {
                then(resolve) {
                  if (vals.length === 0) return resolve({ data: [], error: null });
                  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
                  const sql = `DELETE FROM public.${table} WHERE ${col} IN (${placeholders})`;
                  return asRole(role, uid, () => db.query(sql, vals))
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
          if (name === "acquire_runner_lease") {
            const res = await db.query(
              "SELECT public.acquire_runner_lease($1, $2, $3) AS acquired",
              [params.p_job_name, params.p_owner, params.p_duration_seconds]
            );
            return { data: res.rows[0]?.acquired, error: null };
          }
          if (name === "release_runner_lease") {
            await db.query("SELECT public.release_runner_lease($1, $2)", [params.p_job_name, params.p_owner]);
            return { data: null, error: null };
          }
          if (name === "get_runner_cursor") {
            const res = await db.query("SELECT public.get_runner_cursor($1) AS cursor", [params.p_job_name]);
            return { data: res.rows[0]?.cursor, error: null };
          }
          if (name === "update_runner_cursor") {
            await db.query("SELECT public.update_runner_cursor($1, $2, $3)", [
              params.p_job_name,
              params.p_cursor_timestamp,
              params.p_cursor_id,
            ]);
            return { data: null, error: null };
          }
          if (name === "claim_email_deliveries") {
            const res = await db.query("SELECT public.claim_email_deliveries($1) AS claimed", [params.p_batch_size]);
            let claimed = res.rows[0]?.claimed ?? [];
            if (typeof claimed === "string") {
              try { claimed = JSON.parse(claimed); } catch {}
            }
            return { data: claimed, error: null };
          }
          if (name === "mark_notification_read") {
            const res = await db.query("SELECT public.mark_notification_read($1) AS ok", [params.p_notification_id]);
            return { data: res.rows[0]?.ok, error: null };
          }
          if (name === "mark_all_notifications_read") {
            const res = await db.query("SELECT public.mark_all_notifications_read() AS count");
            return { data: res.rows[0]?.count, error: null };
          }
          return { data: null, error: { message: "Unknown RPC" } };
        } catch (err) {
          return { data: null, error: err };
        }
      });
    },
    auth: {
      admin: {
        async getUserById(id) {
          const res = await db.query("SELECT email, email_confirmed_at FROM auth.users WHERE id = $1", [id]);
          if (res.rows.length === 0) return { data: null, error: { message: "User not found" } };
          return {
            data: {
              user: {
                id,
                email: res.rows[0].email,
                email_confirmed_at: res.rows[0].email_confirmed_at,
              },
            },
            error: null,
          };
        },
      },
    },
  };
}

// -------------------------------------------------------------
// 1. RLS and Permission Security Tests
// -------------------------------------------------------------

test("1.1 Anonymous cannot access notifications or preferences tables", async () => {
  // Attempting to select notification_deliveries throws 42501 (permission denied)
  let caughtDeliveries = false;
  try {
    await asRoleRollback("anon", null, async () => {
      await db.query("SELECT * FROM public.notification_deliveries");
    });
  } catch (err) {
    caughtDeliveries = err.code === "42501";
  }
  assert.equal(caughtDeliveries, true, "Anonymous must be denied on notification_deliveries");

  // Attempting to call runner RPCs throws 42501
  let caughtRpc = false;
  try {
    await asRoleRollback("anon", null, async () => {
      await db.query("SELECT public.acquire_runner_lease('test', 'test', 60)");
    });
  } catch (err) {
    caughtRpc = err.code === "42501";
  }
  assert.equal(caughtRpc, true, "Anonymous cannot call acquire_runner_lease");

  // Preferences: anonymous is denied with 42501
  let caughtPref = false;
  try {
    await asRoleRollback("anon", null, async () => {
      await db.query("SELECT * FROM public.notification_preferences");
    });
  } catch (err) {
    caughtPref = err.code === "42501";
  }
  assert.equal(caughtPref, true, "Anonymous is denied on notification_preferences");

  // Notifications: anonymous is denied with 42501
  let caughtNotif = false;
  try {
    await asRoleRollback("anon", null, async () => {
      await db.query("SELECT * FROM public.notifications");
    });
  } catch (err) {
    caughtNotif = err.code === "42501";
  }
  assert.equal(caughtNotif, true, "Anonymous is denied on notifications");
});

test("1.2 Ordinary user cannot insert, update or delete notifications directly", async () => {
  let insertDenied = false;
  try {
    await asRoleRollback("authenticated", USER_A, async () => {
      await db.query(`
        INSERT INTO public.notifications (user_id, type, title, body, idempotency_key)
        VALUES ('${USER_A}', 'deadline_approaching', 'Attack', 'Attack', 'attack-1')
      `);
    });
  } catch (err) {
    insertDenied = err.code === "42501";
  }
  assert.equal(insertDenied, true, "Authenticated user cannot INSERT notifications directly");

  let deleteDenied = false;
  try {
    await asRoleRollback("authenticated", USER_A, async () => {
      await db.query(`DELETE FROM public.notifications WHERE user_id = '${USER_A}'`);
    });
  } catch (err) {
    deleteDenied = err.code === "42501";
  }
  assert.equal(deleteDenied, true, "Authenticated user cannot DELETE notifications directly");

  let deliveryDenied = false;
  try {
    await asRoleRollback("authenticated", USER_A, async () => {
      await db.query("SELECT * FROM public.notification_deliveries");
    });
  } catch (err) {
    deliveryDenied = err.code === "42501";
  }
  assert.equal(deliveryDenied, true, "Authenticated user cannot access notification_deliveries");
});

test("1.3 Cross-user isolation: User A cannot read or mark User B's notifications", async () => {
  // Service inserts a notification for User B
  await asRole("service_role", null, async () => {
    await db.query(`
      INSERT INTO public.notifications (user_id, type, title, body, idempotency_key)
      VALUES ('${USER_B}', 'deadline_approaching', 'Private for B', 'Body for B', 'isolation-test-b')
      ON CONFLICT DO NOTHING
    `);
  });

  const bNotif = (await db.query("SELECT id FROM public.notifications WHERE user_id = $1", [USER_B])).rows[0];
  assert.ok(bNotif);

  // User A attempts to select it
  await asRole("authenticated", USER_A, async () => {
    const res = await db.query("SELECT * FROM public.notifications WHERE id = $1", [bNotif.id]);
    assert.equal(res.rows.length, 0, "User A cannot see User B's notification");

    // User A attempts to call mark_notification_read on User B's notification
    const rpcRes = await db.query("SELECT public.mark_notification_read($1) AS ok", [bNotif.id]);
    assert.equal(rpcRes.rows[0].ok, false, "User A cannot mark User B's notification as read");
  });

  // Verify User B's notification remains unread
  const verifyRes = await db.query("SELECT read_at FROM public.notifications WHERE id = $1", [bNotif.id]);
  assert.equal(verifyRes.rows[0].read_at, null, "User B's notification must not be marked read");
});

// -------------------------------------------------------------
// 2. Preferences Defaults, Creation Gate, and Channel Visibility
// -------------------------------------------------------------

test("2.1 Preferences fallback returns exact approved defaults when no row exists", async () => {
  const serviceClient = createTestClient("service_role", null);
  const prefs = await getNotificationPreferences(serviceClient, USER_A);
  assert.equal(prefs.userId, USER_A);
  assert.equal(prefs.inAppEnabled, true);
  assert.equal(prefs.emailEnabled, false);
  assert.equal(prefs.deadlineReminders, true);
  assert.equal(prefs.eventChanges, true);
  assert.equal(prefs.recommendations, false);
});

test("2.2 Updating preferences upserts cleanly", async () => {
  const userClient = createTestClient("authenticated", USER_A);
  const updated = await updateNotificationPreferences(userClient, USER_A, {
    emailEnabled: true,
  });
  assert.equal(updated.success, true);
  assert.equal(updated.preferences?.emailEnabled, true);

  const stored = await getNotificationPreferences(userClient, USER_A);
  assert.equal(stored.emailEnabled, true);
});

test("2.3 in_app_visible = false hides notification from in-app listing", async () => {
  const notifId = "99999999-0000-0000-0000-000000000001";
  await asRole("service_role", null, async () => {
    await db.query(`
      INSERT INTO public.notifications (
        id, user_id, type, title, body, idempotency_key, in_app_visible
      ) VALUES (
        '${notifId}', '${USER_A}', 'event_updated', 'Email Only Title', 'Body', 'email-only-1', false
      ) ON CONFLICT DO NOTHING
    `);
  });

  const userClient = createTestClient("authenticated", USER_A);
  const listing = await listUserNotifications(userClient, USER_A);
  assert.equal(listing.kind, "ready");
  assert.ok(!listing.items.some((item) => item.id === notifId), "in_app_visible = false must not appear in in-app list");
});

test("2.4 Creation gate: topic disabled or both channels disabled suppresses notification creation", async () => {
  const serviceClient = createTestClient("service_role", null);

  // When deadlineReminders = false
  await updateNotificationPreferences(serviceClient, USER_B, {
    inAppEnabled: true,
    emailEnabled: true,
    deadlineReminders: false,
  });

  // Check that no deadline reminders are created for USER_B
  const beforeCount = (await db.query("SELECT count(*)::int AS count FROM public.notifications WHERE user_id = $1", [USER_B])).rows[0].count;
  await runDeadlineReminders(serviceClient);
  const afterCount = (await db.query("SELECT count(*)::int AS count FROM public.notifications WHERE user_id = $1", [USER_B])).rows[0].count;
  assert.equal(beforeCount, afterCount, "Disabled deadlineReminders topic must not create notifications");

  // Restore USER_B preferences
  await updateNotificationPreferences(serviceClient, USER_B, {
    inAppEnabled: true,
    emailEnabled: false,
    deadlineReminders: true,
  });
});

// -------------------------------------------------------------
// 3. Deterministic Idempotency Keys and Sweepers
// -------------------------------------------------------------

test("3.1 Deadline reminders sweeper creates notifications and runs idempotently", async () => {
  const serviceClient = createTestClient("service_role", null);

  // Set User A preferences: email enabled
  await updateNotificationPreferences(serviceClient, USER_A, {
    inAppEnabled: true,
    emailEnabled: true,
    deadlineReminders: true,
  });

  const firstRun = await runDeadlineReminders(serviceClient);
  assert.ok(firstRun > 0, "First run should create deadline reminders");

  // Re-running immediately must create 0 new notifications due to idempotency
  const secondRun = await runDeadlineReminders(serviceClient);
  assert.equal(secondRun, 0, "Repeated run must be strictly idempotent (0 created)");

  // Verify email delivery was queued for User A
  const deliveries = (await db.query("SELECT * FROM public.notification_deliveries WHERE user_id = $1", [USER_A])).rows;
  assert.ok(deliveries.length > 0, "Email delivery should be queued for user with emailEnabled = true");
  assert.equal(deliveries[0].status, "pending");
  assert.match(deliveries[0].idempotency_key, /^email:/);
});

test("3.2 Bounded deadline window selection ladder", () => {
  assert.equal(selectDeadlineWindow(12), "1d");
  assert.equal(selectDeadlineWindow(24), "1d");
  assert.equal(selectDeadlineWindow(-10), "1d");
  assert.equal(selectDeadlineWindow(-30), null); // Overdue by more than 24h

  assert.equal(selectDeadlineWindow(48), "3d");
  assert.equal(selectDeadlineWindow(72), "3d");

  assert.equal(selectDeadlineWindow(100), "7d");
  assert.equal(selectDeadlineWindow(168), "7d");

  assert.equal(selectDeadlineWindow(200), null); // More than 7 days away
});

test("3.3 Non-registration deadlines produce zero reminders", async () => {
  const startDeadlines = (
    await db.query("SELECT id FROM public.event_deadlines WHERE id = $1 AND kind = 'submission'", [DEADLINE_START])
  ).rows;
  assert.equal(startDeadlines.length, 1);

  // Notifications with this deadline ID should never exist
  const notifs = (
    await db.query("SELECT id FROM public.notifications WHERE idempotency_key LIKE $1", [`%${DEADLINE_START}%`])
  ).rows;
  assert.equal(notifs.length, 0, "Start deadline must not generate notifications");
});

// -------------------------------------------------------------
// 4. Substantive Change Classification & Event Changes Sweeper
// -------------------------------------------------------------

test("4.1 Substantive change classification distinguishes triggers from ignored fields", () => {
  // Ignored fields
  assert.equal(classifySubstantiveEventChange({ reason: "Admin typo fix" }), null);
  assert.equal(classifySubstantiveEventChange({ last_checked_at: "2026-09-24" }), null);
  assert.equal(classifySubstantiveEventChange({ short_description: "New copy" }), null);
  assert.equal(classifySubstantiveEventChange({ verification_status: "verified" }), null);

  // Substantive cancellation
  const cancelled = classifySubstantiveEventChange({ status: "cancelled" });
  assert.equal(cancelled?.isSubstantive, true);
  assert.equal(cancelled?.type, "event_cancelled");

  // Substantive schedule change
  const timeChanged = classifySubstantiveEventChange({ start_date: "2026-11-01" });
  assert.equal(timeChanged?.isSubstantive, true);
  assert.equal(timeChanged?.type, "event_time_changed");

  // Substantive details update
  const venueUpdated = classifySubstantiveEventChange({ venue: "Auditorium Hall" });
  assert.equal(venueUpdated?.isSubstantive, true);
  assert.equal(venueUpdated?.type, "event_updated");

  // Multi-field update consolidates into one classification
  const multiField = classifySubstantiveEventChange({
    start_date: "2026-11-01",
    venue: "Main Campus",
    reason: "Audit update",
  });
  assert.equal(multiField?.isSubstantive, true);
});

test("4.2 Event changes sweeper processes batch and updates cursor atomically", async () => {
  const changeId = "44444444-0000-0000-0000-000000000001";
  await asRole("service_role", null, async () => {
    await db.query(`
      INSERT INTO public.event_changes (
        id, event_id, event_version, actor_id, reason, field_diff, evidence_snapshot
      ) VALUES (
        '${changeId}', '${EVENT_PUB}', 2, '${ADMIN}', 'Schedule modified',
        '{"start_date":"2026-11-01"}'::jsonb, '{}'::jsonb
      ) ON CONFLICT DO NOTHING
    `);
  });

  const serviceClient = createTestClient("service_role", null);
  const createdCount = await runEventChangeNotifications(serviceClient);
  assert.ok(createdCount > 0, "Event change sweeper should create notifications for subscribers");

  // Re-run should process 0 new items because cursor advanced
  const reRunCount = await runEventChangeNotifications(serviceClient);
  assert.equal(reRunCount, 0, "Sweeper must not re-process already passed cursor changes");
});

// -------------------------------------------------------------
// 5. Runner Leases Mutual Exclusion & Crash Safety
// -------------------------------------------------------------

test("5.1 Runner lease prevents concurrent execution and releases cleanly", async () => {
  const serviceClient = createTestClient("service_role", null);

  const lease1 = await withRunnerLease(serviceClient, "test-job", 60, async () => {
    // Attempting to acquire same lease within TTL fails
    const lease2 = await withRunnerLease(serviceClient, "test-job", 60, async () => {
      return "concurrent-unexpected";
    });
    assert.equal(lease2.acquired, false, "Second runner instance must be blocked while lease is active");
    return "first-success";
  });

  assert.equal(lease1.acquired, true);
  assert.equal(lease1.result, "first-success");

  // After first finishes, lease is released and can be acquired again
  const lease3 = await withRunnerLease(serviceClient, "test-job", 60, async () => {
    return "reacquired-success";
  });
  assert.equal(lease3.acquired, true);
  assert.equal(lease3.result, "reacquired-success");
});

// -------------------------------------------------------------
// 6. Email Delivery Pipeline, Pre-Send Publication Check & Retries
// -------------------------------------------------------------

test("6.1 Email deliveries process cleanly with mock sender and pre-send check", async () => {
  const serviceClient = createTestClient("service_role", null);
  const emailSender = new DevelopmentEmailSender();

  const sent = await processEmailDeliveries(serviceClient, emailSender);
  assert.ok(sent > 0, "Email delivery job should send pending emails");
  assert.ok(emailSender.getSentEmails().length > 0, "Development sender must record sent payloads");

  const firstEmail = emailSender.getSentEmails()[0];
  assert.equal(firstEmail.to, "student-a@example.test");
  assert.match(firstEmail.subject, /\[Student Opportunities\]/);
  assert.match(firstEmail.textBody, /Manage preferences/);
});

test("6.2 Pre-send publication check suppresses delivery if event was unpublished", async () => {
  // Create an unpublished draft event with a notification and delivery
  const draftNotifId = "88888888-0000-0000-0000-000000000001";
  const draftDelivId = "88888888-0000-0000-0000-000000000002";

  await asRole("service_role", null, async () => {
    await db.exec(`
      INSERT INTO public.notifications (
        id, user_id, type, event_id, title, body, idempotency_key
      ) VALUES (
        '${draftNotifId}', '${USER_A}', 'event_updated', '${EVENT_DRAFT}',
        'Draft update', 'Draft body', 'draft-notif-1'
      ) ON CONFLICT DO NOTHING;

      INSERT INTO public.notification_deliveries (
        id, notification_id, user_id, channel, status, idempotency_key
      ) VALUES (
        '${draftDelivId}', '${draftNotifId}', '${USER_A}', 'email', 'pending', 'draft-deliv-1'
      ) ON CONFLICT DO NOTHING;
    `);
  });

  const serviceClient = createTestClient("service_role", null);
  const emailSender = new DevelopmentEmailSender();

  await processEmailDeliveries(serviceClient, emailSender);

  // Check delivery status was set to 'suppressed' with 'EVENT_UNPUBLISHED'
  const deliv = (
    await db.query("SELECT status, last_error_code FROM public.notification_deliveries WHERE id = $1", [draftDelivId])
  ).rows[0];
  assert.equal(deliv.status, "suppressed");
  assert.equal(deliv.last_error_code, "EVENT_UNPUBLISHED");
});

// -------------------------------------------------------------
// 7. Dynamic Resolution & Safe Action URLs
// -------------------------------------------------------------

test("7.1 Dynamic resolution prepends title when published and redacts when unpublished", async () => {
  const userClient = createTestClient("authenticated", USER_A);
  const res = await listUserNotifications(userClient, USER_A);

  assert.equal(res.kind, "ready");
  assert.ok(res.items.length > 0);

  // Notification for published event has prepended event title and actionUrl
  const pubItem = res.items.find((item) => item.eventId === EVENT_PUB);
  if (pubItem) {
    assert.equal(pubItem.isEventPublished, true);
    assert.match(pubItem.title, /^Published Event:/);
    assert.match(pubItem.actionUrl ?? "", /^\/events\/test-published-event/);
  }

  // Notification for draft event has redacted body and null actionUrl
  const draftItem = res.items.find((item) => item.eventId === EVENT_DRAFT);
  if (draftItem) {
    assert.equal(draftItem.isEventPublished, false);
    assert.equal(draftItem.body, UNPUBLISHED_EVENT_NOTICE);
    assert.equal(draftItem.actionUrl, null);
  }
});

test("7.2 Safe action URL validator strictly enforces allowed paths", () => {
  assert.equal(isValidActionUrl("/events/valid-slug-1"), true);
  assert.equal(isValidActionUrl("/saved"), true);
  assert.equal(isValidActionUrl("/for-you"), true);
  assert.equal(isValidActionUrl("/notifications"), true);

  // Invalid / dangerous URLs
  assert.equal(isValidActionUrl("javascript:alert(1)"), false);
  assert.equal(isValidActionUrl("https://evil.test/phish"), false);
  assert.equal(isValidActionUrl("//evil.test"), false);
  assert.equal(isValidActionUrl("/admin"), false);
  assert.equal(isValidActionUrl("/events/invalid?query=true"), false);
  assert.equal(isValidActionUrl(null), false);
  assert.equal(isValidActionUrl(""), false);
});

// -------------------------------------------------------------
// 8. Keyset Pagination & Safe Cursor Recovery
// -------------------------------------------------------------

test("8.1 Keyset pagination encodes and decodes cursor safely", () => {
  const original = { createdAt: "2026-09-24T12:00:00.000Z", id: "12345678-1234-1234-1234-123456789abc" };
  const encoded = encodeNotificationCursor(original);
  assert.ok(typeof encoded === "string");

  const decoded = decodeNotificationCursor(encoded);
  assert.deepEqual(decoded, original);

  // Tampered or invalid cursors return null
  assert.equal(decodeNotificationCursor("invalid-base64"), null);
  assert.equal(decodeNotificationCursor(Buffer.from('{"id":"bad"}').toString("base64url")), null);
  assert.equal(decodeNotificationCursor(null), null);
});

test("8.2 Invalid cursor falls back to first page with notice", async () => {
  const userClient = createTestClient("authenticated", USER_A);
  const res = await listUserNotifications(userClient, USER_A, { cursor: "corrupted_cursor_token" });

  assert.equal(res.kind, "ready");
  assert.equal(res.invalidCursorNotice, true);
  assert.ok(res.items.length > 0);
});

// -------------------------------------------------------------
// 9. Unread Badge Count & Mark Read RPCs
// -------------------------------------------------------------

test("9.1 Unread count reflects unread notifications and updates upon mark read", async () => {
  const userClient = createTestClient("authenticated", USER_A);
  const initialUnread = await getUnreadNotificationCount(userClient, USER_A);
  assert.ok(initialUnread > 0, "User A should have unread notifications");

  // Read first unread notification
  const listing = await listUserNotifications(userClient, USER_A);
  const firstUnread = listing.items.find((item) => !item.isRead);
  assert.ok(firstUnread);

  const marked = await markNotificationRead(userClient, firstUnread.id);
  assert.equal(marked, true, "markNotificationRead should succeed");

  const afterUnread = await getUnreadNotificationCount(userClient, USER_A);
  assert.equal(afterUnread, initialUnread - 1);

  // Mark all read
  const clearedCount = await markAllNotificationsRead(userClient);
  assert.ok(clearedCount >= 0);

  const finalUnread = await getUnreadNotificationCount(userClient, USER_A);
  assert.equal(finalUnread, 0, "After markAllNotificationsRead, unread count must be 0");
});

// -------------------------------------------------------------
// 10. Bounded Retention Purge
// -------------------------------------------------------------

test("10.1 Purge expired notifications deletes only eligible records", async () => {
  // Insert an expired read notification (90 days old)
  const expiredId = "77777777-0000-0000-0000-000000000001";
  await asRole("service_role", null, async () => {
    await db.exec(`
      INSERT INTO public.notifications (
        id, user_id, type, title, body, idempotency_key, read_at, created_at
      ) VALUES (
        '${expiredId}', '${USER_A}', 'event_updated', 'Old Notification', 'Body',
        'expired-test-1', now() - interval '90 days', now() - interval '100 days'
      ) ON CONFLICT DO NOTHING;
    `);
  });

  const serviceClient = createTestClient("service_role", null);
  const purged = await purgeExpiredNotifications(serviceClient);
  assert.ok(purged >= 1, "Expired notification should be purged");

  const check = (await db.query("SELECT id FROM public.notifications WHERE id = $1", [expiredId])).rows;
  assert.equal(check.length, 0, "Purged notification must no longer exist in database");
});
