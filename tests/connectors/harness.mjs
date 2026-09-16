// Synthetic-only harness. Real DNS and HTTP are never used by the C08 suite.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';
import { replay } from '../database/harness.mjs';
const out = new URL('../../work/c08-modules/', import.meta.url);
await mkdir(out, { recursive: true });
for (const name of ['contracts', 'errors', 'policy', 'transport', 'fetcher', 'store', 'runner']) {
    let text = await readFile(new URL('../../src/lib/connectors/' + name + '.ts', import.meta.url), 'utf8');
    text = text.replace('import "server-only";', '').replace('"../supabase/service"', '"./service-stub.mjs"');
    const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "\.\/([a-z-]+)"/g, 'from "./$1.mjs"');
    await writeFile(new URL(name + '.mjs', out), js);
}
await writeFile(new URL('service-stub.mjs', out), 'export function createServiceSupabaseClient(){throw Error("Test must inject local client");}');
export const modules = Object.fromEntries(await Promise.all(['errors', 'policy', 'fetcher', 'store', 'runner'].map(async (name) => [name, await import(pathToFileURL(fileURLToPath(new URL(name + '.mjs', out))).href)])));
export const policy = () => ({ version: 1, enabled: true, permission: 'approved', expiresAt: new Date(Date.now() + 86400000).toISOString(), evidence: 'SYNTHETIC TEST ONLY', termsHash: 'a'.repeat(64), robotsHash: 'b'.repeat(64), userAgent: 'StudentOpportunitiesSynthetic/0.1', routes: [{ host: 'fixture.example.test', path: '/feed', queryKeys: [] }, { host: 'fixture.example.test', path: '/next', queryKeys: [] }, { host: 'other.example.test', path: '/feed', queryKeys: [] }], contentTypes: ['application/json'], timeoutMs: 50, maxBytes: 1024, maxRetries: 0, maxRedirects: 2, maxRequests: 12, dailyRequests: 100, minIntervalMs: 0, retentionDays: 1 });
export const id = n => '80000000-0000-0000-0000-' + String(n).padStart(12, '0');
export async function database() {
    const db = await replay();
    const blobs = new Map();
    const client = { async rpc(name, { command }) { try {
            const data = await db.transaction(async (tx) => { await tx.exec('set local role service_role'); return (await tx.query('select public.connector_runtime($1::jsonb) data', [JSON.stringify(command)])).rows[0].data; });
            return { data, error: null };
        }
        catch (e) {
            return { data: null, error: { message: e.message } };
        } }, storage: { from(bucket) { if (bucket !== 'connector-raw')
                throw Error('Unexpected bucket'); return { async upload(path, body) { blobs.set(path, Buffer.from(body)); await db.query('insert into storage.objects(bucket_id,name)values($1,$2)', [bucket, path]); return { error: null }; }, async remove(paths) { for (const p of paths) {
                    blobs.delete(p);
                    await db.query('delete from storage.objects where bucket_id=$1 and name=$2', [bucket, p]);
                } return { error: null }; } }; } } };
    let next = 0;
    return { db, blobs, client, async source(overrides = {}) { const p = { ...policy(), ...overrides }; const connectorId = id(++next); await db.query('insert into public.source_connectors(id,name,source_url,type,enabled,permission_state,permission_evidence,permission_review_expires_at,policy_metadata) values($1,$2,$3,$4,true,$5,$6,$7,$8)', [connectorId, 'SYNTHETIC ' + next, 'https://fixture.example.test/feed', 'feed', 'approved', '{"fixture":true}', new Date(Date.now() + 86400000).toISOString(), JSON.stringify({ fetchPolicy: p })]); return { connectorId, p }; }, store: () => new modules.store.SupabaseConnectorStore(client) };
}
export function wire(status = 200, body = '{}', headers = {}) { let closed = false; return { status, headers: { 'content-type': 'application/json', ...headers }, body: (async function* () { if (body !== null)
        yield Buffer.from(body); })(), close() { closed = true; }, get closed() { return closed; } }; }
export function network(responses = [wire()]) { const calls = []; const dns = []; return { calls, dns, resolve: async (host) => { dns.push(host); return ['93.184.216.34']; }, transport: async (url, address, ua, signal) => { calls.push({ url: url.href, address, ua, signal }); const next = responses[Math.min(calls.length - 1, responses.length - 1)]; if (next instanceof Error)
        throw next; return typeof next === 'function' ? next() : next; }, sleep: async () => { }, jitter: () => 0 }; }
