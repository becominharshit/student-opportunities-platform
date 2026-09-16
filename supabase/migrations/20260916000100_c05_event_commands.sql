-- C05: atomic user-context commands. Existing schema, policies and evidence guards remain authoritative.
begin;
create function public.mutate_event(command jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
 action text := command->>'action'; event_key uuid; expected integer;
 patch jsonb := coalesce(command->'event','{}'::jsonb);
 previous public.events; result public.events; old_tags jsonb; old_deadlines jsonb;
 current_tags jsonb; current_deadlines jsonb; diff jsonb := '{}'::jsonb;
 cols text; vals text; assignments text; key text; item jsonb; deadline_key uuid;
 target_state text; evidence jsonb;
begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='P0501'; end if;
 if not private.is_admin() then raise exception 'forbidden' using errcode='P0503'; end if;
 if jsonb_typeof(command) is distinct from 'object' or octet_length(command::text)>131072
 or action is null or action not in ('create','update','review','publish','unpublish','archive')
 or coalesce(length(btrim(command->>'reason')),0) not between 1 and 1000
 or jsonb_typeof(patch) is distinct from 'object'
 then raise exception 'validation' using errcode='P0522'; end if;
 if exists(select 1 from jsonb_object_keys(command) k where k not in ('action','id','expected_version','reason','event','tags','deadlines'))
 or exists(select 1 from jsonb_object_keys(patch) k where k not in ('slug','title','short_description','full_description','participation_process','organizer_id','category_id','official_url','registration_url','image_url','image_rights','start_date','end_date','start_at','end_at','timezone','date_precision','date_metadata','mode','venue','city','state','country','latitude','longitude','eligibility_text','eligibility_rules','eligible_years','eligible_degrees','individual_allowed','min_team_size','max_team_size','fee','fee_max','fee_status','fee_basis','currency','prize_pool','prize_currency','prize_description','status','registration_status','verification_level','verification_status','last_checked_at','source_updated_at'))
 then raise exception 'validation' using errcode='P0522'; end if;
 if action <> 'create' and patch ? 'slug' then raise exception 'immutable_slug' using errcode='P0522'; end if;
 if action not in ('create','update') and (patch <> '{}'::jsonb or command ? 'tags' or command ? 'deadlines')
 then raise exception 'validation' using errcode='P0522'; end if;
 if action='create' then
   if command ? 'id' or command ? 'expected_version' or not (patch ? 'title' and patch ? 'slug') then
     raise exception 'validation' using errcode='P0522'; end if;
   select string_agg(format('%I',k),','),string_agg(format('r.%I',k),',') into cols,vals from jsonb_object_keys(patch) k;
   execute format('insert into public.events (%s) select %s from jsonb_populate_record(null::public.events,$1) r returning *',cols,vals) into result using patch;
   event_key := result.id;
 else
   event_key := (command->>'id')::uuid; expected := (command->>'expected_version')::integer;
   if event_key is null or expected is null or expected < 1 then raise exception 'validation' using errcode='P0522'; end if;
   select * into previous from public.events where id=event_key for update;
   if not found then raise exception 'not_found' using errcode='P0504'; end if;
   if previous.version<>expected then raise exception 'version_conflict' using errcode='P0509'; end if;
   target_state := case action when 'review' then 'review' when 'publish' then 'published' when 'unpublish' then 'unpublished' when 'archive' then 'archived' else previous.publication_status end;
   if previous.publication_status='archived'
     or (action='review' and previous.publication_status not in ('draft','unpublished'))
     or (action='publish' and previous.publication_status<>'review')
     or (action='unpublish' and previous.publication_status<>'published')
   then raise exception 'invalid_transition' using errcode='P0522'; end if;
   if action='publish' and (previous.verification_status<>'current' or exists(
     select 1 from public.event_sources s cross join lateral jsonb_each(coalesce(s.field_evidence,'{}')) f
     where s.event_id=event_key and f.key in ('title','organizer','official_url','registration_url','dates','deadline','eligibility','team','fee','status','registration_status')
     and f.value->>'status' in ('conflicted','unresolved','rejected')) or exists(
     select 1 from public.duplicate_reviews where status='pending' and (event_a_id=event_key or event_b_id=event_key)))
   then raise exception 'publication_requirements' using errcode='P0512'; end if;
   select coalesce(jsonb_agg(to_jsonb(t) order by kind,tag),'[]') into old_tags from public.event_tags t where event_id=event_key;
   select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') into old_deadlines from public.event_deadlines d where event_id=event_key;
   patch := patch || jsonb_build_object('publication_status',target_state);
   select string_agg(format('%I = r.%I',k,k),',') into assignments from jsonb_object_keys(patch) k;
   execute format('update public.events e set %s from jsonb_populate_record(null::public.events,$1) r where e.id=$2 and e.version=$3 returning e.*',assignments)
     into result using patch,event_key,expected;
   if result.id is null then raise exception 'version_conflict' using errcode='P0509'; end if;
 end if;
 if command ? 'tags' then
   if jsonb_typeof(command->'tags') is distinct from 'array' or jsonb_array_length(command->'tags')>100 then raise exception 'validation' using errcode='P0522'; end if;
   delete from public.event_tags where event_id=event_key;
   for item in select value from jsonb_array_elements(command->'tags') loop
     if exists(select 1 from jsonb_object_keys(item) k where k not in ('kind','tag','skill_id')) then raise exception 'validation' using errcode='P0522'; end if;
     if item->>'kind'='domain' and not exists(select 1 from public.interests where slug=item->>'tag') then raise exception 'unknown_domain' using errcode='P0522'; end if;
     insert into public.event_tags(event_id,tag,kind,skill_id) values(event_key,item->>'tag',item->>'kind',(item->>'skill_id')::uuid);
   end loop;
 end if;
 if command ? 'deadlines' then
   if jsonb_typeof(command->'deadlines') is distinct from 'array' or jsonb_array_length(command->'deadlines')>100 then raise exception 'validation' using errcode='P0522'; end if;
   -- Replace the explicitly submitted collection, retaining stable IDs and original creation timestamps.
   for item in select value from jsonb_array_elements(command->'deadlines') loop
     if exists(select 1 from jsonb_object_keys(item) k where k not in ('id','kind','label','local_date','due_at','timezone','precision','source_id','active','is_primary'))
     then raise exception 'validation' using errcode='P0522'; end if;
     if item ? 'id' and not exists(select 1 from public.event_deadlines where id=(item->>'id')::uuid and event_id=event_key)
     then raise exception 'deadline_owner' using errcode='P0522'; end if;
   end loop;
   delete from public.event_deadlines where event_id=event_key;
   for item in select value from jsonb_array_elements(command->'deadlines') loop
     deadline_key := coalesce((item->>'id')::uuid,gen_random_uuid());
     insert into public.event_deadlines(id,event_id,kind,label,local_date,due_at,timezone,precision,source_id,active,is_primary,created_at)
     values(deadline_key,event_key,item->>'kind',item->>'label',(item->>'local_date')::date,(item->>'due_at')::timestamptz,
       item->>'timezone',item->>'precision',(item->>'source_id')::uuid,(item->>'active')::boolean,(item->>'is_primary')::boolean,
       coalesce((select (d->>'created_at')::timestamptz from jsonb_array_elements(old_deadlines) d where d->>'id'=deadline_key::text),now()));
   end loop;
 end if;
 -- Execute deferred C03 guards before returning, so no partial success can escape.
 set constraints all immediate;
 select coalesce(jsonb_agg(to_jsonb(t) order by kind,tag),'[]') into current_tags from public.event_tags t where event_id=event_key;
 select coalesce(jsonb_agg(to_jsonb(d)-'updated_at' order by id),'[]') into current_deadlines from public.event_deadlines d where event_id=event_key;
 for key in select jsonb_object_keys(to_jsonb(result)-array['search_vector','updated_at','created_at','version']) loop
   if to_jsonb(previous)->key is distinct from to_jsonb(result)->key then
     diff := diff || jsonb_build_object(key,jsonb_build_object('before',to_jsonb(previous)->key,'after',to_jsonb(result)->key));
   end if;
 end loop;
 if coalesce(old_tags,'[]')<>current_tags then diff:=diff||jsonb_build_object('tags',jsonb_build_object('before',coalesce(old_tags,'[]'),'after',current_tags)); end if;
 select coalesce(jsonb_agg(d-'updated_at' order by d->>'id'),'[]') into old_deadlines from jsonb_array_elements(old_deadlines) d;
 if old_deadlines<>current_deadlines then diff:=diff||jsonb_build_object('deadlines',jsonb_build_object('before',old_deadlines,'after',current_deadlines)); end if;
 select coalesce(jsonb_agg(jsonb_build_object('source_id',s.id,'source_url',s.source_url,'last_checked_at',s.last_checked_at,
   'validated_observation',s.validated_observation,'field_evidence',s.field_evidence) order by s.id),'[]') into evidence from public.event_sources s where s.event_id=event_key;
 insert into public.event_changes(event_id,event_version,actor_id,reason,field_diff,evidence_snapshot)
 values(event_key,result.version,auth.uid(),action||': '||(command->>'reason'),diff,jsonb_build_object('sources',evidence));
 return to_jsonb(result)-'search_vector';
end;
$$;
revoke all on function public.mutate_event(jsonb) from public,anon;
grant execute on function public.mutate_event(jsonb) to authenticated;
commit;
