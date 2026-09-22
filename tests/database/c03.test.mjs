import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { replay } from "./harness.mjs";

const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
const ADMIN = "10000000-0000-0000-0000-000000000003";
const PUB = "20000000-0000-0000-0000-000000000001";
const DRAFT = "20000000-0000-0000-0000-000000000002";
const SRC = "30000000-0000-0000-0000-000000000001";
const CON = "40000000-0000-0000-0000-000000000001";
let db;
before(async () => {
  db = await replay();
  await db.exec(`
    begin;
    insert into auth.users(id, raw_user_meta_data) values
      ('${A}','{"role":"admin"}'), ('${B}','{}'), ('${ADMIN}','{}');
    insert into public.profiles(user_id,name) values ('${A}','Test A'), ('${B}','Test B');
    insert into public.admin_memberships(user_id,role) values ('${ADMIN}','admin');
    insert into public.organizers(id,name,normalized_identity) values
      ('50000000-0000-0000-0000-000000000001','Test organizer','test-organizer');
    insert into public.source_connectors(id,name,source_url,type) values
      ('${CON}','TEST ONLY connector','https://example.test','feed');
    insert into public.events(id,slug,title) values
      ('${PUB}','test-published','TEST ONLY published'), ('${DRAFT}','test-draft','TEST ONLY draft');
    insert into public.event_sources(id,event_id,connector_id,external_id,source_url,normalized_url,
      last_checked_at,validated_observation,field_evidence,raw_storage_ref) values
      ('${SRC}','${PUB}','${CON}','test-edition','https://example.test/event','https://example.test/event',
      now(),'{"title":"TEST ONLY published","official_url":"https://example.test/event","registration_url":"https://example.test/register"}',
      '{"official_url":{"status":"checked"},"registration_url":{"status":"checked"}}','private/test-raw');
    update public.events set short_description='TEST ONLY summary',
      organizer_id='50000000-0000-0000-0000-000000000001',
      category_id=(select id from public.event_categories where slug='hackathon'),
      official_url='https://example.test/event',registration_url='https://example.test/register',
      last_checked_at=now(),verification_level='community_submitted',verification_status='current',
      publication_status='published' where id='${PUB}';
    insert into public.saved_events(user_id,event_id) values ('${A}','${PUB}'), ('${B}','${PUB}');
    insert into public.interests(slug,name) values ('test-interest','Test interest');
    insert into public.skills(slug,name) values ('test-skill','Test skill');
    insert into public.user_interests select '${B}',id from public.interests;
    insert into public.user_skills select '${B}',id from public.skills;
    insert into public.event_tags(event_id,tag,kind) values ('${PUB}','public-test','domain'), ('${DRAFT}','private-test','domain');
    insert into public.event_changes(event_id,event_version,actor_id,reason,field_diff,evidence_snapshot)
      values ('${PUB}',2,'${ADMIN}','Test publication','{}','{"test":true}');
    commit;
  `);
});
after(async () => { await db?.close(); });

async function asRole(role, uid, fn) {
  await db.exec("begin");
  try {
    await db.exec("set local role " + role);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    await fn();
  } finally { await db.exec("rollback"); }
}
const count = async (table) => (await db.query("select count(*)::int n from public." + table)).rows[0].n;
async function rejected(sql, code, params = []) {
  await db.exec("savepoint expected_failure");
  let error;
  try { await db.query(sql, params); } catch (e) { error = e; }
  await db.exec("rollback to savepoint expected_failure");
  assert.ok(error, "SQL should have been rejected");
  assert.equal(error.code, code, error.message);
}

test("clean migrations preserve the 17 C03 tables plus 2 private C08 runtime tables, all with RLS", async () => {
  const rows = (await db.query("select relname, relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'")).rows;
  assert.equal(rows.length,19);
  assert.ok(rows.some(r => r.relname === "connector_evidence"));
  assert.ok(rows.some(r => r.relname === "connector_host_budgets"));
  assert.ok(rows.every(r => r.relrowsecurity));
});
test("migration replay succeeds independently on a second fresh database", async () => {
  const other = await replay();
  try { assert.equal((await other.query("select count(*)::int n from public.events")).rows[0].n,0); }
  finally { await other.close(); }
});
test("anonymous sees only published events and their tags", async () => asRole("anon",null,async () => {
  assert.equal(await count("events"),1);
  assert.deepEqual((await db.query("select tag from public.event_tags")).rows.map(r=>r.tag),["public-test"]);
}));
test("anonymous cannot access any private base table", async () => asRole("anon",null,async () => {
  for (const table of ["profiles","saved_events","user_interests","user_skills","admin_memberships",
    "source_connectors","event_sources","event_changes","sync_runs","duplicate_reviews"]) {
    await rejected("select * from public."+table,"42501");
  }
}));
test("public source view exposes only the safe projection", async () => asRole("anon",null,async () => {
  const rows=(await db.query("select * from public.public_event_sources")).rows;
  assert.equal(rows.length,1);
  assert.deepEqual(Object.keys(rows[0]).sort(),["id","event_id","source_url","last_checked_at","source_name"].sort());
  assert.ok(!JSON.stringify(rows).includes("private/test-raw"));
}));
test("user A cannot read/change/delete B profile, or insert impersonated profile", async () => asRole("authenticated",A,async () => {
  assert.deepEqual((await db.query("select user_id from public.profiles")).rows,[{user_id:A}]);
  assert.equal((await db.query("update public.profiles set name='attack' where user_id=$1 returning *",[B])).rows.length,0);
  assert.equal((await db.query("delete from public.profiles where user_id=$1 returning *",[B])).rows.length,0);
  await rejected("insert into public.profiles(user_id) values ($1)","42501",[ADMIN]);
  await rejected("update public.profiles set user_id=$1 where user_id=$2","42501",[ADMIN,A]);
  assert.equal((await db.query("update public.profiles set name='My profile' where user_id=$1 returning name",[A])).rows[0].name,"My profile");
}));
test("user A cannot read/change/delete B saves or transfer/save a draft", async () => asRole("authenticated",A,async () => {
  assert.deepEqual((await db.query("select user_id from public.saved_events")).rows,[{user_id:A}]);
  assert.equal((await db.query("update public.saved_events set user_id=$1 where user_id=$2 returning *",[A,B])).rows.length,0);
  assert.equal((await db.query("delete from public.saved_events where user_id=$1 returning *",[B])).rows.length,0);
  await rejected("insert into public.saved_events(user_id,event_id) values ($1,$2)","42501",[B,DRAFT]);
  await rejected("insert into public.saved_events(user_id,event_id) values ($1,$2)","42501",[A,DRAFT]);
  assert.equal((await db.query("delete from public.saved_events where user_id=$1 returning *",[A])).rows.length,1);
  await db.query("insert into public.saved_events(user_id,event_id) values ($1,$2)",[A,PUB]);
  await db.query("insert into public.saved_events(user_id,event_id) values ($1,$2) on conflict do nothing",[A,PUB]);
  assert.equal(await count("saved_events"),1);
}));
test("interests/skills ownership and controlled vocabularies", async () => asRole("authenticated",A,async () => {
  for (const [table,fk,lookup] of [["user_interests","interest_id","interests"],["user_skills","skill_id","skills"]]) {
    assert.equal(await count(table),0);
    await db.query(`insert into public.${table}(user_id,${fk}) select $1,id from public.${lookup}`,[A]);
    assert.equal(await count(table),await count(lookup));
    await rejected(`insert into public.${table}(user_id,${fk}) select $1,id from public.${lookup}`,"42501",[ADMIN]);
    assert.equal((await db.query(`delete from public.${table} where user_id=$1 returning *`,[B])).rows.length,0);
  }
  await rejected("insert into public.skills(slug,name) values ('attack','Attack')","42501");
}));
test("editable user metadata grants no admin access", async () => asRole("authenticated",A,async () => {
  assert.equal((await db.query("select private.is_admin() allowed")).rows[0].allowed,false);
  assert.equal(await count("admin_memberships"),0);
  await rejected("insert into public.admin_memberships(user_id,role) values ($1,'admin')","42501",[A]);
  await rejected("update public.admin_memberships set user_id=$1","42501",[A]);
  await rejected("delete from public.admin_memberships","42501");
  await rejected("insert into public.events(slug,title) values ('attack','Attack')","42501");
  for(const table of ["event_sources","source_connectors","sync_runs","duplicate_reviews","event_changes"]) {
    assert.equal(await count(table),0);
  }
}));
test("protected member can moderate, but cannot self-manage roles or read private users", async () => asRole("authenticated",ADMIN,async () => {
  assert.equal((await db.query("select private.is_admin() allowed")).rows[0].allowed,true);
  assert.equal(await count("events"),2);
  assert.equal((await db.query("update public.events set title='Staff edit' where id=$1 returning title",[DRAFT])).rows[0].title,"Staff edit");
  assert.equal(await count("event_sources"),1);
  assert.equal(await count("profiles"),0);
  assert.equal(await count("saved_events"),0);
  await rejected("insert into public.admin_memberships(user_id,role) values ($1,'admin')","42501",[A]);
}));
test("service role can provision protected membership and private records", async () => asRole("service_role",null,async () => {
  assert.equal(await count("profiles"),2);
  await db.query("insert into public.admin_memberships(user_id,role) values ($1,'admin')",[A]);
  assert.equal(await count("admin_memberships"),2);
}));
test("unknown facts remain null/unknown, not empty/false/zero", async () => asRole("service_role",null,async () => {
  const row=(await db.query("select mode,country,fee,individual_allowed,eligible_years,start_at,status from public.events where id=$1",[DRAFT])).rows[0];
  assert.deepEqual(row,{mode:null,country:null,fee:null,individual_allowed:null,eligible_years:null,start_at:null,status:"unknown"});
}));
test("invalid event state, monetary, array, team, URL and FK values are rejected", async () => asRole("service_role",null,async () => {
  for(const assignment of ["mode='telepathic'","status='fake'","registration_status='maybe'",
    "verification_level='AI verified'","publication_status='live'","verification_status='certain'",
    "fee=-1","fee=0","fee=10,fee_status='paid'","prize_pool=5",
    "eligible_years='{}'","eligible_years='{0}'","eligible_degrees='{}'","eligible_degrees=ARRAY[NULL]::text[]",
    "min_team_size=0","min_team_size=5,max_team_size=2","official_url='javascript:alert(1)'",
    "registration_url='https://user:password@example.test'","latitude=91","country='India'"]) {
    await rejected("update public.events set "+assignment+" where id=$1","23514",[DRAFT]);
  }
  await rejected("update public.events set organizer_id=$1 where id=$2","23503",[A,DRAFT]);
  await rejected("insert into public.events(slug,title) values ('test-draft','Duplicate')","23505");
}));
test("date precision prevents invented instants, bad zones and reversed dates", async () => asRole("service_role",null,async () => {
  for(const assignment of [
    "start_at='2026-10-01T00:00:00Z'",
    "date_precision='date_only',start_date='2026-10-01',start_at='2026-10-01T00:00:00Z'",
    "date_precision='date_only',start_date='2026-10-02',end_date='2026-10-01'",
    "timezone='MadeUp/Zone'",
    "date_precision='datetime',start_date='2026-10-02',start_at='2026-10-01T12:00:00Z',timezone='UTC'"
  ]) await rejected("update public.events set "+assignment+" where id=$1","23514",[DRAFT]);
  await db.query("update public.events set date_precision='date_only',start_date='2026-10-01' where id=$1",[DRAFT]);
  assert.equal((await db.query("select start_at from public.events where id=$1",[DRAFT])).rows[0].start_at,null);
}));
test("source identities, deadline association and primary uniqueness are enforced", async () => asRole("service_role",null,async () => {
  await rejected("insert into public.event_sources(connector_id,external_id,source_url,normalized_url) values ($1,'test-edition','https://example.test','https://example.test')","23505",[CON]);
  await rejected("insert into public.event_deadlines(event_id,kind,label,source_id) values ($1,'registration','Test',$2)","23503",[DRAFT,SRC]);
  await db.query("insert into public.event_deadlines(event_id,kind,label,is_primary) values ($1,'registration','Test',true)",[PUB]);
  await rejected("insert into public.event_deadlines(event_id,kind,label,is_primary) values ($1,'registration','Test 2',true)","23505",[PUB]);
  await rejected("insert into public.event_tags(event_id,tag,kind) values ($1,'unknown-skill','skill')","23514",[PUB]);
}));
test("publication requires mandatory fields and checked supporting evidence", async () => asRole("service_role",null,async () => {
  await rejected("update public.events set publication_status='published' where id=$1","23514",[DRAFT]);
  await db.exec("savepoint no_evidence");
  let caught;
  try {
    await db.query(`update public.events set publication_status='published',short_description='Test',
      organizer_id='50000000-0000-0000-0000-000000000001',
      category_id=(select id from public.event_categories limit 1), official_url='https://example.test',
      registration_url='https://example.test',last_checked_at=now(),verification_level='community_submitted',
      verification_status='current' where id=$1`,[DRAFT]);
    await db.exec("set constraints all immediate");
  } catch(e) { caught=e; }
  await db.exec("rollback to savepoint no_evidence");
  assert.equal(caught?.code,"23514");
}));
test("cannot remove the last evidence for a published record", async () => asRole("service_role",null,async () => {
  await db.exec("savepoint remove_evidence");
  let caught;
  try {
    await db.query("update public.event_sources set field_evidence=null where id=$1",[SRC]);
    await db.exec("set constraints all immediate");
  } catch(e) { caught=e; }
  await db.exec("rollback to savepoint remove_evidence");
  assert.equal(caught?.code,"23514");
}));
test("optimistic version advances and stale compare-and-update affects zero rows", async () => asRole("service_role",null,async () => {
  const old=(await db.query("select version from public.events where id=$1",[DRAFT])).rows[0].version;
  const changed=await db.query("update public.events set title='Changed' where id=$1 and version=$2 returning version",[DRAFT,old]);
  assert.equal(changed.rows[0].version,old+1);
  assert.equal((await db.query("update public.events set title='Stale' where id=$1 and version=$2 returning version",[DRAFT,old])).rows.length,0);
  await rejected("update public.events set version=999 where id=$1","23514",[DRAFT]);
  await rejected("update public.events set slug='changed-slug' where id=$1","23514",[DRAFT]);
}));
test("merge cycles and duplicate review self-pairs are rejected", async () => asRole("service_role",null,async () => {
  await db.query("update public.events set publication_status='archived',merged_into_event_id=$1 where id=$2",[PUB,DRAFT]);
  await rejected("update public.events set publication_status='archived',merged_into_event_id=$1 where id=$2","23514",[DRAFT,PUB]);
  await rejected("insert into public.duplicate_reviews(event_a_id,event_b_id,signals) values ($1,$1,'{}')","23514",[PUB]);
}));
test("audit history is append-only even for service role", async () => asRole("service_role",null,async () => {
  await rejected("update public.event_changes set reason='tampered'","23514");
  await rejected("delete from public.event_changes","23514");
}));
test("source permission must be evidenced, approved and unexpired before enabling", async () => asRole("service_role",null,async () => {
  await rejected("update public.source_connectors set enabled=true where id=$1","23514",[CON]);
  await rejected("update public.source_connectors set enabled=true,permission_state='approved',permission_evidence='{\"test\":true}',permission_review_expires_at=now()-interval '1 day' where id=$1","23514",[CON]);
}));

test("eligibility JSON is versioned, bounded and evidence-bearing, with unresolved facts explicit", async () => asRole("service_role",null,async () => {
  for(const value of [
    {}, {version:2,expression:{op:"all",rules:[]}},
    {version:1,expression:{op:"all",rules:[]}},
    {version:1,expression:{op:"eval",code:"true"}},
    {version:1,expression:{op:"predicate",field:"degree",operator:"in",value:[]}},
    {version:1,expression:{op:"predicate",field:"study_year",operator:"eq",value:0,evidence:"test"}},
    {version:1,expression:{op:"predicate",field:"degree",operator:"eq",value:"btech"}}
  ]) await rejected("update public.events set eligibility_rules=$1 where id=$2","23514",[JSON.stringify(value),DRAFT]);
  const valid={version:1,expression:{op:"all",rules:[
    {op:"predicate",field:"study_year",operator:"in",value:[1,2],evidence:"test-source-rule"},
    {op:"unresolved",reason:"Residency restriction not represented in the profile"}
  ]}};
  await db.query("update public.events set eligibility_rules=$1 where id=$2",[JSON.stringify(valid),DRAFT]);
}));
test("public URLs cannot be changed without matching source evidence", async () => asRole("service_role",null,async () => {
  await db.exec("savepoint bad_url");
  let caught;
  try {
    await db.query("update public.events set registration_url='https://different.example.test' where id=$1",[PUB]);
    await db.exec("set constraints all immediate");
  } catch(e) { caught=e; }
  await db.exec("rollback to savepoint bad_url");
  assert.equal(caught?.code,"23514");
}));
test("revoked membership immediately removes staff powers", async () => {
  await db.exec("begin");
  try {
    await db.query("delete from public.admin_memberships where user_id=$1",[ADMIN]);
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ADMIN]);
    assert.equal((await db.query("select private.is_admin() allowed")).rows[0].allowed,false);
    assert.equal((await db.query("update public.events set title='Unauthorized' where id=$1 returning *",[DRAFT])).rows.length,0);
  } finally { await db.exec("rollback"); }
});

