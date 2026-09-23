import { mkdir, writeFile } from 'node:fs/promises';
import { replay } from '../tests/database/harness.mjs';

const db = await replay();
try {
  const ADMIN = "10000000-0000-0000-0000-000000000003";
  const ORG = "50000000-0000-0000-0000-000000000001";
  const CON = "40000000-0000-0000-0000-000000000001";

  await db.exec(`
    insert into auth.users(id) values ('${ADMIN}') on conflict do nothing;
    insert into public.admin_memberships(user_id, role) values ('${ADMIN}', 'admin') on conflict do nothing;
    insert into public.organizers(id, name, normalized_identity) values ('${ORG}', 'Perf Test Org', 'perf-test-org') on conflict do nothing;
    insert into public.source_connectors(id, name, source_url, type) values ('${CON}', 'Perf Connector', 'https://perf.test', 'feed') on conflict do nothing;
  `);

  const categoryId = (await db.query("select id from public.event_categories limit 1")).rows[0].id;

  // Insert 1,200 events initially as draft to satisfy publication triggers
  await db.exec(`
    insert into public.events (
      slug, title, short_description, organizer_id, category_id,
      official_url, registration_url, verification_status, verification_level,
      publication_status, last_checked_at, mode, country, city, date_precision, start_date, end_date
    )
    select
      'c18-perf-' || n,
      'C18 Synthetic Event ' || n,
      'Description for C18 performance evaluation ' || n,
      '${ORG}',
      '${categoryId}',
      'https://example.com/events/' || n,
      'https://example.com/register/' || n,
      case
        when n <= 700 and n % 25 = 0 then 'stale'
        when n <= 700 then 'current'
        when n % 10 = 0 then 'pending'
        when n % 25 = 0 then 'stale'
        else 'current'
      end,
      'community_submitted',
      'draft',
      now(),
      case when n % 2 = 0 then 'online' else 'offline' end,
      'IN',
      'Bengaluru',
      'date_only',
      current_date + (n % 60),
      current_date + (n % 60) + 2
    from generate_series(1, 1200) n;

    insert into public.event_sources (
      event_id, connector_id, external_id, source_url, normalized_url, last_checked_at,
      validated_observation, field_evidence
    )
    select
      e.id,
      '${CON}',
      e.slug,
      e.official_url,
      e.official_url,
      now(),
      jsonb_build_object('official_url', e.official_url, 'registration_url', e.registration_url),
      jsonb_build_object(
        'official_url', jsonb_build_object('status', 'checked'),
        'registration_url', jsonb_build_object('status', 'checked')
      )
    from public.events e;

    update public.events set publication_status = case
      when (split_part(slug, '-', 3)::int) <= 700 then 'published'
      when (split_part(slug, '-', 3)::int) <= 900 then 'draft'
      when (split_part(slug, '-', 3)::int) <= 1050 then 'review'
      when (split_part(slug, '-', 3)::int) <= 1150 then 'unpublished'
      else 'archived'
    end;
  `);

  // Insert event changes (audit rows)
  await db.exec(`
    insert into public.event_changes (event_id, event_version, actor_id, reason, field_diff, evidence_snapshot)
    select id, 1, '${ADMIN}', 'initial seed update', '{"title":{"before":"old","after":"new"}}'::jsonb, '{}'::jsonb
    from public.events limit 100;
  `);

  // Insert duplicate reviews
  await db.exec(`
    insert into public.duplicate_reviews (event_a_id, event_b_id, status, signals)
    select e1.id, e2.id, 'pending', '{"title_similarity": 0.95}'::jsonb
    from (select id from public.events limit 10) e1
    cross join lateral (select id from public.events where id > e1.id limit 1) e2;
  `);

  await db.exec(`
    analyze public.events;
    analyze public.event_changes;
    analyze public.duplicate_reviews;
  `);

  async function runExplain(sql, params = []) {
    const res = await db.query(`explain (analyze, buffers, format text) ${sql}`, params);
    return res.rows.map(r => r['QUERY PLAN']).join('\n');
  }

  const sampleEventId = (await db.query("select id from public.events limit 1")).rows[0].id;

  const plans = {
    count_draft: await runExplain("select count(*) from public.events where publication_status = 'draft'"),
    count_review: await runExplain("select count(*) from public.events where publication_status = 'review'"),
    count_published: await runExplain("select count(*) from public.events where publication_status = 'published'"),
    count_unpublished: await runExplain("select count(*) from public.events where publication_status = 'unpublished'"),
    count_archived: await runExplain("select count(*) from public.events where publication_status = 'archived'"),
    count_verification_attention: await runExplain(
      "select count(*) from public.events where verification_status in ('pending', 'stale', 'conflicted', 'rejected') and publication_status <> 'archived'"
    ),
    count_pending_duplicates: await runExplain("select count(*) from public.duplicate_reviews where status = 'pending'"),
    recent_activity: await runExplain(
      "select c.id, c.event_id, c.event_version, c.reason, c.created_at, e.title from public.event_changes c left join public.events e on e.id = c.event_id order by c.created_at desc limit 5"
    ),
    admin_events_list_filtered: await runExplain(
      "select e.id, e.slug, e.title, e.publication_status, e.verification_status, e.start_date, e.end_date, e.mode, e.version, e.updated_at, c.name as category_name from public.events e left join public.event_categories c on c.id = e.category_id where e.publication_status = 'published' order by e.updated_at desc, e.id desc limit 26 offset 0"
    ),
    duplicate_check_detail: await runExplain(
      "select id, event_a_id, event_b_id, status, signals, created_at from public.duplicate_reviews where status = 'pending' and (event_a_id = $1 or event_b_id = $1)",
      [sampleEventId]
    ),
  };

  await mkdir('work/c18', { recursive: true });
  await writeFile(
    'work/c18/performance.json',
    JSON.stringify(
      {
        syntheticEvents: 1200,
        syntheticChanges: 100,
        syntheticDuplicates: 10,
        plans,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log('--- C18 ADMIN QUERY PERFORMANCE REPORT ---');
  console.log(`Synthetic Events: 1,200 | Synthetic Changes: 100 | Synthetic Duplicates: 10\n`);
  for (const [name, plan] of Object.entries(plans)) {
    console.log(`=== Query: ${name} ===`);
    console.log(plan);
    console.log('');
  }
} finally {
  await db.close();
}
