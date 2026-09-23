import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture,A,B} from './harness.mjs';
import {load,profile,event,doc,pred} from '../recommendations/harness.mjs';
import {fixtureId} from '../events/c06-harness.mjs';
const {rankCandidates}=await import(await load('src/lib/for-you/ranking.ts'));
const card=(n,facts=event())=>({event:{id:fixtureId(n),status:facts.status,registration_status:facts.registration_status},facts});
let f;before(async()=>{f=await fixture();});after(async()=>f?.close());
test('RPC only published candidates, excludes draft/review/unpublished/archived',async()=>{const r=(await f.rpc()).data;assert.equal(r.has_published,true);assert.equal(r.items.length,28);assert(r.items.every(i=>Number(i.id.slice(-12))<=28));assert.deepEqual(Object.keys(r.items[0]).sort(),['id','version']);});
test('RPC deterministic ordering and profile hints improve position, without eligibility filtering',async()=>{const a=(await f.rpc()).data;assert.deepEqual(a,(await f.rpc()).data);assert.equal(a.items[0].id,f.id);f.setUser(B);const b=(await f.rpc()).data;assert.equal(b.items.length,a.items.length);f.setUser(A);});
test('each category/topic/skill/mode hint improves retrieval independently',async()=>{for(const change of ["category_id=(select id from public.event_categories where slug='workshop')","mode='offline'"]){const original=(await f.db.query('select category_id,mode from public.events where id=$1',[fixtureId(2)])).rows[0];try{await f.db.query('update public.events set '+change+' where id=$1',[fixtureId(2)]);f.setUser(B);assert.equal((await f.rpc()).data.items[0].id,fixtureId(2));}finally{await f.db.query('update public.events set category_id=$2,mode=$3 where id=$1',[fixtureId(2),original.category_id,original.mode]);f.setUser(A);}}});
test('anonymous actual service does not read personalized data',async()=>{f.setUser(null);f.calls.length=0;assert.deepEqual(await f.service.readForYou(),{kind:'anonymous'});assert.equal(f.calls.length,0);await assert.rejects(f.rpc());f.setUser(A);});
test('own identity cannot be overridden and minimal output hides private facts',async()=>{const a=await f.service.readForYou(B);assert.equal(a.kind,'ready');assert.equal(a.best[0].event.id,f.id);const text=JSON.stringify(a);for(const sentinel of ['PRIVATE_A','PRIVATE_B','eligibility_rules','raw_storage_ref','portfolio_links'])assert(!text.includes(sentinel));f.setUser(B);assert.equal((await f.service.readForYou(A)).best.length,0);f.setUser(A);});
test('service is bounded and bulk, never per-event queries or service role',async()=>{f.calls.length=0;await f.service.readForYou();const queries=f.calls.filter(c=>c.table==='events');assert.equal(queries.length,2);assert(queries.every(q=>q.limit===100&&q.filters.some(x=>x[0]==='id'&&x[1]==='= any')));const s=await readFile('src/lib/for-you/service.ts','utf8');assert(!s.includes('createService')&&!s.includes('SUPABASE_SECRET'));assert(s.includes('rankCandidates'));});
test('event version/visibility recheck prevents outdated cards',async()=>{f.hide(true);const r=await f.service.readForYou();assert.equal(r.best.length+r.review.length,0);f.hide(false);});
test('database errors fail unavailable without invented empty inventory',async()=>{f.fail(true);assert.deepEqual(await f.service.readForYou(),{kind:'unavailable'});f.fail(false);});
test('best sorted by exact C14 score then coverage then UUID',()=>{const result=rankCandidates(profile(),[card(3),card(2),card(1,{...event(),tags:[{kind:'domain',tag:'design',skill_id:null}]})]);assert.deepEqual(result.best.map(x=>x.event.id),[fixtureId(2),fixtureId(3),fixtureId(1)]);assert.equal(result.best[0].score,100);});
test('coverage breaks equal-score ties',()=>{const r=rankCandidates(profile(),[card(1,{...event(),tags:event().tags.filter(t=>t.kind==='domain')}),card(2)]);assert.equal(r.best[0].event.id,fixtureId(2));assert.equal(r.best[1].score,100);});
test('unknown and low-coverage are reviewing, ineligible never best',()=>{const r=rankCandidates(profile(),[card(1,{...event(),eligibility_rules:null}),card(2,{...event(),tags:[]}),card(3,{...event(),eligibility_rules:doc(pred('study_year','eq',9))})]);assert.equal(r.best.length,0);assert.equal(r.review.length,2);assert(r.review.every(x=>x.score===null));});
for(const patch of [{status:'completed'},{status:'cancelled'},{registration_status:'closed'}])test('known availability excluded '+JSON.stringify(patch),()=>{const r=rankCandidates(profile(),[card(1,{...event(),...patch})]);assert.equal(r.best.length+r.review.length,0);});
test('partial and empty profile do not require onboarding or fabricate score',()=>{for(const p of [{}, {...profile(),degree:null}]){const r=rankCandidates(p,[card(1)]);assert.equal(r.best.length,0);assert.equal(r.review[0].score,null);}});
test('repeated ranking deterministic; profile changes predictable; malformed safe',()=>{const a=rankCandidates(profile(),[card(1)]);assert.deepEqual(a,rankCandidates(profile(),[card(1)]));assert.equal(rankCandidates({...profile(),study_year:9},[card(1)]).best.length,0);assert.equal(rankCandidates({degree:[]},[card(1)]).best.length,0);assert.throws(()=>rankCandidates(profile(),Array(101).fill(card(1))));});
test('route uses auth guard, accepts no browser identity, C12 stays independent',async()=>{const route=await readFile('src/app/for-you/page.tsx','utf8');assert(route.includes('requireIdentity("/for-you")'));assert(!route.includes('searchParams')&&!route.includes('user_id'));const search=await readFile('src/lib/events/public-search.ts','utf8');assert(!search.includes('for-you'));});
test('individual interest and skill retrieval signals use own controlled selections',async()=>{
 const original=(await f.db.query('select preferred_categories,preferred_modes from public.profiles where user_id=$1',[A])).rows[0];
 try{
  await f.db.query('update public.profiles set preferred_categories=null,preferred_modes=null where user_id=$1',[A]);
  for(const kind of ['domain','skill']){
   const tags=(await f.db.query('select kind,tag,skill_id from public.event_tags where event_id=$1',[f.id])).rows;
   await f.db.query('delete from public.event_tags where event_id=$1',[f.id]);
   const tag=tags.find(t=>t.kind===kind);
   await f.db.query('insert into public.event_tags(event_id,kind,tag,skill_id) values($1,$2,$3,$4)',[fixtureId(2),tag.kind,tag.tag,tag.skill_id]);
   assert.equal((await f.rpc()).data.items[0].id,fixtureId(2));
   await f.db.query('delete from public.event_tags where event_id=$1',[fixtureId(2)]);
   for(const t of tags)await f.db.query('insert into public.event_tags(event_id,kind,tag,skill_id) values($1,$2,$3,$4)',[f.id,t.kind,t.tag,t.skill_id]);
  }
 }finally{await f.db.query('update public.profiles set preferred_categories=$2,preferred_modes=$3 where user_id=$1',[A,original.preferred_categories,original.preferred_modes]);}
});
test('empty profile still gets bounded candidates, genuine empty inventory distinct',async()=>{
 const C='15000000-0000-0000-0000-000000000001';await f.db.query('insert into auth.users(id)values($1)',[C]);await f.db.query('insert into public.profiles(user_id)values($1)',[C]);f.setUser(C);
 try{const r=await f.service.readForYou();assert.equal(r.kind,'ready');assert.equal(r.best.length,0);assert.equal(r.missingSections.length,5);assert(r.review.length>0);}finally{f.setUser(A);await f.db.query('delete from auth.users where id=$1',[C]);}
});
test('RPC invoker, bounded, no identity parameter, anonymous execute revoked',async()=>{const r=(await f.db.query("select prosecdef,pronargs,has_function_privilege('anon','public.for_you_candidates()','EXECUTE') anon from pg_proc where proname='for_you_candidates'")).rows[0];assert.equal(r.prosecdef,false);assert.equal(r.pronargs,0);assert.equal(r.anon,false);});
test('current event version changes recommendation using current facts',async()=>{const before=(await f.db.query('select eligibility_rules,version from public.events where id=$1',[f.id])).rows[0];try{await f.db.query('update public.events set eligibility_rules=$2 where id=$1',[f.id,doc(pred('study_year','eq',9))]);const current=(await f.db.query('select version from public.events where id=$1',[f.id])).rows[0];assert(current.version>before.version);assert(!(await f.service.readForYou()).best.some(x=>x.event.id===f.id));}finally{await f.db.query('update public.events set eligibility_rules=$2 where id=$1',[f.id,before.eligibility_rules]);}});
test('retrieval excludes explicitly closed cancelled completed events',async()=>{for(const change of ["status='cancelled'","status='completed'","registration_status='closed'"]){try{await f.db.query('update public.events set '+change+' where id=$1',[f.id]);assert(!(await f.rpc()).data.items.some(x=>x.id===f.id));}finally{await f.db.query("update public.events set status='scheduled',registration_status='open' where id=$1",[f.id]);}}});
test('genuine empty inventory differs from available inventory with no matches',async()=>{await f.db.exec("update public.events set publication_status='unpublished' where publication_status='published'");const r=await f.service.readForYou();assert.equal(r.kind,'ready');assert.equal(r.hasPublished,false);assert.deepEqual(r.best,[]);assert.deepEqual(r.review,[]);});
