-- C15: bounded own-profile candidate selection, not eligibility or match scoring.
begin;
create function public.for_you_candidates()
returns jsonb language sql stable security invoker set search_path = '' as $$
 with own as materialized (
  select p.preferred_categories,p.any_category,p.preferred_modes from public.profiles p where p.user_id=(select auth.uid())
 ), topics as materialized (
  select i.slug from public.user_interests u join public.interests i on i.id=u.interest_id where u.user_id=(select auth.uid())
 ), skills as materialized (
  select u.skill_id from public.user_skills u where u.user_id=(select auth.uid())
 ), pool as (
  select e.id,e.version,e.start_date,
   (case when p.any_category is true or c.slug=any(p.preferred_categories) then 1 else 0 end +
    case when e.mode=any(p.preferred_modes) or ('hybrid'=any(p.preferred_modes) and e.mode in ('online','offline')) or (e.mode='hybrid' and p.preferred_modes && array['online','offline']) then 1 else 0 end +
    case when exists(select 1 from public.event_tags t join topics i on i.slug=lower(btrim(t.tag)) where t.event_id=e.id and t.kind='domain') then 1 else 0 end +
    case when exists(select 1 from public.event_tags t join skills s on s.skill_id=t.skill_id where t.event_id=e.id and t.kind='skill') then 1 else 0 end) hints
  from public.events e left join public.event_categories c on c.id=e.category_id left join own p on true
  where (select auth.uid()) is not null and e.publication_status='published'
   and e.status not in ('cancelled','completed') and e.registration_status is distinct from 'closed'
  order by hints desc,e.start_date asc nulls last,e.id asc limit 100
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',version) order by hints desc,start_date asc nulls last,id) from pool),'[]'::jsonb),
 'has_published',exists(select 1 from public.events where publication_status='published' and (select auth.uid()) is not null));
$$;
revoke all on function public.for_you_candidates() from public,anon;
grant execute on function public.for_you_candidates() to authenticated;
comment on function public.for_you_candidates() is 'Own-profile hints select at most 100 published available candidates. Not eligibility/ranking; C14 remains authoritative. No caller identity argument.';
commit;
