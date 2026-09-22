-- C12 only: invoker-rights, published-only search. No source/connector changes.
begin;
create function public.search_published_events(filters jsonb, page_after jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; query tsquery; sort_name text := coalesce(filters->>'sort','relevance');
begin
 if jsonb_typeof(filters) <> 'object' or octet_length(filters::text) > 4096
 or sort_name not in ('relevance','deadline','event_date','newest')
 or length(coalesce(filters->>'q','')) > 200 then
   raise exception 'Invalid search parameters' using errcode='22023';
 end if;
 if page_after is not null and (jsonb_typeof(page_after) <> 'object'
   or not (page_after ? 'id') or not (page_after ? 'key')) then
   raise exception 'Invalid page cursor' using errcode='22023';
 end if;
 query := websearch_to_tsquery('simple'::regconfig, coalesce(filters->>'q',''));
 with candidates as (
   select e.*, o.name organizer_name, o.website organizer_website, c.slug category_slug, c.name category_name,
     d.local_date deadline_date,
     e.search_vector ||
       setweight(to_tsvector('simple'::regconfig,coalesce(o.name,'')), 'B') ||
       setweight(to_tsvector('simple'::regconfig,coalesce(tags.words,'')), 'C') document
   from public.events e
   left join public.organizers o on o.id=e.organizer_id
   left join public.event_categories c on c.id=e.category_id
   left join public.event_deadlines d on d.event_id=e.id and d.active and d.is_primary and d.kind='registration'
   left join lateral (select string_agg(t.tag,' ' order by t.kind,t.tag) words from public.event_tags t where t.event_id=e.id) tags on true
   where e.publication_status='published'
   and (not filters ? 'category' or c.slug=filters->>'category')
   and (not filters ? 'domain' or exists(select 1 from public.event_tags t where t.event_id=e.id and t.kind='domain' and lower(t.tag)=lower(filters->>'domain')))
   and (not filters ? 'mode' or coalesce(e.mode,'unknown')=filters->>'mode')
   and (not filters ? 'country' or e.country=filters->>'country')
   and (not filters ? 'city' or lower(e.city)=lower(filters->>'city'))
   and (not filters ? 'date_from' or e.start_date >= (filters->>'date_from')::date)
   and (not filters ? 'date_to' or e.start_date <= (filters->>'date_to')::date)
   and (not filters ? 'deadline_from' or d.local_date >= (filters->>'deadline_from')::date)
   and (not filters ? 'deadline_to' or d.local_date <= (filters->>'deadline_to')::date)
   and (not filters ? 'fee' or e.fee_status=filters->>'fee')
   and (not filters ? 'team' or
     (e.min_team_size is not null and e.max_team_size is not null and (filters->>'team')::integer between e.min_team_size and e.max_team_size)
     or ((filters->>'team')::integer=1 and e.individual_allowed is true))
   -- Direct structured arrays only. This is not eligibility evaluation.
   and (not filters ? 'year' or (filters->>'year')::integer=any(e.eligible_years))
   and (not filters ? 'degree' or exists(select 1 from unnest(e.eligible_degrees) degree where lower(degree)=lower(filters->>'degree')))
   and (not filters ? 'prize' or
     case filters->>'prize'
       when 'yes' then e.prize_pool>0 or nullif(btrim(e.prize_description),'') is not null
       when 'no' then e.prize_pool=0 and nullif(btrim(e.prize_description),'') is null
       when 'unknown' then e.prize_pool is null and nullif(btrim(e.prize_description),'') is null
       else false end)
   and (not filters ? 'registration' or e.registration_status=filters->>'registration')
 ), ranked as (
   select candidates.*, case sort_name
     when 'relevance' then -ts_rank(document,query)::numeric
     when 'deadline' then (deadline_date-date '1970-01-01')::numeric
     when 'event_date' then (start_date-date '1970-01-01')::numeric
     when 'newest' then -extract(epoch from created_at) end sort_key
   from candidates where not filters ? 'q' or document @@ query
 ), page as (
   select * from ranked r where page_after is null or
    (case when page_after->>'key' is null then r.sort_key is null and r.id>(page_after->>'id')::uuid
     else r.sort_key is null or r.sort_key>(page_after->>'key')::numeric or
       (r.sort_key=(page_after->>'key')::numeric and r.id>(page_after->>'id')::uuid) end)
   order by sort_key asc nulls last,id asc limit 25
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'key',p.sort_key::text,
   'card',jsonb_build_object(
     'id',p.id,'slug',p.slug,'title',p.title,'short_description',p.short_description,
     'start_date',p.start_date,'end_date',p.end_date,'start_at',p.start_at,'end_at',p.end_at,
     'timezone',p.timezone,'date_precision',p.date_precision,'mode',p.mode,'venue',p.venue,
     'city',p.city,'state',p.state,'country',p.country,'status',p.status,
     'registration_status',p.registration_status,'verification_level',p.verification_level,
     'verification_status',p.verification_status,'last_checked_at',p.last_checked_at,
     'organizers',jsonb_build_object('id',p.organizer_id,'name',p.organizer_name,'website',p.organizer_website),
     'event_categories',jsonb_build_object('id',p.category_id,'name',p.category_name,'slug',p.category_slug),
     'event_deadlines',coalesce((select jsonb_agg(jsonb_build_object(
       'id',d.id,'kind',d.kind,'label',d.label,'local_date',d.local_date,'due_at',d.due_at,
       'timezone',d.timezone,'precision',d.precision,'active',d.active,'is_primary',d.is_primary) order by d.id)
       from public.event_deadlines d where d.event_id=p.id and d.active and d.is_primary and d.kind='registration'),'[]'::jsonb)
   )) order by p.sort_key asc nulls last,p.id asc),'[]'::jsonb) into result from page p;
 return result;
end;
$$;
revoke all on function public.search_published_events(jsonb,jsonb) from public;
grant execute on function public.search_published_events(jsonb,jsonb) to anon, authenticated;
comment on function public.search_published_events(jsonb,jsonb) is
 'C12 bounded public card projection; SECURITY INVOKER plus explicit publication predicate. Dates compare source-local calendar days, nulls last; no eligibility claims.';
commit;
