import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixtures, fixtureId, loadComponents, loadPresentation } from "./c06-harness.mjs";
let fixture, components, format;
before(async () => { fixture = await fixtures(); components = await loadComponents(); format = await loadPresentation(); });
after(async () => fixture?.close());
const html = (component, props) => renderToStaticMarkup(createElement(component, props));
test("C06 Explore uses real anonymous RLS; published only; database limit 25", async () => {
  const page = await fixture.api.listPublishedEvents(); assert.equal(page.ok, true);
  assert.equal(page.value.items.length, 24); assert.equal(page.value.items[0].id, fixtureId(1));
  const query = fixture.calls.at(-1); assert.equal(query.limit, 25); assert.deepEqual(query.order, ["id", true]);
  const next = await fixture.api.listPublishedEvents({ after: page.value.nextCursor });
  assert.equal(next.value.items.length, 4); assert.equal(next.value.nextCursor, null);
  const text = html(components.ExploreContent, page.value); assert.match(text, /ISOLATED TEST event 1/);
  for (let n = 29; n <= 32; n++) assert.ok(![...page.value.items, ...next.value.items].some(e => e.id === fixtureId(n)));
});
for (const [n, state] of [[29,"draft"],[30,"review"],[31,"unpublished"],[32,"archived"],[99,"nonexistent"]]) test(`C06 ${state} detail has the identical not-found result`, async () => {
  assert.deepEqual(await fixture.api.readPublishedEvent({ slug: `isolated-event-${n}` }), { ok: false, code: "not_found" });
});
test("C06 published slug resolves and renders safe relations, source and exact official URL", async () => {
  const result = await fixture.api.readPublishedEvent({ slug: "isolated-event-1" }); assert.equal(result.ok, true);
  const e = result.value, text = html(components.EventDetailContent, { event: e });
  for (const value of ["ISOLATED TEST organizer", "Hackathon", "robotics", "Apply by", "ISOLATED TEST source"]) assert.ok(text.includes(value));
  assert.equal(e.registration_url, "https://example.test/register?edition=2026&track=keep");
  assert.ok(text.includes('href="https://example.test/register?edition=2026&amp;track=keep"'));
  assert.match(text, /external website, opens in new tab/);
  assert.match(text, /&lt;script&gt;PRIVATE_XSS&lt;\/script&gt;/); assert.ok(!text.includes("<script>PRIVATE_XSS"));
  assert.deepEqual(Object.keys(e.sources[0]).sort(), ["id","event_id","source_url","source_name","last_checked_at"].sort());
  assert.ok(!JSON.stringify(e).includes("PRIVATE_SENTINEL"));
  for (const forbidden of ["field_evidence", "raw_storage_ref", "policy_metadata", "eligibility_rules", "date_metadata", "search_vector", "image_rights"]) assert.ok(!JSON.stringify(e).includes(forbidden));
});
test("C06 unknown values stay unknown; community is not mislabeled verified", async () => {
  const e = (await fixture.api.readPublishedEvent({ slug: "isolated-event-2" })).value;
  const text = html(components.EventDetailContent, { event: e });
  for (const value of ["Team size not specified", "Registration deadline not specified", "Fee not specified", "Prize amount not specified", "Location not specified", "Community Submitted"]) assert.ok(text.includes(value));
  assert.ok(!text.includes(">Free<")); assert.equal(e.individual_allowed, null);
  assert.equal(format.trustLabel({verification_level:"verified",verification_status:"stale"}), "Verification needs refresh");
});
test("C06 date-only stays date-only, known timezone formats exact instant, no default zone", () => {
  const date = format.dateFact("2026-10-12", null, null); assert.equal(date.text, "12 Oct 2026"); assert.equal(date.dateTime,"2026-10-12");
  assert.equal(format.dateFact(null, "2026-10-12T12:30:00Z", "Asia/Kolkata").text, "12 Oct 2026 · 6:00 pm (Asia/Kolkata)");
  assert.equal(format.dateFact(null, "2026-10-12T12:30:00Z", null).text, "Date not specified");
  const text=html(components.FactDate,{date:"2026-10-12"}); assert.match(text,/dateTime="2026-10-12"/); assert.ok(!text.includes("00:00"));
});
test("C06 money respects explicit free, currency and independent prize currency", () => {
  const e={fee:null,fee_max:null,fee_status:"unknown",currency:null,fee_basis:"unknown"};
  assert.equal(format.feeLabel(e),"Fee not specified"); assert.equal(format.feeLabel({...e,fee_status:"free"}),"Free");
  assert.equal(format.feeLabel({...e,fee_status:"paid",fee:100,currency:"INR",fee_basis:"team"}),"INR 100 per team");
  assert.equal(format.prizeLabel({prize_pool:500,prize_currency:"USD"}),"USD 500");
  assert.equal(format.prizeLabel({prize_pool:500,prize_currency:null}),"Prize amount not specified");
});
test("C06 cursor stable across updates and removal before cursor; malformed cursor rejected", async () => {
  const first=(await fixture.api.listPublishedEvents()).value;
  await fixture.db.exec("begin");
  try {
    await fixture.db.query("update public.events set publication_status='unpublished' where id=$1",[fixtureId(1)]);
    await fixture.db.query("update public.events set title='Changed title' where id=$1",[fixtureId(26)]);
    const second=(await fixture.api.listPublishedEvents({after:first.nextCursor})).value;
    assert.deepEqual(second.items.map(e=>e.id),[25,26,27,28].map(fixtureId));
    assert.equal(second.nextCursor,null);
  } finally { await fixture.db.exec("rollback"); }
  assert.equal((await fixture.api.listPublishedEvents({after:"x),id.gt.0"})).code,"invalid_cursor");
});
test("C06 genuine empty catalogue renders honest state without invented counts",async()=>{
  await fixture.db.exec("begin");
  try {
    await fixture.db.exec("update public.events set publication_status='unpublished' where publication_status='published'");
    const page=(await fixture.api.listPublishedEvents()).value;
    assert.equal(page.items.length,0); assert.equal(page.nextCursor,null);
    assert.match(html(components.ExploreContent,page),/No published opportunities are available yet/);
  } finally { await fixture.db.exec("rollback"); }
});
test("C06 unsafe URL suppressed; preserved HTTPS destination; closed registration CTA stays honest",async()=>{
  assert.equal(format.publicHttps("javascript:alert(1)"),null); assert.equal(format.publicHttps("https://user:password@example.test"),null);
  const e=(await fixture.api.readPublishedEvent({slug:"isolated-event-1"})).value;
  const text=html(components.EventDetailContent,{event:{...e,registration_status:"closed"}});
  assert.ok(!text.includes("Register on official website")); assert.match(text,/View official registration page/);
});


test("C06 database errors are distinct from empty inventory and never reveal diagnostics",async()=>{
  const original=globalThis.__c06Client;
  globalThis.__c06Client=()=>({from(){return {select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},maybeSingle(){return Promise.resolve({error:{message:"PRIVATE_SENTINEL"}});},then(resolve){return Promise.resolve({error:{message:"PRIVATE_SENTINEL"}}).then(resolve);}};}});
  try {
    assert.deepEqual(await fixture.api.listPublishedEvents(),{ok:false,code:"database_failure"});
    assert.deepEqual(await fixture.api.readPublishedEvent({slug:"isolated-event-1"}),{ok:false,code:"database_failure"});
  } finally {globalThis.__c06Client=original;}
});
test("C06 actual detail route calls notFound for every hidden state and a missing slug",async()=>{
  const {readFile}=await import("node:fs/promises");
  const {createRequire}=await import("node:module");
  const {pathToFileURL}=await import("node:url");
  const {moduleUrl}=await import("./c06-harness.mjs");
  const require=createRequire(import.meta.url);
  const apiUrl=moduleUrl("export const readPublishedEvent=(key)=>globalThis.__c06RouteApi.readPublishedEvent(key);");
  const viewUrl=moduleUrl("export function EventDetailContent(){return null;}");
  const navUrl=moduleUrl('export function notFound(){throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");}');
  let source=await readFile(new URL("../../src/app/events/[slug]/page.tsx",import.meta.url),"utf8");
  source=source.replace('"@/lib/saves/service"',JSON.stringify(moduleUrl('export const loadSaveState=async()=>({kind:"anonymous"});')));
  source=source.replace('"@/lib/recommendations/service"',JSON.stringify(moduleUrl('export const recommendationForEvent=async()=>({kind:"anonymous"});'))).replace('"@/components/event-personalization"',JSON.stringify(moduleUrl('export const EventPersonalization=()=>null;')));
  source=source.replace('"@/lib/events/public"',JSON.stringify(apiUrl)).replace('"@/components/public-events"',JSON.stringify(viewUrl)).replace('"next/navigation"',JSON.stringify(navUrl));
  let url=moduleUrl(source);
  const compiled=Buffer.from(url.split(",")[1],"base64").toString().replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href));
  url="data:text/javascript;base64,"+Buffer.from(compiled).toString("base64");
  const route=(await import(url)).default;
  globalThis.__c06RouteApi=fixture.api;
  try {
    for(const n of [29,30,31,32,99]) await assert.rejects(()=>route({params:Promise.resolve({slug:`isolated-event-${n}`})}),/NEXT_HTTP_ERROR_FALLBACK;404/);
    const page=await route({params:Promise.resolve({slug:"isolated-event-1"})});assert.equal(page.props.event.id,fixtureId(1));
    globalThis.__c06RouteApi={readPublishedEvent:async()=>({ok:false,code:"database_failure"})};
    await assert.rejects(()=>route({params:Promise.resolve({slug:"isolated-event-1"})}),/Public event details unavailable/);
  }finally{delete globalThis.__c06RouteApi;}
});
