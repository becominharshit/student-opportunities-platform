-- C03: canonical V0.1 schema. No credentials, source connectors, or event seeds.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create function private.nonempty_text_array(a text[]) returns boolean
language sql immutable set search_path = '' as $$
  select a is null or (cardinality(a) > 0 and not exists (
    select 1 from unnest(a) x where x is null or btrim(x) = ''));
$$;
create function private.positive_int_array(a integer[]) returns boolean
language sql immutable set search_path = '' as $$
  select a is null or (cardinality(a) > 0 and not exists (
    select 1 from unnest(a) x where x is null or x < 1));
$$;
create function private.https_url(u text) returns boolean
language sql immutable set search_path = '' as $$
  select u is null or u ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]<>]*)?$';
$$;
create function private.valid_zone(z text) returns boolean
language sql stable set search_path = '' as $$
  select z is null or exists(select 1 from pg_catalog.pg_timezone_names where name = z);
$$;
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.created_at := old.created_at; return new; end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text check (name is null or btrim(name) <> ''),
  institution text, degree text, study_year integer check (study_year > 0),
  city text, country text check (country ~ '^[A-Z]{2}$'),
  preferred_categories text[] check (
    private.nonempty_text_array(preferred_categories) and
    preferred_categories <@ array['hackathon','coding_competition','workshop','conference','student_technology_event']),
  any_category boolean, preferred_modes text[] check (
    private.nonempty_text_array(preferred_modes) and preferred_modes <@ array['online','offline','hybrid']),
  willingness_to_travel boolean,
  preferred_team_min integer check (preferred_team_min > 0),
  preferred_team_max integer check (preferred_team_max > 0),
  portfolio_links text[] check (private.nonempty_text_array(portfolio_links)),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (preferred_team_min <= preferred_team_max),
  check (any_category is not true or preferred_categories is null)
);
create table public.interests (
  id uuid primary key default gen_random_uuid(), slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> '')
);
create table public.skills (
  id uuid primary key default gen_random_uuid(), slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''), unique(id, slug)
);
create table public.user_interests (
  user_id uuid not null references auth.users(id) on delete cascade,
  interest_id uuid not null references public.interests(id),
  primary key(user_id, interest_id)
);
create table public.user_skills (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id),
  primary key(user_id, skill_id)
);
create table public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_memberships where user_id = (select auth.uid()) and role = 'admin');
$$;

create table public.organizers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  website text check (private.https_url(website)),
  normalized_identity text not null unique check (btrim(normalized_identity) <> ''),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('hackathon','coding_competition','workshop','conference','student_technology_event')),
  name text not null check (btrim(name) <> '')
);
insert into public.event_categories(slug,name) values
 ('hackathon','Hackathons'), ('coding_competition','Coding competitions'),
 ('workshop','Workshops'), ('conference','Conferences'),
 ('student_technology_event','Student technology events');

create table public.source_connectors (
  id uuid primary key default gen_random_uuid(), name text not null check (btrim(name) <> ''),
  source_url text not null check (private.https_url(source_url)),
  type text not null check (type in ('api','feed','structured_page','permitted_scrape')),
  enabled boolean not null default false,
  permission_state text not null default 'unknown' check (permission_state in ('unknown','approved','denied','expired')),
  permission_evidence jsonb check (jsonb_typeof(permission_evidence) = 'object'),
  policy_metadata jsonb check (jsonb_typeof(policy_metadata) = 'object'),
  permission_review_expires_at timestamptz,
  last_sync timestamptz, last_successful_sync timestamptz,
  status text not null default 'idle' check (status in ('idle','running','succeeded','partial','failed','disabled')),
  error_count integer not null default 0 check (error_count >= 0),
  next_due_at timestamptz, lease_token uuid, lease_expires_at timestamptz,
  fencing_token bigint not null default 0 check (fencing_token >= 0),
  checkpoint jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((lease_token is null) = (lease_expires_at is null)),
  check (not enabled or (permission_state = 'approved' and permission_evidence is not null
    and permission_evidence <> '{}'::jsonb and permission_review_expires_at is not null))
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (btrim(title) <> ''),
  short_description text, full_description text, participation_process text,
  organizer_id uuid references public.organizers(id), category_id uuid references public.event_categories(id),
  official_url text check (private.https_url(official_url)),
  registration_url text check (private.https_url(registration_url)),
  image_url text check (private.https_url(image_url)),
  image_rights jsonb check (jsonb_typeof(image_rights) = 'object'),
  start_date date, end_date date, start_at timestamptz, end_at timestamptz,
  timezone text check (private.valid_zone(timezone)),
  date_precision text not null default 'unknown' check (date_precision in ('unknown','date_only','datetime')),
  date_metadata jsonb check (jsonb_typeof(date_metadata) = 'object'),
  mode text check (mode in ('online','offline','hybrid')),
  venue text, city text, state text, country text check (country ~ '^[A-Z]{2}$'),
  latitude numeric check (latitude between -90 and 90),
  longitude numeric check (longitude between -180 and 180),
  eligibility_text text,
  eligibility_rules jsonb check (jsonb_typeof(eligibility_rules) = 'object'),
  eligible_years integer[] check (private.positive_int_array(eligible_years)),
  eligible_degrees text[] check (private.nonempty_text_array(eligible_degrees)),
  individual_allowed boolean,
  min_team_size integer check (min_team_size > 0), max_team_size integer check (max_team_size > 0),
  fee numeric(18,2) check (fee >= 0 and fee <> 'NaN'::numeric),
  fee_max numeric(18,2) check (fee_max >= 0 and fee_max <> 'NaN'::numeric),
  fee_status text not null default 'unknown' check (fee_status in ('unknown','free','paid','varies')),
  fee_basis text not null default 'unknown' check (fee_basis in ('unknown','person','team','other')),
  currency text check (currency ~ '^[A-Z]{3}$'),
  prize_pool numeric(18,2) check (prize_pool >= 0 and prize_pool <> 'NaN'::numeric),
  prize_currency text check (prize_currency ~ '^[A-Z]{3}$'), prize_description text,
  status text not null default 'unknown' check (status in ('announced','scheduled','ongoing','completed','postponed','cancelled','unknown')),
  registration_status text not null default 'unknown' check (registration_status in ('not_open','open','closed','unknown')),
  publication_status text not null default 'draft' check (publication_status in ('draft','review','published','unpublished','archived')),
  verification_level text check (verification_level in ('verified','source_confirmed','community_submitted')),
  verification_status text not null default 'pending' check (verification_status in ('pending','current','stale','conflicted','rejected')),
  last_checked_at timestamptz, source_updated_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  merged_into_event_id uuid references public.events(id),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(short_description,'')), 'B')
  ) stored,
  check (start_date <= end_date), check (start_at <= end_at),
  check (min_team_size <= max_team_size),
  check (fee <= fee_max),
  check ((fee is null and fee_max is null) or currency is not null),
  check (prize_pool is null or prize_currency is not null),
  check (fee_status <> 'unknown' or (fee is null and fee_max is null)),
  check (fee_status <> 'free' or ((fee is null or fee = 0) and (fee_max is null or fee_max = 0))),
  check (fee_status <> 'paid' or (fee is null or fee > 0)),
  check (image_url is null or (image_rights is not null and image_rights <> '{}'::jsonb)),
  check (merged_into_event_id is null or (merged_into_event_id <> id and publication_status = 'archived')),
  check (publication_status <> 'published' or (
    short_description is not null and btrim(short_description) <> '' and organizer_id is not null and category_id is not null
    and official_url is not null and registration_url is not null and last_checked_at is not null
    and verification_level is not null and verification_status in ('current','stale'))),
  check ((date_precision <> 'unknown') or (start_date is null and end_date is null and start_at is null and end_at is null)),
  check ((date_precision <> 'date_only') or ((start_date is not null or end_date is not null) and start_at is null and end_at is null)),
  check ((date_precision <> 'datetime') or ((start_at is not null or end_at is not null) and timezone is not null)),
  check (start_at is null or (start_date is not null and timezone is not null and (start_at at time zone timezone)::date = start_date)),
  check (end_at is null or (end_date is not null and timezone is not null and (end_at at time zone timezone)::date = end_date))
);
create table public.event_tags (
  event_id uuid not null references public.events(id) on delete cascade,
  tag text not null check (btrim(tag) <> ''),
  kind text not null check (kind in ('domain','skill')),
  skill_id uuid,
  primary key(event_id, tag, kind),
  foreign key(skill_id, tag) references public.skills(id, slug),
  check ((kind = 'skill' and skill_id is not null) or (kind = 'domain' and skill_id is null))
);
create table public.event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id),
  connector_id uuid not null references public.source_connectors(id),
  external_id text not null check (btrim(external_id) <> ''),
  source_url text not null check (private.https_url(source_url)),
  normalized_url text not null check (private.https_url(normalized_url)),
  raw_storage_ref text, content_hash text, parser_version text,
  last_attempt_at timestamptz, last_checked_at timestamptz, source_updated_at timestamptz,
  availability text not null default 'unknown' check (availability in ('unknown','available','missing','unavailable')),
  validated_observation jsonb check (jsonb_typeof(validated_observation) = 'object'),
  field_evidence jsonb check (jsonb_typeof(field_evidence) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(connector_id, external_id), unique(id, event_id)
);
create table public.event_deadlines (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('registration','submission','stage')),
  label text not null check (btrim(label) <> ''),
  local_date date, due_at timestamptz,
  timezone text check (private.valid_zone(timezone)),
  precision text not null default 'unknown' check (precision in ('unknown','date_only','datetime')),
  source_id uuid, active boolean not null default true, is_primary boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(source_id, event_id) references public.event_sources(id, event_id),
  check (not is_primary or kind = 'registration'),
  check (
    (precision = 'unknown' and local_date is null and due_at is null) or
    (precision = 'date_only' and local_date is not null and due_at is null) or
    (precision = 'datetime' and local_date is not null and due_at is not null and timezone is not null
      and (due_at at time zone timezone)::date = local_date))
);
create table public.event_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  event_version integer not null check (event_version > 0),
  actor_id uuid references auth.users(id) on delete set null,
  source_id uuid references public.event_sources(id),
  reason text not null check (btrim(reason) <> ''),
  field_diff jsonb not null check (jsonb_typeof(field_diff) = 'object'),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique(event_id,event_version)
);
create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.source_connectors(id),
  trigger text not null check (trigger in ('scheduled','manual','retry')),
  started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null default 'running' check (status in ('running','succeeded','partial','failed','cancelled')),
  discovered_count integer not null default 0 check (discovered_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  cursor_start jsonb, cursor_end jsonb, error_summary text,
  item_errors jsonb check (jsonb_typeof(item_errors) = 'array' and octet_length(item_errors::text) <= 65536),
  error_overflow_ref text,
  check (finished_at >= started_at),
  check ((status = 'running' and finished_at is null) or (status <> 'running' and finished_at is not null))
);
create table public.saved_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id),
  created_at timestamptz not null default now(),
  primary key(user_id,event_id)
);
create table public.duplicate_reviews (
  id uuid primary key default gen_random_uuid(),
  event_a_id uuid not null references public.events(id),
  event_b_id uuid not null references public.events(id),
  signals jsonb not null check (jsonb_typeof(signals) = 'object'),
  status text not null default 'pending' check (status in ('pending','rejected','merged','reversed')),
  decision_reason text, decided_by uuid references auth.users(id) on delete set null, decided_at timestamptz,
  pre_merge_snapshot jsonb check (jsonb_typeof(pre_merge_snapshot) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(event_a_id,event_b_id), check (event_a_id < event_b_id),
  check (status = 'pending' or (decision_reason is not null and btrim(decision_reason) <> '' and decided_at is not null)),
  check (status not in ('merged','reversed') or pre_merge_snapshot is not null)
);

create index events_published_date_idx on public.events(start_date,id) where publication_status = 'published';
create index events_published_location_idx on public.events(mode,country,city,id) where publication_status = 'published';
create index events_category_idx on public.events(category_id);
create index events_organizer_idx on public.events(organizer_id);
create index events_merge_idx on public.events(merged_into_event_id) where merged_into_event_id is not null;
create index events_search_idx on public.events using gin(search_vector);
create index event_tags_lookup_idx on public.event_tags(tag,kind,event_id);
create index event_tags_skill_idx on public.event_tags(skill_id);
create index event_sources_event_idx on public.event_sources(event_id);
create index event_sources_url_idx on public.event_sources(normalized_url);
create unique index one_primary_registration_deadline on public.event_deadlines(event_id) where active and is_primary and kind = 'registration';
create index event_deadlines_due_idx on public.event_deadlines(due_at,event_id) where active;
create index event_deadlines_date_idx on public.event_deadlines(local_date,event_id) where active;
create index event_deadlines_source_idx on public.event_deadlines(source_id,event_id);
create index event_changes_source_idx on public.event_changes(source_id);
create index event_changes_actor_idx on public.event_changes(actor_id);
create index saved_events_event_idx on public.saved_events(event_id,created_at);
create index user_interests_interest_idx on public.user_interests(interest_id);
create index user_skills_skill_idx on public.user_skills(skill_id);
create index admin_memberships_granter_idx on public.admin_memberships(granted_by);
create index connectors_due_idx on public.source_connectors(next_due_at) where enabled;
create index sync_runs_connector_idx on public.sync_runs(connector_id,started_at desc);
create index duplicate_reviews_b_idx on public.duplicate_reviews(event_b_id);
create index duplicate_reviews_actor_idx on public.duplicate_reviews(decided_by);

-- Assign all policies/grants explicitly in migration 2 within the same replay.
-- Deny access immediately, even between migration files.
do $$ declare t text; begin
 foreach t in array array['profiles','interests','skills','user_interests','user_skills','admin_memberships',
 'organizers','event_categories','source_connectors','events','event_tags','event_sources',
 'event_deadlines','event_changes','sync_runs','saved_events','duplicate_reviews'] loop
   execute format('alter table public.%I enable row level security', t);
   execute format('revoke all on public.%I from anon, authenticated, public', t);
 end loop;
end $$;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.nonempty_text_array(text[]), private.positive_int_array(integer[]),
 private.https_url(text), private.valid_zone(text) to anon, authenticated, service_role;
commit;

