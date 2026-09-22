-- C13: reuse existing profile columns/RLS; reference vocabulary and atomic section saves.
begin;
insert into public.interests(id,slug,name) values
 (md5('c13:interests:ai-ml')::uuid,'ai-ml','Artificial Intelligence / ML'),
 (md5('c13:interests:web-development')::uuid,'web-development','Web Development'),
 (md5('c13:interests:app-development')::uuid,'app-development','App Development'),
 (md5('c13:interests:cybersecurity')::uuid,'cybersecurity','Cybersecurity'),
 (md5('c13:interests:robotics')::uuid,'robotics','Robotics'),
 (md5('c13:interests:data-science')::uuid,'data-science','Data Science'),
 (md5('c13:interests:open-source')::uuid,'open-source','Open Source'),
 (md5('c13:interests:cloud')::uuid,'cloud','Cloud'),
 (md5('c13:interests:blockchain')::uuid,'blockchain','Blockchain'),
 (md5('c13:interests:entrepreneurship')::uuid,'entrepreneurship','Entrepreneurship'),
 (md5('c13:interests:product')::uuid,'product','Product'),
 (md5('c13:interests:design')::uuid,'design','Design')
on conflict (slug) do nothing;
insert into public.skills(id,slug,name) values
 (md5('c13:skills:python')::uuid,'python','Python'),
 (md5('c13:skills:javascript')::uuid,'javascript','JavaScript'),
 (md5('c13:skills:typescript')::uuid,'typescript','TypeScript'),
 (md5('c13:skills:java')::uuid,'java','Java'),
 (md5('c13:skills:c')::uuid,'c','C'),
 (md5('c13:skills:cpp')::uuid,'cpp','C++'),
 (md5('c13:skills:react')::uuid,'react','React'),
 (md5('c13:skills:nextjs')::uuid,'nextjs','Next.js'),
 (md5('c13:skills:sql')::uuid,'sql','SQL'),
 (md5('c13:skills:machine-learning')::uuid,'machine-learning','Machine Learning'),
 (md5('c13:skills:git')::uuid,'git','Git'),
 (md5('c13:skills:ui-ux')::uuid,'ui-ux','UI/UX')
on conflict (slug) do nothing;

create function private.c13_profile_valid(p public.profiles) returns boolean
language sql immutable set search_path='' as $$
 select
 (p.name is null or (length(btrim(p.name)) between 1 and 100)) and
 (p.institution is null or length(btrim(p.institution)) between 1 and 200) and
 (p.degree is null or length(btrim(p.degree)) between 1 and 100) and
 (p.city is null or length(btrim(p.city)) between 1 and 100) and
 (p.study_year is null or p.study_year between 1 and 20) and
 (p.preferred_team_min is null or p.preferred_team_min between 1 and 100) and
 (p.preferred_team_max is null or p.preferred_team_max between 1 and 100) and
 not exists(select 1 from unnest(array[p.name,p.institution,p.degree,p.city]) v where v ~ '[[:cntrl:]]') and
 (p.portfolio_links is null or (cardinality(p.portfolio_links) between 1 and 5 and not exists(
   select 1 from unnest(p.portfolio_links) u where u is null or length(u)>2048 or
   u !~ '^https?://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]<>]*)?$' or
   u ~ '[[:cntrl:]]' or strpos(u,chr(92))>0)))
$$;
revoke all on function private.c13_profile_valid(public.profiles) from public;
grant execute on function private.c13_profile_valid(public.profiles) to authenticated,service_role;
-- Existing legacy rows are preserved; all subsequent inserts/updates are checked.
alter table public.profiles add constraint c13_profile_values check (private.c13_profile_valid(profiles)) not valid;

create function public.save_profile_section(section text, values_json jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare uid uuid := auth.uid(); p public.profiles; allowed text[]; ids uuid[]; k text; v jsonb;
begin
 if uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if values_json is null or jsonb_typeof(values_json)<>'object' or octet_length(values_json::text)>16384 then
   raise exception 'invalid_profile' using errcode='22023'; end if;
 allowed := case section
   when 'about' then array['name','city','country']
   when 'education' then array['institution','degree','study_year']
   when 'interests' then array['ids'] when 'skills' then array['ids']
   when 'preferences' then array['preferred_categories','any_category','preferred_modes','willingness_to_travel','preferred_team_min','preferred_team_max']
   when 'links' then array['portfolio_links'] end;
 if allowed is null or exists(select 1 from jsonb_object_keys(values_json) x where not x=any(allowed)) then
   raise exception 'invalid_profile' using errcode='22023'; end if;
 -- Lock the existing C04 bootstrap row. Never initialize or overwrite identity here.
 select * into p from public.profiles where user_id=uid for update;
 if not found then raise exception 'profile_unavailable' using errcode='22023'; end if;
 if section in ('interests','skills') then
   if jsonb_typeof(values_json->'ids') is distinct from 'array' or jsonb_array_length(values_json->'ids')>30 or
     exists(select 1 from jsonb_array_elements(values_json->'ids') x where jsonb_typeof(x)<>'string') then
     raise exception 'invalid_profile' using errcode='22023'; end if;
   select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(values_json->'ids') x;
   if section='interests' then
     if exists(select 1 from unnest(ids) x where not exists(select 1 from public.interests where id=x)) then raise exception 'invalid_vocabulary' using errcode='23503'; end if;
     delete from public.user_interests where user_id=uid;
     insert into public.user_interests(user_id,interest_id) select uid,unnest(ids);
   else
     if exists(select 1 from unnest(ids) x where not exists(select 1 from public.skills where id=x)) then raise exception 'invalid_vocabulary' using errcode='23503'; end if;
     delete from public.user_skills where user_id=uid;
     insert into public.user_skills(user_id,skill_id) select uid,unnest(ids);
   end if;
   update public.profiles set updated_at=now() where user_id=uid;
 else
   for k,v in select * from jsonb_each(values_json) loop
     if v='null'::jsonb then continue; end if;
     if k in ('name','city','country','institution','degree') then
       if jsonb_typeof(v)<>'string' then raise exception 'invalid_profile' using errcode='22023'; end if;
       values_json:=jsonb_set(values_json,array[k],coalesce(to_jsonb(nullif(btrim(v#>>'{}'),'')),'null'::jsonb));
     elsif k in ('study_year','preferred_team_min','preferred_team_max') then
       if jsonb_typeof(v)<>'number' or v::text !~ '^[1-9][0-9]*$' then raise exception 'invalid_profile' using errcode='22023'; end if;
     elsif k in ('any_category','willingness_to_travel') then
       if jsonb_typeof(v)<>'boolean' then raise exception 'invalid_profile' using errcode='22023'; end if;
     else
       if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>30 or
         exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'string') then raise exception 'invalid_profile' using errcode='22023'; end if;
     end if;
   end loop;
   p:=jsonb_populate_record(p,values_json);
   update public.profiles set name=p.name,city=p.city,country=p.country,institution=p.institution,degree=p.degree,study_year=p.study_year,
     preferred_categories=p.preferred_categories,any_category=p.any_category,preferred_modes=p.preferred_modes,
     willingness_to_travel=p.willingness_to_travel,preferred_team_min=p.preferred_team_min,preferred_team_max=p.preferred_team_max,
     portfolio_links=p.portfolio_links where user_id=uid;
 end if;
 return true;
end;
$$;
revoke all on function public.save_profile_section(text,jsonb) from public,anon,service_role;
grant execute on function public.save_profile_section(text,jsonb) to authenticated;
comment on function public.save_profile_section(text,jsonb) is 'C13 own profile section update, authenticated RLS, no client-supplied identity; atomic with relationships.';
commit;
