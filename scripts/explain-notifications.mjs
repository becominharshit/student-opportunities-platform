import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { replay } from "../tests/database/harness.mjs";

const db = await replay();

const USER_A = "11111111-0000-0000-0000-000000000001";
const EVENT_A = "22222222-0000-0000-0000-000000000001";

try {
  await db.exec(`
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

    INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
    VALUES ('${USER_A}', 'student-a@example.test', '{}', now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.events (id, slug, title)
    VALUES ('${EVENT_A}', 'perf-event-1', 'Performance Event')
    ON CONFLICT (id) DO NOTHING;
  `);

  // Insert 5,000 notifications for USER_A (mix of read and unread)
  await db.exec(`
    INSERT INTO public.notifications (
      user_id, event_id, type, title, body, idempotency_key, in_app_visible, read_at, created_at
    )
    SELECT
      '${USER_A}',
      '${EVENT_A}',
      'deadline_approaching',
      'Reminder #' || n,
      'Registration closing soon for item ' || n,
      'perf-notif-' || n,
      true,
      CASE WHEN n % 5 = 0 THEN now() - interval '1 hour' ELSE null END,
      now() - (n || ' seconds')::interval
    FROM generate_series(1, 5000) AS n;

    ANALYZE public.notifications;
  `);

  // 1. Explain unread count (partial index notifications_user_unread_idx)
  const unreadPlan = (
    await db.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT count(*)::int AS count
       FROM public.notifications
       WHERE user_id = $1 AND in_app_visible = true AND read_at IS NULL`,
      [USER_A]
    )
  ).rows.map((r) => r["QUERY PLAN"]).join("\n");

  assert.ok(
    unreadPlan.includes("notifications_user_unread_idx") || unreadPlan.includes("Index"),
    "Unread count query must use index scan"
  );

  // 2. Explain keyset list query (partial index notifications_user_list_idx)
  const listPlan = (
    await db.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT id, type, title, body, action_url, in_app_visible, read_at, created_at, event_id
       FROM public.notifications
       WHERE user_id = $1 AND in_app_visible = true
       ORDER BY created_at DESC, id DESC
       LIMIT 25`,
      [USER_A]
    )
  ).rows.map((r) => r["QUERY PLAN"]).join("\n");

  assert.ok(
    listPlan.includes("notifications_user_list_idx") || listPlan.includes("Index"),
    "Notification listing query must use index scan"
  );

  await mkdir("work/notifications", { recursive: true });
  await writeFile(
    "work/notifications/performance.json",
    JSON.stringify(
      {
        syntheticNotifications: 5000,
        unreadPlan,
        listPlan,
      },
      null,
      2
    )
  );

  console.log("PASS: 5,000 synthetic notifications indexed & verified with EXPLAIN ANALYZE.");
} finally {
  await db.close();
}
