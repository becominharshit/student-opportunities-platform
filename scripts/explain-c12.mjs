import {readFile} from "node:fs/promises";
import {searchFixtures} from "../tests/events/c12-harness.mjs";
const f=await searchFixtures();
try {
 await f.db.exec(`
 insert into public.events(slug,title,short_description,organizer_id,category_id,official_url,registration_url,verification_status,verification_level,last_checked_at,date_precision,start_date,mode,country,city)
 select 'c12-scale-'||n,case when n%20=0 then 'Robotics research sprint '||n else 'Campus technology event '||n end,
 'Isolated synthetic performance fixture',e.organizer_id,e.category_id,e.official_url,e.registration_url,'current','community_submitted',now(),'date_only',date '2026-10-12'+(n%90),'online','IN','Pune'
 from generate_series(1,2000) n cross join public.events e where e.slug='isolated-event-1';
 insert into public.event_sources(event_id,connector_id,external_id,source_url,normalized_url,last_checked_at,validated_observation,field_evidence)
 select e.id,s.connector_id,e.slug,s.source_url,s.normalized_url,now(),s.validated_observation,s.field_evidence
 from public.events e cross join public.event_sources s
 where e.slug like 'c12-scale-%' and s.external_id='1';
 update public.events set publication_status='published' where slug like 'c12-scale-%';
 analyze public.events; analyze public.event_tags; analyze public.organizers; analyze public.event_deadlines;
 `);
 const migration=await readFile(new URL("../supabase/migrations/20260922000100_c12_public_search.sql",import.meta.url),"utf8");
 let sql=migration.slice(migration.indexOf(" with candidates as"),migration.indexOf(" return result;")).trim();
 sql=sql.replace(" into result","").replace(/\bfilters\b/g,"($1::jsonb)").replace(/\bpage_after\b/g,"(null::jsonb)").replace(/\bsort_name\b/g,"($1::jsonb->>'sort')").replace(/\bquery\b/g,"websearch_to_tsquery('simple'::regconfig,coalesce($1::jsonb->>'q',''))");
 await f.db.exec("set role anon");
 for(const params of [{q:"robotics",sort:"relevance"},{mode:"online",country:"IN",sort:"event_date"}]){
  const plan=await f.db.query("explain (analyze,buffers,format text) "+sql,[JSON.stringify(params)]);
  console.log("C12 2,028 published synthetic rows "+JSON.stringify(params)+"\n"+plan.rows.map(r=>r["QUERY PLAN"]).join("\n"));
 }
}finally{await f.db.exec("reset role");await f.close();}
