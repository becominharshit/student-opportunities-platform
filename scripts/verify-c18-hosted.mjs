// C18 hosted authorization, RLS negative checks, and empty-catalogue verification; no hosted event fixtures.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
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

const ids = [];
const checks = [];
const run = randomUUID();
let before, after, success = false, cleaned = true;

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
  before = await inventory();
  check(before.events === 0, 'genuine hosted event inventory empty; no event writes');

  // 1. Anonymous RLS negative checks
  const anonMemberships = await anon.from('admin_memberships').select('*');
  check(!!anonMemberships.error || anonMemberships.data.length === 0, 'anonymous cannot read admin_memberships');

  const anonChanges = await anon.from('event_changes').select('*');
  check(!!anonChanges.error || anonChanges.data.length === 0, 'anonymous cannot read event_changes');

  const anonRpc = await anon.rpc('mutate_event', {
    command: { action: 'create', reason: 'Anonymous probe', event: { title: 'Probe', slug: 'probe' } },
  });
  check(!!anonRpc.error, 'anonymous mutate_event RPC is strictly rejected');

  // 2. Temporary Ordinary User Creation & RLS Checks
  const email = `c18-temporary-${run}@example.invalid`;
  const password = randomBytes(32).toString('base64url') + 'Aa1!';
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  check(!created.error && created.data.user?.id, 'exact temporary ordinary account created');
  const tempUserId = created.data.user.id;
  ids.push(tempUserId);

  const userClient = createClient(base, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
  const signInRes = await userClient.auth.signInWithPassword({ email, password });
  check(!signInRes.error, 'temporary ordinary session authenticated');

  // Verify non-admin cannot read admin_memberships
  const userMemberships = await userClient.from('admin_memberships').select('*');
  check(!userMemberships.error && userMemberships.data.length === 0, 'non-admin cannot read admin memberships');

  // Verify non-admin cannot mutate_event
  const userRpc = await userClient.rpc('mutate_event', {
    command: { action: 'create', reason: 'Ordinary user probe', event: { title: 'Probe', slug: 'probe' } },
  });
  check(!!userRpc.error && (userRpc.error.code === 'P0503' || userRpc.error.message.includes('forbidden')), 'non-admin mutate_event RPC rejected with forbidden error');

  // Verify non-admin cannot read duplicate_reviews
  const userDups = await userClient.from('duplicate_reviews').select('*');
  check(!!userDups.error || userDups.data.length === 0, 'non-admin cannot read duplicate_reviews');

  success = true;
} catch (e) {
  console.error(e instanceof Error && e.message.startsWith('FAIL:') ? e.message : 'FAIL: C18 hosted verification; sensitive exception details suppressed.');
  process.exitCode = 1;
} finally {
  // Cleanup temporary accounts and check inventory
  for (const id of ids) {
    try {
      if ((await service.auth.admin.deleteUser(id)).error) cleaned = false;
      if ((await service.auth.admin.getUserById(id)).error?.status !== 404) cleaned = false;
      for (const table of ['profiles', 'saved_events', 'user_interests', 'user_skills', 'admin_memberships']) {
        const r = await service.from(table).select('user_id').eq('user_id', id);
        if (r.error || r.data.length) cleaned = false;
      }
    } catch {
      cleaned = false;
    }
  }

  try {
    after = await inventory();
    if (before && JSON.stringify(before) !== JSON.stringify(after)) cleaned = false;
  } catch {
    cleaned = false;
  }

  console.log(cleaned ? 'PASS: exact temporary accounts/dependents removed; inventories unchanged.' : 'FAIL: fixture cleanup requires attention.');
  if (!cleaned) process.exitCode = 1;

  await mkdir('work/c18', { recursive: true });
  await writeFile(
    'work/c18/hosted-results.json',
    JSON.stringify(
      {
        run,
        ids,
        checks,
        before,
        after,
        success: success && cleaned,
        cleaned,
        path: 'hosted authorization, empty catalogue, and negative RLS verification',
        checkedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}
