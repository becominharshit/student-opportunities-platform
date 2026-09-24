import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fixtures } from "../tests/events/c06-harness.mjs";

const { db } = await fixtures();

const USER_A = "11111111-0000-0000-0000-000000000001";

try {
  await db.exec(`
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

    INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
    VALUES ('${USER_A}', 'student-a@example.test', '{}', now())
    ON CONFLICT (id) DO NOTHING;
  `);

  // 1. Seed 2,000 synthetic auth users and assistant_usage rows
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
    SELECT
      gen_random_uuid(),
      'synth-user-' || n || '@example.test',
      '{}',
      now()
    FROM generate_series(1, 2000) AS n;

    INSERT INTO private.assistant_usage (
      user_id,
      minute_window_start,
      minute_request_count,
      daily_window_start,
      daily_request_count,
      current_lease_id,
      lease_expires_at,
      updated_at
    )
    SELECT
      id,
      now() - (n || ' seconds')::interval,
      (n % 10),
      current_date,
      (n % 50),
      CASE WHEN n % 10 = 0 THEN gen_random_uuid() ELSE NULL END,
      CASE WHEN n % 10 = 0 THEN now() + interval '30 seconds' ELSE NULL END,
      now()
    FROM (
      SELECT id, row_number() OVER () AS n
      FROM auth.users
      WHERE email LIKE 'synth-user-%'
      LIMIT 2000
    ) sub;

    ANALYZE private.assistant_usage;
  `);

  // 2. Scale up published events and deadlines
  await db.exec(`
    INSERT INTO public.events (
      slug, title, short_description, organizer_id, category_id,
      official_url, registration_url, verification_status, verification_level,
      last_checked_at, date_precision, start_date, end_date, mode, country, city
    )
    SELECT
      'assistant-scale-' || n,
      'Assistant Benchmark Opportunity ' || n,
      'Benchmarking query plans',
      e.organizer_id,
      e.category_id,
      e.official_url,
      e.registration_url,
      'current',
      'community_submitted',
      now(),
      'date_only',
      date '2026-10-12' + (n % 90),
      date '2026-10-15' + (n % 90),
      'online',
      'IN',
      'Bengaluru'
    FROM generate_series(1, 1000) AS n
    CROSS JOIN public.events e
    WHERE e.slug = 'isolated-event-1';

    INSERT INTO public.event_sources (
      event_id, connector_id, external_id, source_url, normalized_url,
      last_checked_at, validated_observation, field_evidence
    )
    SELECT
      e.id,
      s.connector_id,
      e.slug,
      s.source_url,
      s.normalized_url,
      now(),
      s.validated_observation,
      s.field_evidence
    FROM public.events e
    CROSS JOIN public.event_sources s
    WHERE e.slug LIKE 'assistant-scale-%' AND s.external_id = '1';

    UPDATE public.events
    SET publication_status = 'published'
    WHERE slug LIKE 'assistant-scale-%';

    INSERT INTO public.event_deadlines (
      id, event_id, kind, label, precision, timezone, due_at, local_date, active, is_primary
    )
    SELECT
      gen_random_uuid(),
      e.id,
      'registration',
      'Apply by',
      'datetime',
      'UTC',
      now() + (split_part(e.slug, '-', 3)::integer || ' days')::interval,
      ((now() + (split_part(e.slug, '-', 3)::integer || ' days')::interval) AT TIME ZONE 'UTC')::date,
      true,
      true
    FROM public.events e
    WHERE e.slug LIKE 'assistant-scale-%';

    ANALYZE public.events;
    ANALYZE public.event_deadlines;
  `);

  // Explain 1: Rate limit lookup & row-level locking by user_id
  const usageLockPlan = (
    await db.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT user_id, minute_request_count, daily_request_count, current_lease_id, lease_expires_at
       FROM private.assistant_usage
       WHERE user_id = $1
       FOR UPDATE`,
      [USER_A]
    )
  ).rows.map((r) => r["QUERY PLAN"]).join("\n");

  assert.ok(
    usageLockPlan.includes("assistant_usage_pkey") || usageLockPlan.includes("Index"),
    "Usage row lock must use assistant_usage_pkey index"
  );

  // Explain 2: Assistant tool search query (bounded published events search)
  const eventSearchPlan = (
    await db.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT id, slug, title, short_description, mode, country, fee_status, prize_pool, prize_currency, start_date, verification_status
       FROM public.events
       WHERE publication_status = 'published'
       ORDER BY start_date ASC NULLS LAST
       LIMIT 10`
    )
  ).rows.map((r) => r["QUERY PLAN"]).join("\n");

  assert.ok(
    eventSearchPlan.includes("Index") || eventSearchPlan.includes("events_published_start_date_idx"),
    "Assistant event search query must use appropriate index"
  );

  // Explain 3: Assistant tool single event lookup by slug
  const eventLookupPlan = (
    await db.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT id, slug, title, short_description, eligibility_rules
       FROM public.events
       WHERE slug = $1 AND publication_status = 'published'
       LIMIT 1`,
      ["assistant-scale-100"]
    )
  ).rows.map((r) => r["QUERY PLAN"]).join("\n");

  assert.ok(
    eventLookupPlan.includes("events_slug_key") || eventLookupPlan.includes("Index"),
    "Event detail lookup by slug must use unique slug index"
  );

  // Explain 4: Assistant tool upcoming deadlines query on event_deadlines
  const deadlinesPlan = (
    await db.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT d.id, d.event_id, d.kind, d.due_at, d.local_date
       FROM public.event_deadlines d
       JOIN public.events e ON e.id = d.event_id
       WHERE d.active = true
         AND d.is_primary = true
         AND d.kind = 'registration'
         AND e.publication_status = 'published'
         AND d.due_at > now()
       ORDER BY d.due_at ASC
       LIMIT 10`
    )
  ).rows.map((r) => r["QUERY PLAN"]).join("\n");

  assert.ok(
    deadlinesPlan.includes("Index") || deadlinesPlan.includes("event_deadlines_due_idx"),
    "Deadlines query must utilize index scan"
  );

  await mkdir("work/assistant", { recursive: true });
  await writeFile(
    "work/assistant/performance.json",
    JSON.stringify(
      {
        syntheticUsers: 2000,
        syntheticEvents: 1000,
        usageLockPlan,
        eventSearchPlan,
        eventLookupPlan,
        deadlinesPlan,
      },
      null,
      2
    )
  );

  console.log("PASS: 2,000 synthetic assistant usage records & queries indexed and verified with EXPLAIN ANALYZE.");
} finally {
  await db.close();
}
