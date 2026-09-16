import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { modules, policy, database, wire, network } from './harness.mjs';

test('abort during reservation does not start DNS or HTTP', async () => {
    const controller = new AbortController();
    const net = network();
    const store = memory({ reserve: async () => { controller.abort(); } });
    await rejectsCode(new BoundedFetcher(store, lease(), controller.signal, net).get(url), 'budget_exceeded');
    assert.equal(net.dns.length + net.calls.length, 0);
});

test('expired host reservation cannot start HTTP', async () => {
    const { store, l } = await setup();
    await store.reserve(l, 'fixture.example.test');
    await h.db.exec("update public.connector_host_budgets set held_until=now()-interval '1 second'");
    await rejectsCode(store.guard(l, 'fixture.example.test'), 'budget_exceeded');
});
test('connector cannot swallow denied access and report successful sync', async () => {
    const { connectorId } = await h.source();
    const c = synthetic(connectorId);
    c.discover = async ctx => {
        try { await ctx.fetch.get(url); } catch {}
        try { await ctx.fetch.get(url); } catch {}
        return { items: [], complete: true };
    };
    const net = network([wire(403)]);
    const result = await modules.runner.collectPage(c, h.store(), new AbortController().signal, net);
    assert.equal(result.status, 'failed');
    assert.equal(net.calls.length, 1);
    assert.equal((await h.db.query('select enabled from public.source_connectors where id=$1', [connectorId])).rows[0].enabled, false);
});
test('invalid reviewed policy closes claimed run without source requests', async () => {
    const { connectorId } = await h.source({ robotsHash: '' });
    await rejectsCode(h.store().claim(connectorId, 'synthetic-v1'), 'permission_denied');
    assert.equal((await h.db.query('select status from public.sync_runs where connector_id=$1', [connectorId])).rows[0].status, 'failed');
});
const { BoundedFetcher, retryAfter } = modules.fetcher;
const { ConnectorError, redact } = modules.errors;
const url = 'https://fixture.example.test/feed';
const lease = (p = policy()) => ({ connectorId: 'fixture', runId: 'fixture', token: 'fixture', fence: 1, policy: p });
function memory(overrides = {}) { return { guard: async () => { }, reserve: async () => { }, defer: async () => { }, releaseHost: async () => { }, ...overrides }; }
function fetchFixture(p = policy(), net = network(), store = memory()) { return { net, fetch: new BoundedFetcher(store, lease(p), new AbortController().signal, net) }; }
async function rejectsCode(promise, code) { await assert.rejects(promise, e => { assert.equal(e.code, code); assert.ok(!e.message.includes('SECRET_SENTINEL')); return true; }); }
test('allowed request returns bounded bytes; DNS address passed to pinned transport', async () => { const { fetch, net } = fetchFixture(); const r = await fetch.get(url); assert.equal(Buffer.from(r.body).toString(), '{}'); assert.equal(net.calls.length, 1); assert.equal(net.calls[0].address, '93.184.216.34'); });
for (const [label, change] of [['disabled', { enabled: false }], ['expired', { expiresAt: '2000-01-01' }], ['conditional', { permission: 'conditionally_approved' }], ['missing evidence', { evidence: '' }], ['missing robots hash', { robotsHash: '' }], ['invalid budget', { maxRetries: 4 }]])
    test(label + ' permission fails before DNS/HTTP', async () => { const { fetch, net } = fetchFixture({ ...policy(), ...change }); await rejectsCode(fetch.get(url), 'permission_denied'); assert.equal(net.dns.length + net.calls.length, 0); });
for (const target of ['https://evil.example.test/feed', 'http://fixture.example.test/feed', 'https://fixture.example.test:444/feed', 'https://user:SECRET_SENTINEL@fixture.example.test/feed', 'https://fixture.example.test/feed?token=SECRET_SENTINEL', 'https://fixture.example.test/%66eed', 'https://fixture.example.test/a/../feed', 'https://fixture.example.test./feed', 'https://127.0.0.1/feed', 'https://2130706433/feed', 'https://[::ffff:127.0.0.1]/feed'])
    test('reject unapproved URL form ' + target.replace('SECRET_SENTINEL', 'REDACTED'), async () => { const { fetch, net } = fetchFixture(); await rejectsCode(fetch.get(target), 'permission_denied'); assert.equal(net.dns.length + net.calls.length, 0); });
for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '198.18.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1'])
    test('reject non-public address ' + ip, async () => { const net = network(); net.resolve = async () => [ip]; await rejectsCode(fetchFixture(policy(), net).fetch.get(url), 'permission_denied'); assert.equal(net.calls.length, 0); });
test('mixed public/private DNS answers fail closed', async () => { const net = network(); net.resolve = async () => ['93.184.216.34', '10.0.0.1']; await rejectsCode(fetchFixture(policy(), net).fetch.get(url), 'permission_denied'); assert.equal(net.calls.length, 0); });
test('approved redirect validates and resolves new destination', async () => { const net = network([wire(302, '', { location: 'https://other.example.test/feed' }), wire()]); await fetchFixture(policy(), net).fetch.get(url); assert.deepEqual(net.dns, ['fixture.example.test', 'other.example.test']); });
test('redirect to unapproved host stops before destination DNS', async () => { const net = network([wire(302, '', { location: 'https://evil.example.test/feed' })]); await rejectsCode(fetchFixture(policy(), net).fetch.get(url), 'permission_denied'); assert.equal(net.calls.length, 1); assert.equal(net.dns.length, 1); });
test('redirect to an approved hostname resolving privately is blocked', async () => { const net = network([wire(302, '', { location: 'https://other.example.test/feed' })]); net.resolve = async (host) => host.startsWith('other') ? ['169.254.169.254'] : ['93.184.216.34']; await rejectsCode(fetchFixture(policy(), net).fetch.get(url), 'permission_denied'); assert.equal(net.calls.length, 1); });
test('redirect loops bounded', async () => { const net = network([() => wire(302, '', { location: '/next' })]); await rejectsCode(fetchFixture(policy(), net).fetch.get(url), 'permission_denied'); assert.equal(net.calls.length, 3); });
for (const [label, response, code] of [['oversized header', wire(200, '{}', { 'content-length': '2048' }), 'budget_exceeded'], ['oversized stream', wire(200, 'x'.repeat(1025)), 'budget_exceeded'], ['invalid type', wire(200, '{}', { 'content-type': 'text/html' }), 'schema_error'], ['compression denied', wire(200, '{}', { 'content-encoding': 'gzip' }), 'schema_error'], ['truncated body', wire(200, '{}', { 'content-length': '100' }), 'schema_error'], ['401', wire(401), 'authentication_failed'], ['403', wire(403), 'permission_denied'], ['unsolicited304', wire(304), 'schema_error']])
    test(label, async () => { const net = network([response]); await rejectsCode(fetchFixture({ ...policy(), maxRetries: 3 }, net).fetch.get(url), code); assert.equal(net.calls.length, 1); assert.equal(response.closed, true); });
test('timeout includes stalled transport and returns redacted retryable network error', async () => { const net = network([() => new Promise(() => { })]); await rejectsCode(fetchFixture({ ...policy(), timeoutMs: 5 }, net).fetch.get(url), 'network_error'); assert.equal(net.calls[0].signal.aborted, true); });
test('DNS timeout never starts HTTP after late resolution', async () => { const net = network(); net.resolve = async () => { await new Promise(r => setTimeout(r, 30)); return ['93.184.216.34']; }; await rejectsCode(fetchFixture({ ...policy(), timeoutMs: 5 }, net).fetch.get(url), 'network_error'); await new Promise(r => setTimeout(r, 40)); assert.equal(net.calls.length, 0); });
test('stream deadline closes a stalled body', async () => { const r = wire(); r.body = { async *[Symbol.asyncIterator]() { await new Promise(() => { }); } }; await rejectsCode(fetchFixture({ ...policy(), timeoutMs: 5 }, network([r])).fetch.get(url), 'network_error'); assert.equal(r.closed, true); });
test('429 Retry-After seconds persist and delay retry', async () => { const waits = [], holds = []; const net = network([wire(429, '', { 'retry-after': '2' }), wire()]); net.sleep = async (ms) => waits.push(ms); const store = memory({ defer: async (_l, _h, ms) => holds.push(ms) }); await fetchFixture({ ...policy(), maxRetries: 1 }, net, store).fetch.get(url); assert.deepEqual(waits, [2000]); assert.deepEqual(holds, [2000]); });
test('long Retry-After is deferred without early retry; HTTP-date supported', async () => { assert.equal(retryAfter('Thu, 01 Jan 2026 00:01:00 GMT', Date.parse('2026-01-01T00:00:00Z')), 60000); const net = network([wire(429, '', { 'retry-after': '172800' })]); await assert.rejects(fetchFixture({ ...policy(), maxRetries: 3 }, net).fetch.get(url), e => e.code === 'rate_limited' && e.retryAfterMs === 172800000); assert.equal(net.calls.length, 1); });
test('5xx retries at most three times; all attempts consume budget', async () => { let used = 0; const net = network([() => wire(503)]); await rejectsCode(fetchFixture({ ...policy(), maxRetries: 3 }, net, memory({ reserve: async () => { used++; } })).fetch.get(url), 'network_error'); assert.equal(net.calls.length, 4); assert.equal(used, 4); });
test('revocation on retry prevents further DNS/HTTP', async () => { let guards = 0; const net = network([() => wire(503)]); const store = memory({ guard: async () => { if (++guards > 2)
        throw new ConnectorError('permission_denied'); } }); await rejectsCode(fetchFixture({ ...policy(), maxRetries: 3 }, net, store).fetch.get(url), 'permission_denied'); assert.equal(net.calls.length, 1); });
test('abort before request consumes no request', async () => { const controller = new AbortController(); controller.abort(); const net = network(); await rejectsCode(new BoundedFetcher(memory(), lease(), controller.signal, net).get(url), 'budget_exceeded'); assert.equal(net.calls.length, 0); });
test('unknown errors expose neither response, URL, SQL nor cause', () => { const e = redact(new Error('SECRET_SENTINEL https://private.test/?token=SECRET_SENTINEL')); assert.deepEqual(e, { code: 'network_error', retryable: false, detail: 'Source transport failed.' }); });
let h;
before(async () => { h = await database(); });
after(async () => { await h?.db.close(); });
beforeEach(async () => { await h.db.exec('delete from public.connector_host_budgets'); });
const rpc = async (command, role = 'service_role') => h.db.transaction(async (tx) => { await tx.exec('set local role ' + role); return (await tx.query('select public.connector_runtime($1) data', [JSON.stringify(command)])).rows[0].data; });
async function setup(overrides = {}) { const { connectorId } = await h.source(overrides); const store = h.store(); return { store, l: await store.claim(connectorId, 'synthetic-v1') }; }
test('migration creates private raw bucket and denies raw metadata/storage even with broad permissive object policy', async () => { const b = (await h.db.query("select * from storage.buckets where id='connector-raw'")).rows[0]; assert.equal(b.public, false); await h.db.exec("create policy test_broad on storage.objects for all to anon,authenticated using(true) with check(true)"); await h.db.query("insert into storage.objects(bucket_id,name)values('connector-raw','SYNTHETIC_PRIVATE')"); for (const role of ['anon', 'authenticated']) {
    await h.db.transaction(async (tx) => { await tx.exec('set local role ' + role); assert.equal((await tx.query('select * from storage.objects')).rows.length, 0); });
    await assert.rejects(h.db.transaction(async (tx) => { await tx.exec('set local role ' + role); await tx.query('select * from public.connector_evidence'); }));
    await assert.rejects(h.db.transaction(async (tx) => { await tx.exec('set local role ' + role); await tx.query("insert into storage.objects(bucket_id,name)values('connector-raw','denied')"); }));
    await assert.rejects(rpc({ op: 'claim' }, role));
} });
test('atomic lease claim rejects overlap, expires and fences old worker', async () => { const { store, l } = await setup(); await rejectsCode(store.claim(l.connectorId, 'synthetic-v1'), 'budget_exceeded'); await h.db.query("update public.source_connectors set lease_expires_at=now()-interval '1 second' where id=$1", [l.connectorId]); await rejectsCode(store.guard(l), 'budget_exceeded'); const newer = await store.claim(l.connectorId, 'synthetic-v1'); assert.equal(newer.fence, l.fence + 1); await rejectsCode(store.finish(l, { items: [], errors: [], complete: true }), 'budget_exceeded'); assert.equal((await h.db.query('select status from public.sync_runs where id=$1', [l.runId])).rows[0].status, 'cancelled'); });
test('disabled, expired and changed database policy deny before source network', async () => { for (const kind of ['disabled', 'expired', 'changed']) {
    const { store, l } = await setup();
    if (kind === 'disabled')
        await h.db.query('update public.source_connectors set enabled=false where id=$1', [l.connectorId]);
    if (kind === 'expired')
        await h.db.query("update public.source_connectors set policy_metadata=jsonb_set(policy_metadata,'{fetchPolicy,expiresAt}',to_jsonb($2::text)) where id=$1", [l.connectorId, '2000-01-01T00:00:00Z']);
    if (kind === 'changed')
        await h.db.query("update public.source_connectors set policy_metadata=jsonb_set(policy_metadata,'{fetchPolicy,evidence}',to_jsonb($2::text)) where id=$1", [l.connectorId, 'changed']);
    const net = network();
    await rejectsCode(new BoundedFetcher(store, l, new AbortController().signal, net).get(url), 'permission_denied');
    assert.equal(net.dns.length + net.calls.length, 0);
} });
test('persistent daily/per-run budgets survive worker replacement and are shared per host', async () => { const { store, l } = await setup({ dailyRequests: 1 }); await store.reserve(l, 'fixture.example.test'); await store.releaseHost(l, 'fixture.example.test'); const other = await setup({ dailyRequests: 100 }); await rejectsCode(other.store.reserve(other.l, 'fixture.example.test'), 'budget_exceeded'); await store.finish(l, { items: [], errors: [], complete: true }); const again = await store.claim(l.connectorId, 'synthetic-v1'); await rejectsCode(store.reserve(again, 'fixture.example.test'), 'budget_exceeded'); await h.db.exec('delete from public.connector_host_budgets'); const run = await setup({ maxRequests: 1 }); await run.store.reserve(run.l, 'fixture.example.test'); await run.store.releaseHost(run.l, 'fixture.example.test'); await rejectsCode(run.store.reserve(run.l, 'other.example.test'), 'budget_exceeded'); });
test('host concurrency and Retry-After persist in SQL', async () => { const a = await setup(), b = await setup(); await a.store.reserve(a.l, 'fixture.example.test'); await rejectsCode(b.store.reserve(b.l, 'fixture.example.test'), 'rate_limited'); await a.store.defer(a.l, 'fixture.example.test', 60000); await a.store.releaseHost(a.l, 'fixture.example.test'); await rejectsCode(b.store.reserve(b.l, 'fixture.example.test'), 'rate_limited'); });
function synthetic(id, { bad = false, partial = false } = {}) { return { id, version: 'synthetic-v1', kind: 'feed', async discover(ctx) { const response = await ctx.fetch.get(url); let input; try {
        input = JSON.parse(Buffer.from(response.body).toString());
    }
    catch {
        throw new ConnectorError('parse_error');
    } if (bad || !Array.isArray(input))
        throw new ConnectorError('schema_error'); const items = []; for (const row of input) {
        if (!row.id)
            continue;
        items.push(await ctx.retain(row.id, response));
    } return { items, complete: true, errors: partial ? [{ code: 'parse_error', detail: 'SECRET_SENTINEL', retryable: false }] : [] }; }, async refresh() { throw Error('Not exercised in C08'); }, async parse() { throw Error('C09 not implemented'); } }; }
test('synthetic runner retains immutable evidence, logs metadata and duplicate replay adds no rows/blobs', async () => { const { connectorId } = await h.source(); const connector = synthetic(connectorId), store = h.store(); for (let i = 0; i < 2; i++) {
    const result = await modules.runner.collectPage(connector, store, new AbortController().signal, network([wire(200, '[{"id":"synthetic-one"}]')]));
    assert.equal(result.status, 'succeeded');
} const rows = (await h.db.query('select * from public.connector_evidence where connector_id=$1', [connectorId])).rows; assert.equal(rows.length, 1); assert.equal(rows[0].parser_version, 'synthetic-v1'); assert.ok(h.blobs.has(rows[0].storage_path)); assert.equal((await h.db.query('select * from storage.objects where name=$1', [rows[0].storage_path])).rows.length, 1); assert.equal((await h.db.query('select count(*)::int n from public.events')).rows[0].n, 0); assert.equal((await h.db.query('select count(*)::int n from public.event_sources')).rows[0].n, 0); });
test('partial page preserves prior checkpoint and valid private evidence, never logs raw item diagnostics', async () => { const { connectorId } = await h.source(); await h.db.query('update public.source_connectors set checkpoint=$2 where id=$1', [connectorId, '{"cursor":"previous"}']); const result = await modules.runner.collectPage(synthetic(connectorId, { partial: true }), h.store(), new AbortController().signal, network([wire(200, '[{"id":"good"},{"bad":true}]')])); assert.equal(result.status, 'partial'); const c = (await h.db.query('select checkpoint,last_successful_sync from public.source_connectors where id=$1', [connectorId])).rows[0]; assert.equal(c.checkpoint.cursor, 'previous'); assert.equal(c.last_successful_sync, null); const logs = (await h.db.query('select item_errors,error_summary from public.sync_runs where connector_id=$1', [connectorId])).rows; assert.ok(!JSON.stringify(logs).includes('SECRET_SENTINEL')); });
test('malformed source JSON is parse_error and does not advance checkpoint', async () => { const { connectorId } = await h.source(); const result = await modules.runner.collectPage(synthetic(connectorId), h.store(), new AbortController().signal, network([wire(200, '{malformed SECRET_SENTINEL')])); assert.equal(result.status, 'failed'); assert.equal(result.errors[0].code, 'parse_error'); });
test('401 and 403 failures pause connector without publishing or exposing body', async () => { for (const code of [401, 403]) {
    const { connectorId } = await h.source();
    await modules.runner.collectPage(synthetic(connectorId), h.store(), new AbortController().signal, network([wire(code, 'SECRET_SENTINEL')]));
    assert.equal((await h.db.query('select enabled from public.source_connectors where id=$1', [connectorId])).rows[0].enabled, false);
} });
test('raw write from expired worker rejected; uploads compensated', async () => { const { store, l } = await setup(); await h.db.query("update public.source_connectors set lease_expires_at=now()-interval '1 second' where id=$1", [l.connectorId]); const size = h.blobs.size; await rejectsCode(store.retain(l, 'synthetic-v1', 'test', { url, status: 200, contentType: 'application/json', body: Buffer.from('{}'), fetchedAt: new Date().toISOString() }), 'budget_exceeded'); assert.equal(h.blobs.size, size); });
test('no production connector registered; all C07 sources remain disabled', async () => { assert.deepEqual(modules.runner.registeredConnectors, []); const register = JSON.parse(await readFile(new URL('../../docs/sources/c07/source-register.json', import.meta.url))); assert.ok(register.sources.every(s => s.enabled === false)); });
test('actual HTTPS transport pins lookup, enforces TLS and never forwards credentials/proxy headers', async () => { const base = new URL('../../work/c08-modules/', import.meta.url); const source = await readFile(new URL('transport.mjs', base), 'utf8'); await writeFile(new URL('https-stub.mjs', base), 'export class Agent {constructor(options){this.options=options;}destroy(){}} export function request(url,options,callback){globalThis.__c08Options=options;globalThis.__c08Url=url;queueMicrotask(()=>callback({statusCode:200,headers:{},destroy(){},async *[Symbol.asyncIterator](){}}));return {on(){},end(){},destroy(){}};}'); await writeFile(new URL('transport-pinned-test.mjs', base), source.replace('"node:https"', '"./https-stub.mjs"')); const { pinnedTransport } = await import(new URL('transport-pinned-test.mjs', base)); await pinnedTransport(new URL(url), '93.184.216.34', 'Synthetic/1', new AbortController().signal); const o = globalThis.__c08Options; assert.equal(o.agent.options.keepAlive, false); assert.deepEqual(o.agent.options.proxyEnv, { NODE_ENV: "production" }); assert.equal(o.rejectUnauthorized, true); assert.equal(o.servername, 'fixture.example.test'); assert.equal(o.headers['Accept-Encoding'], 'identity'); assert.equal(o.headers.Authorization, undefined); assert.equal(o.headers.Cookie, undefined); o.lookup('rebound.invalid', { all: false }, (e, address) => { assert.equal(e, null); assert.equal(address, '93.184.216.34'); }); delete globalThis.__c08Options; delete globalThis.__c08Url; });
test('successful bounded page advances cursor atomically; invalid reference rolls back run and checkpoint', async () => { const { store, l } = await setup(); await assert.rejects(store.finish(l, { items: [{ externalId: 'invented', permittedPayloadRef: 'invented', contentHash: 'a'.repeat(64) }], errors: [], complete: false, cursor: 'must-not-commit' })); assert.equal((await h.db.query('select checkpoint from public.source_connectors where id=$1', [l.connectorId])).rows[0].checkpoint, null); assert.equal((await h.db.query('select status from public.sync_runs where id=$1', [l.runId])).rows[0].status, 'running'); await store.finish(l, { items: [], errors: [], complete: false, cursor: 'page-2' }); assert.equal((await h.db.query('select checkpoint from public.source_connectors where id=$1', [l.connectorId])).rows[0].checkpoint.cursor, 'page-2'); assert.equal((await h.db.query('select last_successful_sync from public.source_connectors where id=$1', [l.connectorId])).rows[0].last_successful_sync, null); });
test('permission revoked at commit cannot report success or advance cursor', async () => { const { store, l } = await setup(); await h.db.query('update public.source_connectors set enabled=false where id=$1', [l.connectorId]); assert.equal(await store.finish(l, { items: [], errors: [], complete: true }), 'failed'); assert.equal((await h.db.query('select last_successful_sync from public.source_connectors where id=$1', [l.connectorId])).rows[0].last_successful_sync, null); });
test('parser-version change keeps a separate private replay artifact', async () => { const { connectorId } = await h.source(); const c = synthetic(connectorId); const net = () => network([wire(200, '[{"id":"stable"}]')]); await modules.runner.collectPage(c, h.store(), new AbortController().signal, net()); c.version = 'synthetic-v2'; await modules.runner.collectPage(c, h.store(), new AbortController().signal, net()); assert.equal((await h.db.query('select count(*)::int n from public.connector_evidence where connector_id=$1', [connectorId])).rows[0].n, 2); });
test('failed object metadata registration compensates just its own upload', async () => { const { store, l } = await setup(); const original = h.client.rpc.bind(h.client), size = h.blobs.size; h.client.rpc = async (name, input) => input.command.op === 'retain' ? { data: null, error: { message: 'schema_error' } } : original(name, input); try {
    await rejectsCode(store.retain(l, 'synthetic-v1', 'fixture', { url, status: 200, contentType: 'application/json', body: Buffer.from('{}'), fetchedAt: new Date().toISOString() }), 'schema_error');
    assert.equal(h.blobs.size, size);
}
finally {
    h.client.rpc = original;
} });
test('metadata-only raw storage writes do not imply verified observations', async () => { const { connectorId } = await h.source(); await modules.runner.collectPage(synthetic(connectorId), h.store(), new AbortController().signal, network([wire(200, '[{"id":"private"}]')])); assert.equal((await h.db.query('select count(*)::int n from public.public_event_sources')).rows[0].n, 0); });
test('non-progressing continuation and fabricated retention are rejected', async () => { const { connectorId } = await h.source(); const c = synthetic(connectorId); c.discover = async (ctx) => { await ctx.retain('fabricated', { url, status: 200, contentType: 'application/json', body: Buffer.from('{}'), fetchedAt: new Date().toISOString() }); return { items: [], complete: false }; }; const n = network(); const result = await modules.runner.collectPage(c, h.store(), new AbortController().signal, n); assert.equal(result.errors[0].code, 'schema_error'); assert.equal(n.calls.length, 0); });
