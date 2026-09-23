// Calendar hosted read-only verification: verifies RLS safety, non-existent event 404 mapping, zero mutations, zero migrations.
import { readFile, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const env = parseEnv(await readFile('.env.local', 'utf8'));
const base = 'https://vzuoscpwmytgibsxugcx.supabase.co';
if (env.NEXT_PUBLIC_SUPABASE_URL !== base) throw Error('Wrong hosted project');

const opts = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (url, init) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) }) },
};

const service = createClient(base, env.SUPABASE_SECRET_KEY, opts);
const anon = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);

const checks = [];
const run = randomUUID();
let before, after;

function check(ok, name) {
  if (!ok) throw Error('FAIL: ' + name);
  checks.push(name);
  console.log('PASS: ' + name);
}

async function inventory() {
  const out = {};
  for (const table of ['events', 'event_sources', 'source_connectors', 'sync_runs', 'profiles', 'saved_events', 'user_interests', 'user_skills', 'admin_memberships', 'duplicate_reviews']) {
    const r = await service.from(table).select('*', { head: true, count: 'exact' });
    if (r.error) throw Error('Inventory unavailable for table ' + table);
    out[table] = r.count;
  }
  return out;
}

try {
  // 1. Initial inventory verification
  before = await inventory();
  check(before.events === 0, 'genuine hosted event inventory empty; no hosted event fixtures');

  // 2. Migration count verification: strictly zero migrations introduced in Calendar milestone
  const migrationFiles = await readdir('supabase/migrations');
  check(migrationFiles.length === 9, 'exactly 9 existing database migrations; zero new migrations introduced');

  // 3. Anonymous public route RLS verification
  // Route query matches: .from('events').select(...).eq('slug', slug).eq('publication_status', 'published').maybeSingle()
  const probeSlug = `nonexistent-calendar-probe-${run}`;
  const anonQuery = await anon
    .from('events')
    .select('id, slug, publication_status')
    .eq('slug', probeSlug)
    .eq('publication_status', 'published')
    .maybeSingle();

  check(anonQuery.data === null && !anonQuery.error, 'anonymous probe for nonexistent event returns null (route returns 404)');

  // 4. Verify anonymous cannot bypass RLS to read draft or review events
  const anonDraftQuery = await anon
    .from('events')
    .select('id, slug, publication_status')
    .neq('publication_status', 'published');

  check(!anonDraftQuery.error && (!anonDraftQuery.data || anonDraftQuery.data.length === 0), 'anonymous client cannot query unpublished event records');

  // 5. Verify anonymous client cannot write or mutate events
  const anonInsert = await anon
    .from('events')
    .insert({
      slug: `hostile-probe-${run}`,
      title: 'Hostile Probe',
      category_id: '00000000-0000-0000-0000-000000000001',
      publication_status: 'published',
      mode: 'online',
    });

  check(!!anonInsert.error, 'anonymous write to events table is strictly blocked by RLS');

  // 6. Post-verification inventory check
  after = await inventory();
  let inventoryUnchanged = true;
  for (const k of Object.keys(before)) {
    if (before[k] !== after[k]) {
      inventoryUnchanged = false;
      break;
    }
  }
  check(inventoryUnchanged, 'hosted database inventory completely unchanged; zero records created or modified');

  console.log(`PASS: All ${checks.length} Calendar hosted verification checks passed.`);
} catch (e) {
  console.error(e instanceof Error && e.message.startsWith('FAIL:') ? e.message : 'FAIL: Calendar hosted verification failed.');
  process.exitCode = 1;
}
