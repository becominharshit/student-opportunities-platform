-- C03: bounded structural eligibility validation. Evaluation is a later task.
begin;
create function private.valid_rule(node jsonb, depth integer default 0) returns boolean
language plpgsql immutable set search_path = '' as $$
declare child jsonb; op text; field_name text; comparison text;
begin
 if node is null or jsonb_typeof(node) <> 'object' or depth > 12 then return false; end if;
 op := node->>'op';
 if op in ('all','any') then
   if jsonb_typeof(node->'rules') is distinct from 'array' then return false; end if;
   if jsonb_array_length(node->'rules') = 0 then return false; end if;
   for child in select value from jsonb_array_elements(node->'rules') loop
     if not private.valid_rule(child, depth + 1) then return false; end if;
   end loop;
   return true;
 end if;
 -- Unsupported restrictions stay explicit, never silently treated as eligible.
 if op = 'unresolved' then return coalesce(length(btrim(node->>'reason')) > 0, false); end if;
 if op is distinct from 'predicate' then return false; end if;
 field_name := node->>'field'; comparison := node->>'operator';
 if field_name is null or field_name not in ('student_status','degree','study_year','institution','participation_country','team_size')
   or comparison is null or comparison not in ('eq','in','gte','lte','unrestricted')
   or jsonb_typeof(node->'evidence') is distinct from 'string' or btrim(node->>'evidence') = '' then return false; end if;
 if comparison = 'unrestricted' then return true; end if;
 if comparison = 'in' then
   if jsonb_typeof(node->'value') is distinct from 'array' then return false; end if;
   if jsonb_array_length(node->'value') = 0 then return false; end if;
   for child in select value from jsonb_array_elements(node->'value') loop
     if not private.valid_rule(jsonb_build_object('op','predicate','field',field_name,'operator','eq','value',child,'evidence',node->>'evidence'), depth + 1)
     then return false; end if;
   end loop;
   return true;
 end if;
 if field_name in ('study_year','team_size') then
   return coalesce(jsonb_typeof(node->'value') = 'number' and (node->>'value') ~ '^[1-9][0-9]*$', false);
 end if;
 if comparison <> 'eq' then return false; end if;
 if field_name = 'student_status' then return jsonb_typeof(node->'value') is not distinct from 'boolean'; end if;
 return coalesce(jsonb_typeof(node->'value') = 'string' and btrim(node->>'value') <> ''
   and (field_name <> 'participation_country' or (node->>'value') ~ '^[A-Z]{2}$'), false);
end;
$$;
alter table public.events add constraint eligibility_rule_shape check (
 eligibility_rules is null or (
   octet_length(eligibility_rules::text) <= 16384
   and (eligibility_rules->>'version') is not distinct from '1'
   and private.valid_rule(eligibility_rules->'expression')
 ));
revoke all on function private.valid_rule(jsonb, integer) from public, anon, authenticated;
grant execute on function private.valid_rule(jsonb, integer) to authenticated, service_role;
commit;

