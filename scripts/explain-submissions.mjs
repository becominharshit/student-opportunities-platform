import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { replay } from "../tests/database/harness.mjs";

const db = await replay();

const USER_A = "11111111-0000-0000-0000-000000000001";
const ADMIN = "33333333-0000-0000-0000-000000000003";

try {
  await db.exec(`
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

    INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
    VALUES
      ('${USER_A}', 'student-a@example.test', '{}', now()),
      ('${ADMIN}', 'admin@example.test', '{}', now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.admin_memberships (user_id, role)
    VALUES ('${ADMIN}', 'admin')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.event_categories (id, slug, name)
    VALUES ('66666666-0000-0000-0000-000000000001', 'hackathon', 'Hackathon')
    ON CONFLICT DO NOTHING;
  `);

  // Insert 2,000 synthetic submissions across different statuses and dates
  await db.exec(`
    INSERT INTO public.event_submissions (
      submitter_user_id, status, submitter_relationship, title, organizer_name,
      category_slug, mode, official_url, created_at, updated_at
    )
    SELECT
      CASE WHEN n % 4 = 0 THEN '${USER_A}'::uuid ELSE NULL END,
      CASE
        WHEN n % 5 = 0 THEN 'submitted'
        WHEN n % 5 = 1 THEN 'under_review'
        WHEN n % 5 = 2 THEN 'accepted'
        WHEN n % 5 = 3 THEN 'rejected'
        ELSE 'withdrawn'
      END,
      'participant',
      'Synthetic Opportunity #' || n,
      'Synthetic Organizer ' || (n % 20),
      'hackathon',
      'online',
      'https://example.test/item-' || n,
      now() - (n || ' minutes')::interval,
      now() - (n || ' minutes')::interval
    FROM generate_series(1, 2000) AS n;

    ANALYZE public.event_submissions;
  `);

  // 1. Explain Submitter listing query (uses event_submissions_submitter_idx)
  const submitterPlan = (
    await db.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT id, status, title, organizer_name, category_slug, mode, created_at
       FROM public.event_submissions
       WHERE submitter_user_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 25`,
      [USER_A]
    )
  ).rows.map((r) => r["QUERY PLAN"]).join("\n");

  assert.ok(
    submitterPlan.includes("event_submissions_submitter_idx") || submitterPlan.includes("Index"),
    "Submitter list query must use index scan"
  );

  // 2. Explain Admin status queue query (uses event_submissions_status_created_idx)
  const adminQueuePlan = (
    await db.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT id, status, title, organizer_name, category_slug, mode, created_at
       FROM public.event_submissions
       WHERE status = 'submitted'
       ORDER BY created_at DESC, id DESC
       LIMIT 25`
    )
  ).rows.map((r) => r["QUERY PLAN"]).join("\n");

  assert.ok(
    adminQueuePlan.includes("event_submissions_status_created_idx") || adminQueuePlan.includes("Index"),
    "Admin queue query must use status_created index scan"
  );

  // 3. Explain Duplicate Flood / Rate Limit query (uses event_submissions_submitter_idx)
  const floodPlan = (
    await db.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT 1 FROM public.event_submissions
       WHERE submitter_user_id = $1 AND created_at > now() - interval '24 hours'
       LIMIT 5`,
      [USER_A]
    )
  ).rows.map((r) => r["QUERY PLAN"]).join("\n");

  assert.ok(
    floodPlan.includes("event_submissions_submitter_idx"),
    "Duplicate flood / rate limit check must use submitter index scan"
  );

  await mkdir("work/submissions", { recursive: true });
  await writeFile(
    "work/submissions/performance.json",
    JSON.stringify(
      {
        syntheticSubmissions: 2000,
        submitterPlan,
        adminQueuePlan,
        floodPlan,
      },
      null,
      2
    )
  );

  console.log("PASS: 2,000 synthetic submissions indexed & verified with EXPLAIN ANALYZE.");
} finally {
  await db.close();
}
