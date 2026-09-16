-- C08 generic runtime only. No source is inserted or enabled.
begin;
alter table public.sync_runs add column lease_token uuid,
 add column fencing_token bigint, add column parser_version text,
 add column policy_snapshot jsonb, add column request_count integer not null default 0 check(request_count >= 0);

create table public.connector_evidence (
 id uuid primary key default gen_random_uuid(),
 connector_id uuid not null references public.source_connectors(id),
 run_id uuid not null references public.sync_runs(id),
 external_id text not null check(length(external_id) between 1 and 256),
 source_url text not null check(private.https_url(source_url)),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 parser_version text not null check(parser_version ~ '^[a-zA-Z0-9._-]{1,64}$'),
 storage_path text not null unique,
 content_type text not null check(length(content_type) between 1 and 100),
 byte_count integer not null check(byte_count between 0 and 2097152),
 fetched_at timestamptz not null, expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 unique(connector_id,external_id,content_hash,parser_version),
 check(expires_at > created_at),
 check(storage_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}$')
);
create index connector_evidence_expiry_idx on public.connector_evidence(expires_at);
create table public.connector_host_budgets (
 host text primary key, window_start date not null, requests integer not null default 0 check(requests>=0),
 daily_limit integer not null check(daily_limit between 1 and 1000),
 min_interval_ms integer not null check(min_interval_ms between 0 and 86400000),
 next_request_at timestamptz not null default now(),
 holder uuid, held_until timestamptz
);
alter table public.connector_evidence enable row level security;
alter table public.connector_host_budgets enable row level security;
revoke all on public.connector_evidence, public.connector_host_budgets from public, anon, authenticated;
grant all on public.connector_evidence, public.connector_host_budgets to service_role;
-- No anon/authenticated policies: raw evidence and budgets are worker-only, including for admins.

-- Supabase Storage is supplied by the platform (test bootstrap models its authorization boundary).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('connector-raw','connector-raw',false,2097152,array['application/octet-stream'])
 on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['application/octet-stream'];
-- Restrictive policies remain effective even if another bucket has a broad permissive policy.
create policy c08_raw_private on storage.objects as restrictive for all to anon, authenticated
 using(bucket_id <> 'connector-raw') with check(bucket_id <> 'connector-raw');

create function public.connector_runtime(command jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 op text := command->>'op'; c public.source_connectors; r public.sync_runs;
 b public.connector_host_budgets; e public.connector_evidence;
 t timestamptz := clock_timestamp(); policy jsonb; token uuid; run uuid; v_host text;
 item jsonb; errs jsonb; complete boolean; code text; amount integer; delay_ms bigint;
begin
 -- EXECUTE grant also enforces this. Never expose as a user-context RPC.
 if current_user <> 'service_role' then raise exception 'permission_denied'; end if;
 select * into c from public.source_connectors where id=(command->>'connectorId')::uuid for update;
 if not found then raise exception 'permission_denied'; end if;
 policy := c.policy_metadata->'fetchPolicy';
 if op='claim' then
   if not c.enabled or c.permission_state<>'approved' or c.permission_review_expires_at<=t
      or c.permission_review_expires_at is null or c.permission_evidence is null
      or c.permission_evidence='{}'::jsonb or policy is null or policy->>'permission'<>'approved'
      or policy->>'enabled'<>'true' or (policy->>'expiresAt')::timestamptz<=t then raise exception 'permission_denied'; end if;
   if c.lease_expires_at>t then raise exception 'budget_exceeded'; end if;
   if coalesce(command->>'version','') !~ '^[a-zA-Z0-9._-]{1,64}$' then raise exception 'schema_error'; end if;
   -- A replacement lease makes the previous run visibly interrupted.
   update public.sync_runs set status='cancelled',finished_at=t,error_summary='budget_exceeded'
    where connector_id=c.id and status='running';
   token:=gen_random_uuid(); run:=gen_random_uuid();
   update public.source_connectors set lease_token=token,lease_expires_at=t+interval '5 minutes',
    fencing_token=fencing_token+1,status='running',last_sync=t where id=c.id returning * into c;
   insert into public.sync_runs(id,connector_id,trigger,lease_token,fencing_token,parser_version,policy_snapshot,cursor_start)
    values(run,c.id,'manual',token,c.fencing_token,command->>'version',policy,c.checkpoint);
   return jsonb_build_object('connectorId',c.id,'runId',run,'token',token,'fence',c.fencing_token,'policy',policy,'cursor',c.checkpoint->>'cursor');
 end if;
 select * into r from public.sync_runs where id=(command->>'runId')::uuid and connector_id=c.id for update;
 if not found or r.status<>'running' or r.lease_token is distinct from (command->>'token')::uuid
    or r.fencing_token is distinct from (command->>'fence')::bigint
    or c.lease_token is distinct from r.lease_token or c.fencing_token<>r.fencing_token
    or c.lease_expires_at<=t then raise exception 'budget_exceeded'; end if;
 v_host:=command->>'host';
 if op='release_host' then
   update public.connector_host_budgets set holder=null,held_until=null where connector_host_budgets.host=v_host and holder=r.id;
   return '{}'::jsonb;
 end if;
 -- Closing a run is allowed after revocation; successful completion is not.
 if op<>'finish' and (not c.enabled or c.permission_state<>'approved' or c.permission_review_expires_at<=t
    or policy is distinct from r.policy_snapshot or (policy->>'expiresAt')::timestamptz<=t) then raise exception 'permission_denied'; end if;
 if op='guard' then
   if v_host is not null then
     update public.connector_host_budgets set held_until=t+interval '60 seconds'
       where connector_host_budgets.host=v_host and holder=r.id and held_until>t;
     if not found then raise exception 'budget_exceeded'; end if;
   end if;
   return '{}'::jsonb;
 elsif op='reserve' then
   if not exists(select 1 from jsonb_array_elements(policy->'routes') x where x->>'host'=v_host) then raise exception 'permission_denied'; end if;
   if r.request_count >= (policy->>'maxRequests')::integer then raise exception 'budget_exceeded'; end if;
   insert into public.connector_host_budgets(host,window_start,daily_limit,min_interval_ms)
     values(v_host,(t at time zone 'UTC')::date,(policy->>'dailyRequests')::integer,(policy->>'minIntervalMs')::integer)
     on conflict do nothing;
   select * into b from public.connector_host_budgets where connector_host_budgets.host=v_host for update;
   if b.window_start<>(t at time zone 'UTC')::date then b.requests:=0; b.window_start:=(t at time zone 'UTC')::date; end if;
   b.daily_limit:=least(b.daily_limit,(policy->>'dailyRequests')::integer);
   b.min_interval_ms:=greatest(b.min_interval_ms,(policy->>'minIntervalMs')::integer);
   if b.held_until>t or b.next_request_at>t then raise exception 'rate_limited'; end if;
   if b.requests>=b.daily_limit then raise exception 'budget_exceeded'; end if;
   update public.connector_host_budgets set window_start=b.window_start,requests=b.requests+1,daily_limit=b.daily_limit,min_interval_ms=b.min_interval_ms,
     next_request_at=t+(b.min_interval_ms*interval '1 millisecond'),holder=r.id,held_until=t+interval '60 seconds' where connector_host_budgets.host=v_host;
   update public.sync_runs set request_count=request_count+1 where id=r.id;
   return '{}'::jsonb;
 elsif op='defer' then
   delay_ms:=(command->>'milliseconds')::bigint;
   if delay_ms is null or delay_ms<0 or delay_ms>31536000000 then raise exception 'schema_error'; end if;
   update public.connector_host_budgets set next_request_at=greatest(next_request_at,t+(delay_ms*interval '1 millisecond'))
    where connector_host_budgets.host=v_host and holder=r.id;
   return '{}'::jsonb;
 elsif op='retain' then
   if (select count(*) from public.connector_evidence where run_id=r.id)>=100 then raise exception 'budget_exceeded'; end if;
   item:=command->'item';
   if item->>'parserVersion'<>r.parser_version or (item->>'byteCount')::integer>(policy->>'maxBytes')::integer
      or (item->>'storagePath') not like c.id::text||'/'||r.id::text||'/%'
      or (item->>'fetchedAt')::timestamptz>t+interval '1 minute' then raise exception 'schema_error'; end if;
   insert into public.connector_evidence(connector_id,run_id,external_id,source_url,content_hash,parser_version,storage_path,content_type,byte_count,fetched_at,expires_at)
    values(c.id,r.id,item->>'externalId',item->>'sourceUrl',item->>'contentHash',item->>'parserVersion',item->>'storagePath',item->>'contentType',(item->>'byteCount')::integer,(item->>'fetchedAt')::timestamptz,t+((policy->>'retentionDays')::integer*interval '1 day'))
    on conflict(connector_id,external_id,content_hash,parser_version) do nothing returning * into e;
   if not found then select * into e from public.connector_evidence where connector_id=c.id and external_id=item->>'externalId' and content_hash=item->>'contentHash' and parser_version=item->>'parserVersion'; end if;
   if e.expires_at<=t then raise exception 'schema_error'; end if;
   return to_jsonb(e);
 elsif op='finish' then
   errs:=coalesce(command->'errors','[]'::jsonb);
   if jsonb_typeof(errs)<>'array' or jsonb_array_length(errs)>100 then raise exception 'schema_error'; end if;
   -- Store codes only; arbitrary input details/stack traces are never diagnostic text.
   for item in select value from jsonb_array_elements(errs) loop
     if item->>'code' not in ('permission_denied','rate_limited','authentication_failed','network_error','parse_error','schema_error','budget_exceeded') or item->>'code' is null then raise exception 'schema_error'; end if;
   end loop;
   select coalesce(jsonb_agg(jsonb_build_object('code',x->>'code')),'[]'::jsonb) into errs from jsonb_array_elements(errs) x;
   if not c.enabled or c.permission_state<>'approved' or c.permission_review_expires_at<=t
     or policy is distinct from r.policy_snapshot or (policy->>'expiresAt')::timestamptz<=t then errs:=errs||'[{"code":"permission_denied"}]'::jsonb; end if;
   if jsonb_typeof(command->'items')<>'array' or jsonb_array_length(command->'items')>100 then raise exception 'schema_error'; end if;
   for item in select value from jsonb_array_elements(command->'items') loop
     if not exists(select 1 from public.connector_evidence where connector_id=c.id and storage_path=item->>'permittedPayloadRef' and external_id=item->>'externalId' and content_hash=item->>'contentHash' and parser_version=r.parser_version and expires_at>t) then raise exception 'schema_error'; end if;
   end loop;
   amount:=jsonb_array_length(command->'items'); complete:=coalesce((command->>'complete')::boolean,false);
   if length(coalesce(command->>'cursor',''))>2000 then raise exception 'schema_error'; end if;
   code:=case when jsonb_array_length(errs)=0 then null else errs->0->>'code' end;
   update public.sync_runs set status=case when code is null then 'succeeded' when amount>0 then 'partial' else 'failed' end,
     finished_at=t,discovered_count=amount,processed_count=amount,failed_count=jsonb_array_length(errs),error_summary=code,item_errors=errs,
     cursor_end=case when code is null then jsonb_build_object('cursor',command->>'cursor') else cursor_start end where id=r.id;
   update public.source_connectors set checkpoint=case when code is null then jsonb_build_object('cursor',command->>'cursor') else checkpoint end,
     last_successful_sync=case when code is null and complete then t else last_successful_sync end,
     status=case when code is null then 'succeeded' when amount>0 then 'partial' else 'failed' end,
     error_count=case when code is null then 0 else error_count+1 end,
     enabled=case when errs @> '[{"code":"permission_denied"}]'::jsonb or errs @> '[{"code":"authentication_failed"}]'::jsonb or (code is not null and error_count>=2) then false else enabled end,
     lease_token=null,lease_expires_at=null where id=c.id;
   update public.connector_host_budgets set holder=null,held_until=null where holder=r.id;
   return jsonb_build_object('status',case when code is null then 'succeeded' when amount>0 then 'partial' else 'failed' end);
 end if;
 raise exception 'schema_error';
end;
$$;
revoke all on function public.connector_runtime(jsonb) from public,anon,authenticated;
grant execute on function public.connector_runtime(jsonb) to service_role;
commit;
