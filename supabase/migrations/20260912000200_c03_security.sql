-- C03: RLS, publication integrity, and protected administrative membership.
begin;
grant execute on function private.is_admin() to authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Explicit table grants; RLS is still the row-level boundary.
grant select, insert, update, delete on public.events to authenticated;
create policy staff_all on public.events for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update, delete on public.organizers to authenticated;
create policy staff_all on public.organizers for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update, delete on public.event_categories to authenticated;
create policy staff_all on public.event_categories for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update, delete on public.event_tags to authenticated;
create policy staff_all on public.event_tags for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update, delete on public.event_deadlines to authenticated;
create policy staff_all on public.event_deadlines for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update, delete on public.interests to authenticated;
create policy staff_all on public.interests for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update, delete on public.skills to authenticated;
create policy staff_all on public.skills for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update, delete on public.source_connectors to authenticated;
create policy staff_all on public.source_connectors for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update, delete on public.event_sources to authenticated;
create policy staff_all on public.event_sources for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update, delete on public.sync_runs to authenticated;
create policy staff_all on public.sync_runs for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, insert, update, delete on public.duplicate_reviews to authenticated;
create policy staff_all on public.duplicate_reviews for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select on public.events to anon;
create policy public_read on public.events for select to anon, authenticated using (publication_status = 'published');
grant select on public.organizers to anon;
create policy public_read on public.organizers for select to anon, authenticated using (exists(select 1 from public.events e where e.organizer_id = organizers.id and e.publication_status = 'published'));
grant select on public.event_categories to anon;
create policy public_read on public.event_categories for select to anon, authenticated using (true);
grant select on public.event_tags to anon;
create policy public_read on public.event_tags for select to anon, authenticated using (exists(select 1 from public.events e where e.id = event_id and e.publication_status = 'published'));
grant select on public.event_deadlines to anon;
create policy public_read on public.event_deadlines for select to anon, authenticated using (exists(select 1 from public.events e where e.id = event_id and e.publication_status = 'published'));
grant select on public.interests to anon;
create policy public_read on public.interests for select to anon, authenticated using (true);
grant select on public.skills to anon;
create policy public_read on public.skills for select to anon, authenticated using (true);
grant select, insert, update, delete on public.profiles to authenticated;
create policy own_read on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy own_insert on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_update on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_delete on public.profiles for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.user_interests to authenticated;
create policy own_read on public.user_interests for select to authenticated using (user_id = (select auth.uid()));
create policy own_insert on public.user_interests for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_update on public.user_interests for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_delete on public.user_interests for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.user_skills to authenticated;
create policy own_read on public.user_skills for select to authenticated using (user_id = (select auth.uid()));
create policy own_insert on public.user_skills for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_update on public.user_skills for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_delete on public.user_skills for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.saved_events to authenticated;
create policy own_read on public.saved_events for select to authenticated using (user_id = (select auth.uid()));
create policy own_insert on public.saved_events for insert to authenticated with check (user_id = (select auth.uid()) and exists(select 1 from public.events e where e.id = event_id and e.publication_status = 'published'));
create policy own_delete on public.saved_events for delete to authenticated using (user_id = (select auth.uid()));

-- Staff cannot grant membership via user-context API calls. Bootstrap/changes
-- require a trusted server service credential or a database administrator.
grant select on public.admin_memberships to authenticated;
create policy staff_read on public.admin_memberships for select to authenticated using ((select private.is_admin()));
grant select, insert on public.event_changes to authenticated;
create policy staff_read on public.event_changes for select to authenticated using ((select private.is_admin()));
create policy staff_insert on public.event_changes for insert to authenticated with check ((select private.is_admin()));
grant all on public.profiles, public.interests, public.skills, public.user_interests, public.user_skills,
 public.admin_memberships, public.organizers, public.event_categories, public.source_connectors,
 public.events, public.event_tags, public.event_sources, public.event_deadlines, public.event_changes,
 public.sync_runs, public.saved_events, public.duplicate_reviews to service_role;

-- This intentionally owner-executed, security-barrier view is the only public
-- source API. Base records have NO anonymous grants or ordinary user policies.
-- Never add raw/policy/evidence/contact/diagnostic columns to this projection.
create view public.public_event_sources with (security_barrier = true) as
 select s.id, s.event_id, s.source_url, s.last_checked_at, c.name as source_name
 from public.event_sources s join public.events e on e.id = s.event_id
 join public.source_connectors c on c.id = s.connector_id
 where e.publication_status = 'published' and s.last_checked_at is not null
 and s.validated_observation is not null;
revoke all on public.public_event_sources from public, anon, authenticated;
grant select on public.public_event_sources to anon, authenticated, service_role;

create function private.event_version() returns trigger language plpgsql set search_path = '' as $$
begin
 if tg_op = 'INSERT' then
   if new.version <> 1 then raise exception 'Initial event version must be 1' using errcode = '23514'; end if;
 else
   if new.id <> old.id or new.slug <> old.slug then
     raise exception 'Event id and slug are immutable' using errcode = '23514';
   end if;
   if new.version <> old.version then
     raise exception 'Event version is database managed; use WHERE version = expected_version' using errcode = '23514';
   end if;
   new.version := old.version + 1;
   new.created_at := old.created_at;
 end if;
 new.updated_at := now();
 return new;
end;
$$;
create trigger event_version before insert or update on public.events for each row execute function private.event_version();

-- Serialize merge graph edits; no cycle can be committed.
create function private.merge_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.merged_into_event_id is not null then
   perform pg_catalog.pg_advisory_xact_lock(36003);
   if exists (
     with recursive chain as (
       select id, merged_into_event_id from public.events where id = new.merged_into_event_id
       union
       select e.id, e.merged_into_event_id from public.events e join chain c on e.id = c.merged_into_event_id
     ) select 1 from chain where id = new.id
   ) then raise exception 'Merge cycle rejected' using errcode = '23514'; end if;
 end if;
 return new;
end;
$$;
create trigger event_merge_guard before insert or update of merged_into_event_id on public.events
 for each row execute function private.merge_guard();

create function private.assert_publication(event_key uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if exists(select 1 from public.events where id = event_key and publication_status = 'published')
 and not exists (
   select 1 from public.event_sources s join public.events e on e.id = s.event_id
   where s.event_id = event_key and s.last_checked_at is not null
   and s.validated_observation->>'official_url' = e.official_url
   and s.validated_observation->>'registration_url' = e.registration_url
   and s.field_evidence->'official_url'->>'status' = 'checked'
   and s.field_evidence->'registration_url'->>'status' = 'checked'
 ) then raise exception 'Published event requires a checked source observation and field evidence' using errcode = '23514'; end if;
end;
$$;
create function private.publication_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if tg_table_name = 'events' then
   perform private.assert_publication(new.id);
 else
   if tg_op <> 'INSERT' then perform private.assert_publication(old.event_id); end if;
   if tg_op <> 'DELETE' then perform private.assert_publication(new.event_id); end if;
 end if;
 return null;
end;
$$;
create constraint trigger event_publication_guard after insert or update on public.events
 deferrable initially deferred for each row execute function private.publication_guard();
create constraint trigger source_publication_guard after insert or update or delete on public.event_sources
 deferrable initially deferred for each row execute function private.publication_guard();

-- Lock parent events before changing their evidence. Publication and evidence
-- mutations then serialize on the same rows, including source reassignment.
create function private.lock_source_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if tg_op = 'INSERT' then
   perform id from public.events where id = new.event_id for update;
 elsif tg_op = 'DELETE' then
   perform id from public.events where id = old.event_id for update;
 else
   perform id from public.events where id in (old.event_id, new.event_id) order by id for update;
 end if;
 if tg_op = 'DELETE' then return old; end if;
 return new;
end;
$$;
create trigger lock_source_events before insert or update or delete on public.event_sources
 for each row execute function private.lock_source_events();

create function private.audit_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
 -- Permit only FK-driven actor anonymization during auth.users deletion.
 if tg_op = 'UPDATE' and pg_trigger_depth() > 1 and new.actor_id is null
 and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then return new; end if;
 raise exception 'Event history is append-only' using errcode = '23514';
end;
$$;
create trigger event_changes_immutable before update or delete on public.event_changes
 for each row execute function private.audit_immutable();

create function private.permission_guard() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.enabled and new.permission_review_expires_at <= now() then
   raise exception 'Source permission has expired' using errcode = '23514';
 end if;
 return new;
end;
$$;
create trigger connector_permission_guard before insert or update on public.source_connectors
 for each row execute function private.permission_guard();
create trigger touch_updated_at before update on public.profiles for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.organizers for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.source_connectors for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.event_sources for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.event_deadlines for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.duplicate_reviews for each row execute function private.touch_updated_at();
-- Functions are internal implementation details, never public RPCs.
revoke all on function private.event_version(), private.merge_guard(), private.assert_publication(uuid),
 private.publication_guard(), private.lock_source_events(), private.audit_immutable(), private.permission_guard(), private.touch_updated_at()
 from public, anon, authenticated;
commit;
