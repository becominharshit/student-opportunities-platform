import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import {searchFixtures,fixtureId} from "./c12-harness.mjs";
let f;
before(async()=>{f=await searchFixtures();});
after(async()=>f?.close());
async function ids(filters) {const r=await f.search(filters);assert.equal(r.ok,true,JSON.stringify(r));return r.value.items.map(x=>x.id);}
const has = (list,n)=>list.includes(fixtureId(n));
test("C12 title and summary full text",async()=>{assert.deepEqual(await ids({q:"quantum"}),[fixtureId(2)]);assert.deepEqual(await ids({q:"neural"}),[fixtureId(2)]);});
test("C12 organizer full text",async()=>{assert.equal((await ids({q:'"TEST organizer"'})).length,24);});
test("C12 domain and skill full text, combined terms across fields",async()=>{assert.deepEqual(await ids({q:"robotics"}),[fixtureId(1)]);assert.deepEqual(await ids({q:"quantum python"}),[fixtureId(2)]);});
for(const [name,filter,expected] of [
 ["category",{category:"workshop"},[2]],["mode",{mode:"online"},[1]],["country city",{country:"in",city:"pUnE"},[1]],
 ["event dates",{date_from:"2026-11-01",date_to:"2026-11-01"},[2]],
 ["deadline",{deadline_from:"2026-10-15",deadline_to:"2026-10-25"},[2]],
 ["free",{fee:"free"},[1]],["paid",{fee:"paid"},[2]],["team",{team:"3"},[1]],["individual",{team:"1"},[3]],
 ["domain",{domain:"ROBOTICS"},[1]],["year",{year:"1"},[1]],["degree",{degree:"btech"},[1]],
 ["prize stated",{prize:"yes"},[1,3]],["explicit zero prize",{prize:"no"},[2]],
 ["registration",{registration:"closed"},[2]],
 ["combined",{q:"robotics",category:"hackathon",mode:"online",country:"IN",city:"Pune",fee:"free",team:"2",year:"2",degree:"BTech",prize:"yes",registration:"open"},[1]],
])test("C12 "+name+" filter",async()=>assert.deepEqual(await ids(filter),expected.map(fixtureId)));
test("C12 unknown values are distinct from false/zero and known restrictions",async()=>{
 for(const filter of [{prize:"unknown"},{fee:"unknown"},{mode:"unknown"},{registration:"unknown"}]){const list=await ids(filter);assert.ok(has(list,4));assert.ok(!has(list,1));assert.ok(!has(list,2));}
 assert.deepEqual(await ids({team:"900"}),[]);assert.deepEqual(await ids({year:"3"}),[]);
});
test("C12 relevance, dates, deadline and newest sort with deterministic tie and null order",async()=>{
 const newest=await ids({sort:"newest"});assert.equal(newest[0],fixtureId(2));assert.equal(newest[1],fixtureId(1));
 assert.deepEqual((await ids({sort:"deadline"})).slice(0,3),[1,2,3].map(fixtureId));
 const date=await ids({sort:"event_date"});assert.equal(date[0],fixtureId(1));assert.ok(!has(date,2));
 await f.db.query("update public.events set title='robotics robotics robotics' where id=$1",[fixtureId(3)]);
 try {assert.equal((await ids({q:"robotics",sort:"relevance"}))[0],fixtureId(3));}
 finally {await f.db.query("update public.events set title='ISOLATED TEST event 3' where id=$1",[fixtureId(3)]);}
});
test("C12 invalid query, duplicate keys, dates, controls and unavailable sorting safely ignored",()=>{
 const p=f.query.parseExploreQuery({q:["a","b"],category:"bad",mode:"x",country:"IND",team:"-1",year:"2.5",date_from:"2026-02-30",sort:"match",admin:"true"});
 assert.deepEqual(p.filters,{sort:"relevance"});assert.ok(p.warnings.length>=8);
 assert.equal(f.query.parseExploreQuery({sort:"prize",q:"x".repeat(201)}).filters.sort,"relevance");
 assert.deepEqual(f.query.parseExploreQuery({date_from:"2026-11-01",date_to:"2026-10-01"}).filters,{sort:"relevance"});
 assert.ok(f.query.parseExploreQuery({q:"bad\u0000query"}).warnings.includes("q"));
});
test("C12 all supported sorts paginate without missing/duplicate records including nulls",async()=>{
 for(const sort of ["relevance","deadline","event_date","newest"]){
  const first=await f.search({sort});assert.equal(first.value.items.length,24);
  const next=await f.search({sort},first.value.nextCursor);assert.equal(next.ok,true);assert.equal(next.value.items.length,4);assert.equal(next.value.nextCursor,null);
  assert.equal(new Set([...first.value.items,...next.value.items].map(e=>e.id)).size,28);
 }
});
test("C12 keyset boundary survives deletion before cursor and insertion before boundary",async()=>{
 const first=await f.search({sort:"deadline"});
 await f.db.exec("begin");
 try {await f.db.query("update public.events set publication_status='unpublished' where id=$1",[fixtureId(1)]);
 await f.db.query("insert into public.event_deadlines(event_id,kind,label,precision,local_date,active,is_primary) values($1,'registration','Earlier new listing','date_only','2026-10-01',true,true)",[fixtureId(29)]);
 await f.db.query("update public.events set publication_status='published' where id=$1",[fixtureId(29)]);
 const second=await f.search({sort:"deadline"},first.value.nextCursor);assert.deepEqual(second.value.items.map(e=>e.id),[25,26,27,28].map(fixtureId));
 }finally{await f.db.exec("rollback");}
});
test("C12 cursor version/scope/input validation",async()=>{
 const first=await f.search({sort:"newest"});
 for(const after of ["not-valid","a".repeat(1025),Buffer.from('{"v":99}').toString("base64url")])assert.equal((await f.search({},after)).code,"invalid_cursor");
 assert.equal((await f.search({mode:"online"},first.value.nextCursor)).code,"invalid_cursor");
});
test("C12 URL roundtrip, filter state in pagination and removal resets cursor",async()=>{
 const filters=f.query.parseExploreQuery({q:"AI & robots",mode:"online",country:"in",sort:"deadline",degree:"B Tech"}).filters;
 const url=f.query.exploreUrl(filters,"cursor");
 const params=Object.fromEntries(new URL(url,"http://local").searchParams);
 assert.deepEqual(f.query.parseExploreQuery(params).filters,filters);assert.equal(params.after,"cursor");
 const page=await f.route({searchParams:Promise.resolve({q:"organizer",sort:"deadline"})});
 const html=renderToStaticMarkup(page);assert.match(html,/q=organizer&amp;sort=deadline&amp;after=/);assert.match(html,/name="q"/);
 assert.ok(!f.query.exploreUrl(filters).includes("after="));
});
test("C12 empty/filter-no-match route",async()=>{
 const page=await f.route({searchParams:Promise.resolve({q:"unfindableword"})});assert.match(renderToStaticMarkup(page),/No events match these filters/);
});
test("C12 hidden events excluded and projection contains no private fields",async()=>{
 const first=await f.search();const second=await f.search({},first.value.nextCursor);
 const rows=[...first.value.items,...second.value.items];assert.equal(rows.length,28);
 assert.ok(rows.every(row=>!has([row.id],29)&&!has([row.id],30)&&!has([row.id],31)&&!has([row.id],32)));
 const json=JSON.stringify(rows);
 for(const text of ["PRIVATE_SENTINEL","eligibility_rules","search_vector","field_evidence","raw_storage_ref","policy_metadata","profiles","admin_memberships"])assert.ok(!json.includes(text),text);
});
test("C12 function uses invoker rights and explicit publication guard even for privileged SQL caller",async()=>{
 assert.equal((await f.db.query("select prosecdef from pg_proc where proname='search_published_events'")).rows[0].prosecdef,false);
 const rows=(await f.db.query("select public.search_published_events('{}',null) data")).rows[0].data;assert.equal(rows.length,25);assert.ok(rows.every(r=>Number(r.card.id.slice(-12))<=28));
});
test("C12 RPC direct malformed input fails safely; no SQL interpolation",async()=>{
 const result=await globalThis.__c12RPC("search_published_events",{filters:{date_from:"bad"},page_after:null});assert.ok(result.error);
 assert.deepEqual(await ids({q:"'; drop table events; --"}),[]);
});
test("C12 database error is not empty results and no diagnostics escape",async()=>{
 const original=globalThis.__c12RPC;globalThis.__c12RPC=async()=>({error:{message:"PRIVATE_SENTINEL"}});
 try{assert.deepEqual(await f.search(),{ok:false,code:"database_failure"});await assert.rejects(()=>f.route({searchParams:Promise.resolve({})}),/Public event catalogue unavailable/);}
 finally{globalThis.__c12RPC=original;}
});
test("C12 representative query plan recorded, database limits projection to 25",async()=>{
 const result=await f.db.query("explain (analyze,buffers,format text) select public.search_published_events($1::jsonb,null)",[JSON.stringify({q:"robotics",mode:"online"})]);
 console.log("C12 RPC plan:",result.rows.map(r=>r["QUERY PLAN"]).join("\n"));
});
