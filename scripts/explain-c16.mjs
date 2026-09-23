import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fixture,A} from '../tests/saves/harness.mjs';
const f=await fixture();
try{
 await f.db.exec(`insert into public.events(slug,title,short_description,organizer_id,category_id,official_url,registration_url,verification_status,verification_level,last_checked_at)
 select 'c16-scale-'||n,'C16 ISOLATED fixture '||n,'Never production',e.organizer_id,e.category_id,e.official_url,e.registration_url,'current','community_submitted',now() from generate_series(1,5000)n cross join public.events e where e.slug='isolated-event-1';
 insert into public.event_sources(event_id,connector_id,external_id,source_url,normalized_url,last_checked_at,validated_observation,field_evidence)select e.id,s.connector_id,e.slug,s.source_url,s.normalized_url,now(),s.validated_observation,s.field_evidence from public.events e cross join public.event_sources s where e.slug like 'c16-scale-%' and s.external_id='1';
 update public.events set publication_status='published' where slug like 'c16-scale-%';`);
 await f.db.query("insert into public.saved_events(user_id,event_id,created_at)select $1,id,timestamptz '2026-09-23T12:00:00Z'+row_number()over(order by id)*interval '1 microsecond' from public.events where publication_status='published'",[A]);
 await f.db.exec('analyze public.saved_events; analyze public.events;');
 async function plan(){await f.db.exec('set role authenticated');await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);try{return (await f.db.query("explain(analyze,buffers,format text) select s.event_id,s.created_at from public.saved_events s join public.events e on e.id=s.event_id where s.user_id=$1 and e.publication_status='published' order by s.created_at desc,s.event_id desc limit 25",[A])).rows.map(x=>x['QUERY PLAN']).join('\n');}finally{await f.db.exec('reset role');}}
 const exists=(await f.db.query("select to_regclass('public.saved_events_user_order_idx') idx")).rows[0].idx;
 // Isolated database only: record a reproducible before/after plan.
 if(exists)await f.db.exec('drop index public.saved_events_user_order_idx');const before=await plan();
 await f.db.exec('create index saved_events_user_order_idx on public.saved_events(user_id,created_at desc,event_id desc); analyze public.saved_events;');const after=await plan();
 await f.db.exec('set role authenticated');await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
 let pagination,lookup;
 try{
  const cursor=(await f.db.query('select created_at::text created_at,event_id from public.saved_events where user_id=$1 order by created_at desc,event_id desc offset 2500 limit 1',[A])).rows[0];
  pagination=(await f.db.query("explain(analyze,buffers,format text) select s.event_id,s.created_at from public.saved_events s join public.events e on e.id=s.event_id where s.user_id=$1 and e.publication_status='published' and (s.created_at<$2 or (s.created_at=$2 and s.event_id<$3)) order by s.created_at desc,s.event_id desc limit 25",[A,cursor.created_at,cursor.event_id])).rows.map(x=>x['QUERY PLAN']).join('\n');
  lookup=(await f.db.query('explain(analyze,buffers,format text) select event_id from public.saved_events where user_id=$1 and event_id=any($2::uuid[]) limit 100',[A,[f.id]])).rows.map(x=>x['QUERY PLAN']).join('\n');
 }finally{await f.db.exec('reset role');}
 const page=await f.service.readSaved();assert.equal(page.kind,'ready');assert.equal(page.items.length,24);assert(page.nextCursor);f.calls.length=0;await f.service.loadSaveState(page.items.map(e=>e.id));assert.equal(f.calls.length,1);
 await mkdir('work/c16',{recursive:true});await writeFile('work/c16/performance.json',JSON.stringify({syntheticSaves:5028,pageSize:24,lookahead:25,saveStateReads:1,before,after,pagination,lookup},null,2));
 console.log('PASS: 5,028 isolated saves; 24-item page + 1 lookahead; one bulk state lookup.');console.log('BEFORE\n'+before+'\nAFTER\n'+after);
}finally{await f.close();}
