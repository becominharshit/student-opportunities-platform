import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { replay } from "../database/harness.mjs";
const require = createRequire(import.meta.url);
export const moduleUrl = source => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText).toString("base64");
export async function loadPresentation() {
  return import(moduleUrl(await readFile(new URL("../../src/lib/events/presentation.ts", import.meta.url), "utf8")));
}
export async function loadComponents() {
  const format = moduleUrl(await readFile(new URL("../../src/lib/events/presentation.ts", import.meta.url), "utf8"));
  // Next Link's router integration is covered on hosted routes; fixture HTML uses native anchors.
  const link = moduleUrl(`import {createElement} from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)}; export default function Link(props){return createElement("a",props);}`);
  let source = await readFile(new URL("../../src/components/public-events.tsx", import.meta.url), "utf8");
  const saveCode=Buffer.from(moduleUrl(await readFile(new URL("../../src/components/save-control.tsx",import.meta.url),"utf8")).split(",")[1],"base64").toString().replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href));
  source=source.replace('"./save-control"',JSON.stringify("data:text/javascript;base64,"+Buffer.from(saveCode).toString("base64")));
  const calCode=Buffer.from(moduleUrl(await readFile(new URL("../../src/lib/events/calendar.ts",import.meta.url),"utf8")).split(",")[1],"base64").toString();
  const calUrl="data:text/javascript;base64,"+Buffer.from(calCode).toString("base64");
  let actionsSource=await readFile(new URL("../../src/components/calendar-actions.tsx",import.meta.url),"utf8");
  actionsSource=actionsSource.replaceAll('"@/lib/events/calendar"',JSON.stringify(calUrl));
  let actionsCompiled=Buffer.from(moduleUrl(actionsSource).split(",")[1],"base64").toString();
  actionsCompiled=actionsCompiled.replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href));
  source=source.replace('"./calendar-actions"',JSON.stringify("data:text/javascript;base64,"+Buffer.from(actionsCompiled).toString("base64")));
  source = source.replace('"@/lib/events/presentation"', JSON.stringify(format)).replace('"next/link"', JSON.stringify(link));
  let compiled = Buffer.from(moduleUrl(source).split(",")[1], "base64").toString();
  compiled = compiled.replace('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href));
  return import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
}
export const fixtureId = n => `70000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
export async function fixtures() {
  const db = await replay();
  const calls = [];
  await db.exec(`insert into public.organizers(id,name,normalized_identity)values('50000000-0000-0000-0000-000000000001','ISOLATED TEST organizer','c06-fixture');
    insert into public.source_connectors(id,name,source_url,type,policy_metadata)values('40000000-0000-0000-0000-000000000001','ISOLATED TEST source','https://example.test','feed','{"private":"PRIVATE_SENTINEL"}');`);
  const category = (await db.query("select id from public.event_categories where slug='hackathon'")).rows[0].id;
  for (let n = 1; n <= 32; n++) {
    await db.query(`insert into public.events(id,slug,title,short_description,full_description,organizer_id,category_id,official_url,registration_url,verification_status,verification_level,last_checked_at,date_precision,start_date)
      values($1,$2,$3,'Synthetic fixture, never production','<script>PRIVATE_XSS</script>','50000000-0000-0000-0000-000000000001',$4,'https://example.test/event','https://example.test/register?edition=2026&track=keep','current','community_submitted',now(),'date_only','2026-10-12')`, [fixtureId(n), `isolated-event-${n}`, `ISOLATED TEST event ${n}`, category]);
    await db.query(`insert into public.event_sources(event_id,connector_id,external_id,source_url,normalized_url,last_checked_at,raw_storage_ref,validated_observation,field_evidence)
      values($1,'40000000-0000-0000-0000-000000000001',$2,'https://example.test/event','https://example.test/event',now(),'PRIVATE_SENTINEL','{"official_url":"https://example.test/event","registration_url":"https://example.test/register?edition=2026&track=keep"}','{"official_url":{"status":"checked"},"registration_url":{"status":"checked"},"private":"PRIVATE_SENTINEL"}')`, [fixtureId(n), String(n)]);
    if (n <= 28) await db.query("update public.events set publication_status='published' where id=$1", [fixtureId(n)]);
    else await db.query("update public.events set publication_status=$2 where id=$1", [fixtureId(n), ["draft", "review", "unpublished", "archived"][n - 29]]);
  }
  await db.query("insert into public.event_tags(event_id,tag,kind)values($1,'robotics','domain')", [fixtureId(1)]);
  await db.query("insert into public.event_deadlines(event_id,kind,label,precision,local_date,active,is_primary)values($1,'registration','Apply by','date_only','2026-10-10',true,true)", [fixtureId(1)]);
  // Narrow adapter over actual PostgreSQL RLS, with exact column projections.
  const allowed = new Set(["events", "public_event_sources"]);
  globalThis.__c06Client = (url, key, options) => {
    if (key !== "sb_publishable_TEST_ONLY" || options.auth.persistSession !== false) throw Error("Non-public client");
    return { from(table) {
      if (!allowed.has(table)) throw Error("Unexpected table");
      const filters = []; let projection, order, limit;
      const query = {
        select(s) { projection = s; return this; },
        eq(k, v) { filters.push([k, "=", v]); return this; },
        gt(k, v) { filters.push([k, ">", v]); return this; },
        order(k, opts) { order = [k, opts.ascending]; return this; },
        limit(n) { limit = n; return this; },
        maybeSingle() { return this.execute(true); },
        then(resolve, reject) { return this.execute(false).then(resolve, reject); },
        async execute(single) {
          calls.push({ table, projection, filters: [...filters], order, limit });
          for (const [k] of filters) if (!["id", "slug", "event_id", "version", "publication_status"].includes(k)) throw Error("Unexpected filter");
          if (order && order[0] !== "id") throw Error("Unexpected order");
          const fields = projection.split(/,(?![^()]*\))/);
          const plain = fields.filter(f => !f.includes("("));
          if (plain.some(f => !/^[a-z_]+$/.test(f))) throw Error("Unsafe projection");
          await db.exec("set role anon");
          try {
            const rows = (await db.query(`select ${plain.join(",")} from public.${table} where ${filters.map(([k, op], i) => `${k}${op}$${i + 1}`).join(" and ")}${order ? ` order by id ${order[1] ? "asc" : "desc"}` : ""}${limit ? ` limit ${Number(limit)}` : ""}`, filters.map(f => f[2]))).rows;
            for (const row of rows) for (const field of fields.filter(f => f.includes("("))) {
              const [, related, columns] = field.match(/^(\w+)\(([^)]+)\)$/);
              if (!["organizers", "event_categories", "event_tags", "event_deadlines"].includes(related) || !/^[a-z_,]+$/.test(columns)) throw Error("Unsafe relation");
              const join = related === "organizers" ? "id=(select organizer_id from public.events where id=$1)" : related === "event_categories" ? "id=(select category_id from public.events where id=$1)" : "event_id=$1";
              const relatedRows = (await db.query(`select ${columns} from public.${related} where ${join}`, [row.id])).rows;
              row[related] = ["organizers", "event_categories"].includes(related) ? relatedRows[0] ?? null : relatedRows;
            }
            // PostgREST serializes PostgreSQL date/timestamp objects as strings.
            const data = JSON.parse(JSON.stringify(rows, function(k, v) { return k === "local_date" || k === "start_date" || k === "end_date" ? v?.slice(0, 10) ?? null : v; }));
            return { data: single ? data[0] ?? null : data, error: null };
          } finally { await db.exec("reset role"); }
        },
      };
      return query;
    } };
  };
  const validation = moduleUrl(await readFile(new URL("../../src/lib/events/validation.ts", import.meta.url), "utf8"));
  const client = moduleUrl("export const createClient=(...args)=>globalThis.__c06Client(...args);");
  const env = moduleUrl('export const getPublicSupabaseEnv=()=>({url:"https://example.test",key:"sb_publishable_TEST_ONLY"});');
  const source = (await readFile(new URL("../../src/lib/events/public.ts", import.meta.url), "utf8")).replace('import "server-only";', "").replace('"@supabase/supabase-js"', JSON.stringify(client)).replace('"../supabase/public-env"', JSON.stringify(env)).replace('"./validation"', JSON.stringify(validation));
  return { db, calls, api: await import(moduleUrl(source)), close: async () => { delete globalThis.__c06Client; await db.close(); } };
}
