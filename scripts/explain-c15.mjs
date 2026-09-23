import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fixture,A} from '../tests/for-you/harness.mjs';
const f=await fixture();
try{
 await f.db.exec(`insert into public.events(slug,title,short_description,organizer_id,category_id,official_url,registration_url,verification_status,verification_level,last_checked_at,date_precision,start_date,mode,country,city)
 select 'c15-scale-'||n,'C15 ISOLATED synthetic '||n,'Never production',e.organizer_id,e.category_id,e.official_url,e.registration_url,'current','community_submitted',now(),'date_only',date '2026-10-12'+(n%90),'online','IN','Pune'
 from generate_series(1,5000) n cross join public.events e where e.slug='isolated-event-1';
 insert into public.event_sources(event_id,connector_id,external_id,source_url,normalized_url,last_checked_at,validated_observation,field_evidence)
 select e.id,s.connector_id,e.slug,s.source_url,s.normalized_url,now(),s.validated_observation,s.field_evidence from public.events e cross join public.event_sources s where e.slug like 'c15-scale-%' and s.external_id='1';
 update public.events set publication_status='published',eligibility_rules=(select eligibility_rules from public.events where slug='isolated-event-1') where slug like 'c15-scale-%';
 insert into public.event_tags(event_id,kind,tag)
 select id,'domain',case when (split_part(slug,'-',3)::integer)%2=0 then 'robotics' else 'design' end from public.events where slug like 'c15-scale-%';
 insert into public.event_tags(event_id,kind,tag,skill_id)
 select e.id,'skill',s.slug,s.id from public.events e cross join public.skills s where e.slug like 'c15-scale-%' and s.slug='python';
 analyze public.events; analyze public.event_tags; analyze public.profiles; analyze public.user_interests; analyze public.user_skills;`);
 const migration=await readFile('supabase/migrations/20260923000100_c15_for_you.sql','utf8'),sql=migration.split('as $$')[1].split('$$;')[0];
 await f.db.exec('set role authenticated');await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
 const plan=(await f.db.query('explain (analyze,buffers,format text) '+sql)).rows.map(r=>r['QUERY PLAN']).join('\n');
 await f.db.exec('reset role');
 const rpc=await f.rpc();assert.equal(rpc.data.items.length,100);assert.deepEqual(rpc.data, (await f.rpc()).data);
 f.calls.length=0;const result=await f.service.readForYou();assert.equal(result.kind,'ready');assert.equal(result.candidateCount,100);assert.equal(f.calls.filter(c=>c.table==='events').length,2);
 const report={syntheticPublishedRows:5028,candidates:100,evaluations:result.candidateCount,eventBulkReads:2,databaseCalls:f.calls.length,plan,measuredAt:new Date().toISOString()};
 await mkdir('work/c15',{recursive:true});await writeFile('work/c15/performance.json',JSON.stringify(report,null,2));console.log('PASS 5,028 synthetic published events; 100 candidates/evaluations; two bulk event reads; no event N+1.\n'+plan);
}finally{await f.db.exec('reset role');await f.close();}
