-- Migration: 20260924000200_organizer_submissions.sql
-- Organizer and Community Event Submissions: schema, private moderation separation, atomic mutation RPCs, and RLS.

BEGIN;

-- 1. URL Validator for Community Submissions
CREATE FUNCTION private.valid_submission_url(u text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT u IS NULL OR (
    length(u) <= 2048 AND
    u ~ '^https?://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]<>"'']*)?$' AND
    u !~* '^https?://([^/@:]+:[^/@:]+@)' AND
    u !~* '^https?://(localhost|127\.[0-9.]+|::1|10\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[0-1])\.[0-9.]+|192\.168\.[0-9.]+)(:[0-9]+)?([/?#]|$)'
  );
$$;

-- 2. Public Event Submissions Table
CREATE TABLE public.event_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'accepted', 'rejected', 'withdrawn')),
  submitter_relationship text NOT NULL CHECK (submitter_relationship IN ('organizer', 'participant', 'community_member', 'other')),

  -- Untrusted Submitted Facts
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  organizer_name text NOT NULL CHECK (length(btrim(organizer_name)) BETWEEN 2 AND 150),
  category_slug text NOT NULL REFERENCES public.event_categories(slug),
  mode text NOT NULL CHECK (mode IN ('online', 'offline', 'hybrid')),
  official_url text CHECK (private.valid_submission_url(official_url)),
  registration_url text CHECK (private.valid_submission_url(registration_url)),
  start_date date,
  end_date date,
  registration_deadline_precision text NOT NULL DEFAULT 'unknown' CHECK (registration_deadline_precision IN ('unknown', 'date_only', 'datetime')),
  registration_deadline_local_date date,
  registration_deadline_due_at timestamptz,
  registration_deadline_timezone text CHECK (private.valid_zone(registration_deadline_timezone)),
  venue text,
  city text,
  state text,
  country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  description text CHECK (description IS NULL OR length(description) <= 5000),
  eligibility_summary text CHECK (eligibility_summary IS NULL OR length(eligibility_summary) <= 3000),
  min_team_size integer CHECK (min_team_size IS NULL OR min_team_size > 0),
  max_team_size integer CHECK (max_team_size IS NULL OR max_team_size > 0),
  fee_status text NOT NULL DEFAULT 'unknown' CHECK (fee_status IN ('unknown', 'free', 'paid', 'varies')),
  fee_amount numeric(18,2) CHECK (fee_amount IS NULL OR (fee_amount >= 0 AND fee_amount <> 'NaN'::numeric)),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  prize_description text CHECK (prize_description IS NULL OR length(prize_description) <= 1000),
  submitter_notes text CHECK (submitter_notes IS NULL OR length(submitter_notes) <= 2000),

  -- Submitter-Visible Rejection Details
  rejection_reason_code text CHECK (rejection_reason_code IS NULL OR rejection_reason_code IN (
    'duplicate', 'source_invalid', 'insufficient_information', 'not_relevant',
    'expired_event', 'cannot_verify', 'spam_abuse', 'other'
  )),
  rejection_reason_details text CHECK (rejection_reason_details IS NULL OR length(rejection_reason_details) <= 1000),

  -- Optimistic Concurrency & Timestamps
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Invariants
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date),
  CHECK (min_team_size IS NULL OR max_team_size IS NULL OR min_team_size <= max_team_size),
  CHECK (official_url IS NOT NULL OR registration_url IS NOT NULL),
  CHECK (
    (registration_deadline_precision = 'unknown' AND registration_deadline_local_date IS NULL AND registration_deadline_due_at IS NULL) OR
    (registration_deadline_precision = 'date_only' AND registration_deadline_local_date IS NOT NULL AND registration_deadline_due_at IS NULL) OR
    (registration_deadline_precision = 'datetime' AND registration_deadline_due_at IS NOT NULL)
  )
);

-- 3. Private Moderation Table (Admin-only storage)
CREATE TABLE private.event_submission_moderation (
  submission_id uuid PRIMARY KEY REFERENCES public.event_submissions(id) ON DELETE CASCADE,
  canonical_event_id uuid UNIQUE REFERENCES public.events(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  internal_notes text CHECK (internal_notes IS NULL OR length(internal_notes) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Append-Only Moderation Audit History
CREATE TABLE public.submission_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.event_submissions(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('submitted', 'edited', 'review_started', 'rejected', 'accepted', 'withdrawn')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('submitter', 'admin')),
  from_status text CHECK (from_status IN ('submitted', 'under_review', 'accepted', 'rejected', 'withdrawn')),
  to_status text NOT NULL CHECK (to_status IN ('submitted', 'under_review', 'accepted', 'rejected', 'withdrawn')),
  public_notes text CHECK (public_notes IS NULL OR length(public_notes) <= 1000),
  internal_notes text CHECK (internal_notes IS NULL OR length(internal_notes) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Bounded Performance Indexes
CREATE INDEX event_submissions_submitter_idx
  ON public.event_submissions (submitter_user_id, created_at DESC, id DESC);

CREATE INDEX event_submissions_status_idx
  ON public.event_submissions (status, created_at DESC, id DESC);

CREATE INDEX event_submissions_created_idx
  ON public.event_submissions (created_at DESC, id DESC);

CREATE INDEX submission_moderation_events_submission_idx
  ON public.submission_moderation_events (submission_id, created_at ASC);

-- 6. Row Level Security & Policies
ALTER TABLE public.event_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_moderation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY submitter_select ON public.event_submissions
  FOR SELECT TO authenticated
  USING (submitter_user_id = (SELECT auth.uid()));

CREATE POLICY staff_all ON public.event_submissions
  FOR ALL TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY staff_all ON public.submission_moderation_events
  FOR ALL TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

-- 7. Direct Table Grants: Revoke Direct Writes from Users
REVOKE ALL ON TABLE public.event_submissions FROM public, anon;
REVOKE INSERT, UPDATE, DELETE ON public.event_submissions FROM authenticated;
GRANT SELECT ON public.event_submissions TO authenticated;
GRANT ALL ON TABLE public.event_submissions TO service_role;

REVOKE ALL ON TABLE private.event_submission_moderation FROM public, anon, authenticated;
GRANT ALL ON TABLE private.event_submission_moderation TO service_role;

REVOKE ALL ON TABLE public.submission_moderation_events FROM public, anon, authenticated;
GRANT ALL ON TABLE public.submission_moderation_events TO service_role;

-- 8. Submitter Mutation RPC: submit_event_opportunity
CREATE FUNCTION public.submit_event_opportunity(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_recent_count integer;
  v_title text;
  v_norm_title text;
  v_sub public.event_submissions;
  v_key text;
  v_lock_key bigint;
BEGIN
  -- 1. Authentication & Email Confirmation Check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501';
  END IF;

  -- 2. Reject Unexpected Keys
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text) > 65536 THEN
    RAISE EXCEPTION 'validation' USING errcode = 'P0522';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
    IF v_key NOT IN (
      'title', 'organizer_name', 'category_slug', 'mode', 'submitter_relationship',
      'official_url', 'registration_url', 'start_date', 'end_date',
      'registration_deadline_precision', 'registration_deadline_local_date',
      'registration_deadline_due_at', 'registration_deadline_timezone',
      'venue', 'city', 'state', 'country', 'description', 'eligibility_summary',
      'min_team_size', 'max_team_size', 'fee_status', 'fee_amount', 'currency',
      'prize_description', 'submitter_notes'
    ) THEN
      RAISE EXCEPTION 'validation' USING errcode = 'P0522';
    END IF;
  END LOOP;

  -- 3. Advisory Lock per Submitter (Serialized Rate Limit & Duplicate Protection)
  v_lock_key := ('x' || substr(replace(v_uid::text, '-', ''), 1, 16))::bit(64)::bigint;
  PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

  -- 4. Rolling 24-Hour Rate Limit
  SELECT count(*) INTO v_recent_count
  FROM public.event_submissions
  WHERE submitter_user_id = v_uid AND created_at > now() - interval '24 hours';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING errcode = 'P0529';
  END IF;

  -- 5. Duplicate Flood Guard
  v_title := p_payload->>'title';
  IF v_title IS NULL OR length(btrim(v_title)) < 3 THEN
    RAISE EXCEPTION 'validation' USING errcode = 'P0522';
  END IF;

  v_norm_title := lower(btrim(regexp_replace(v_title, '\s+', ' ', 'g')));
  IF EXISTS (
    SELECT 1 FROM public.event_submissions
    WHERE submitter_user_id = v_uid
      AND lower(btrim(regexp_replace(title, '\s+', ' ', 'g'))) = v_norm_title
      AND created_at > now() - interval '24 hours'
  ) THEN
    RAISE EXCEPTION 'duplicate_submission' USING errcode = 'P0528';
  END IF;

  -- 6. Insert Submission
  INSERT INTO public.event_submissions (
    submitter_user_id, status, submitter_relationship,
    title, organizer_name, category_slug, mode,
    official_url, registration_url, start_date, end_date,
    registration_deadline_precision, registration_deadline_local_date,
    registration_deadline_due_at, registration_deadline_timezone,
    venue, city, state, country, description, eligibility_summary,
    min_team_size, max_team_size, fee_status, fee_amount, currency,
    prize_description, submitter_notes, version
  ) VALUES (
    v_uid, 'submitted', p_payload->>'submitter_relationship',
    btrim(v_title), btrim(p_payload->>'organizer_name'), p_payload->>'category_slug', p_payload->>'mode',
    p_payload->>'official_url', p_payload->>'registration_url',
    (p_payload->>'start_date')::date, (p_payload->>'end_date')::date,
    COALESCE(p_payload->>'registration_deadline_precision', 'unknown'),
    (p_payload->>'registration_deadline_local_date')::date,
    (p_payload->>'registration_deadline_due_at')::timestamptz,
    p_payload->>'registration_deadline_timezone',
    p_payload->>'venue', p_payload->>'city', p_payload->>'state', p_payload->>'country',
    p_payload->>'description', p_payload->>'eligibility_summary',
    (p_payload->>'min_team_size')::integer, (p_payload->>'max_team_size')::integer,
    COALESCE(p_payload->>'fee_status', 'unknown'),
    (p_payload->>'fee_amount')::numeric, p_payload->>'currency',
    p_payload->>'prize_description', p_payload->>'submitter_notes', 1
  ) RETURNING * INTO v_sub;

  -- 7. Audit History
  INSERT INTO public.submission_moderation_events (
    submission_id, action, actor_id, actor_role, from_status, to_status
  ) VALUES (
    v_sub.id, 'submitted', v_uid, 'submitter', NULL, 'submitted'
  );

  RETURN to_jsonb(v_sub);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_event_opportunity(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_event_opportunity(jsonb) TO authenticated;

-- 9. Submitter Mutation RPC: edit_event_submission
CREATE FUNCTION public.edit_event_submission(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_sub_id uuid := (p_command->>'id')::uuid;
  v_expected_version integer := (p_command->>'expected_version')::integer;
  v_patch jsonb := p_command->'patch';
  v_sub public.event_submissions;
  v_key text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501'; END IF;
  IF v_sub_id IS NULL OR v_expected_version IS NULL OR jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'validation' USING errcode = 'P0522';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_patch) LOOP
    IF v_key NOT IN (
      'title', 'organizer_name', 'category_slug', 'mode', 'submitter_relationship',
      'official_url', 'registration_url', 'start_date', 'end_date',
      'registration_deadline_precision', 'registration_deadline_local_date',
      'registration_deadline_due_at', 'registration_deadline_timezone',
      'venue', 'city', 'state', 'country', 'description', 'eligibility_summary',
      'min_team_size', 'max_team_size', 'fee_status', 'fee_amount', 'currency',
      'prize_description', 'submitter_notes'
    ) THEN
      RAISE EXCEPTION 'validation' USING errcode = 'P0522';
    END IF;
  END LOOP;

  SELECT * INTO v_sub FROM public.event_submissions WHERE id = v_sub_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING errcode = 'P0504'; END IF;
  IF v_sub.submitter_user_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'forbidden' USING errcode = 'P0503'; END IF;
  IF v_sub.version <> v_expected_version THEN RAISE EXCEPTION 'version_conflict' USING errcode = 'P0509'; END IF;
  IF v_sub.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_transition' USING errcode = 'P0522'; END IF;

  UPDATE public.event_submissions
  SET title = COALESCE(btrim(v_patch->>'title'), title),
      organizer_name = COALESCE(btrim(v_patch->>'organizer_name'), organizer_name),
      category_slug = COALESCE(v_patch->>'category_slug', category_slug),
      mode = COALESCE(v_patch->>'mode', mode),
      submitter_relationship = COALESCE(v_patch->>'submitter_relationship', submitter_relationship),
      official_url = CASE WHEN v_patch ? 'official_url' THEN v_patch->>'official_url' ELSE official_url END,
      registration_url = CASE WHEN v_patch ? 'registration_url' THEN v_patch->>'registration_url' ELSE registration_url END,
      start_date = CASE WHEN v_patch ? 'start_date' THEN (v_patch->>'start_date')::date ELSE start_date END,
      end_date = CASE WHEN v_patch ? 'end_date' THEN (v_patch->>'end_date')::date ELSE end_date END,
      registration_deadline_precision = COALESCE(v_patch->>'registration_deadline_precision', registration_deadline_precision),
      registration_deadline_local_date = CASE WHEN v_patch ? 'registration_deadline_local_date' THEN (v_patch->>'registration_deadline_local_date')::date ELSE registration_deadline_local_date END,
      registration_deadline_due_at = CASE WHEN v_patch ? 'registration_deadline_due_at' THEN (v_patch->>'registration_deadline_due_at')::timestamptz ELSE registration_deadline_due_at END,
      registration_deadline_timezone = CASE WHEN v_patch ? 'registration_deadline_timezone' THEN v_patch->>'registration_deadline_timezone' ELSE registration_deadline_timezone END,
      venue = CASE WHEN v_patch ? 'venue' THEN v_patch->>'venue' ELSE venue END,
      city = CASE WHEN v_patch ? 'city' THEN v_patch->>'city' ELSE city END,
      state = CASE WHEN v_patch ? 'state' THEN v_patch->>'state' ELSE state END,
      country = CASE WHEN v_patch ? 'country' THEN v_patch->>'country' ELSE country END,
      description = CASE WHEN v_patch ? 'description' THEN v_patch->>'description' ELSE description END,
      eligibility_summary = CASE WHEN v_patch ? 'eligibility_summary' THEN v_patch->>'eligibility_summary' ELSE eligibility_summary END,
      min_team_size = CASE WHEN v_patch ? 'min_team_size' THEN (v_patch->>'min_team_size')::integer ELSE min_team_size END,
      max_team_size = CASE WHEN v_patch ? 'max_team_size' THEN (v_patch->>'max_team_size')::integer ELSE max_team_size END,
      fee_status = COALESCE(v_patch->>'fee_status', fee_status),
      fee_amount = CASE WHEN v_patch ? 'fee_amount' THEN (v_patch->>'fee_amount')::numeric ELSE fee_amount END,
      currency = CASE WHEN v_patch ? 'currency' THEN v_patch->>'currency' ELSE currency END,
      prize_description = CASE WHEN v_patch ? 'prize_description' THEN v_patch->>'prize_description' ELSE prize_description END,
      submitter_notes = CASE WHEN v_patch ? 'submitter_notes' THEN v_patch->>'submitter_notes' ELSE submitter_notes END,
      version = version + 1,
      updated_at = now()
  WHERE id = v_sub_id RETURNING * INTO v_sub;

  INSERT INTO public.submission_moderation_events (
    submission_id, action, actor_id, actor_role, from_status, to_status
  ) VALUES (
    v_sub_id, 'edited', v_uid, 'submitter', 'submitted', 'submitted'
  );

  RETURN to_jsonb(v_sub);
END;
$$;
REVOKE ALL ON FUNCTION public.edit_event_submission(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.edit_event_submission(jsonb) TO authenticated;

-- 10. Submitter Mutation RPC: withdraw_event_submission
CREATE FUNCTION public.withdraw_event_submission(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_sub_id uuid := (p_command->>'id')::uuid;
  v_expected_version integer := (p_command->>'expected_version')::integer;
  v_sub public.event_submissions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501'; END IF;
  IF v_sub_id IS NULL OR v_expected_version IS NULL THEN RAISE EXCEPTION 'validation' USING errcode = 'P0522'; END IF;

  SELECT * INTO v_sub FROM public.event_submissions WHERE id = v_sub_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING errcode = 'P0504'; END IF;
  IF v_sub.submitter_user_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'forbidden' USING errcode = 'P0503'; END IF;
  IF v_sub.version <> v_expected_version THEN RAISE EXCEPTION 'version_conflict' USING errcode = 'P0509'; END IF;
  IF v_sub.status NOT IN ('submitted', 'under_review') THEN RAISE EXCEPTION 'invalid_transition' USING errcode = 'P0522'; END IF;

  UPDATE public.event_submissions
  SET status = 'withdrawn',
      version = version + 1,
      updated_at = now()
  WHERE id = v_sub_id RETURNING * INTO v_sub;

  INSERT INTO public.submission_moderation_events (
    submission_id, action, actor_id, actor_role, from_status, to_status, public_notes
  ) VALUES (
    v_sub_id, 'withdrawn', v_uid, 'submitter', v_sub.status, 'withdrawn', p_command->>'public_notes'
  );

  RETURN to_jsonb(v_sub);
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_event_submission(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_event_submission(jsonb) TO authenticated;

-- 11. Admin Read RPC: list_admin_submissions
CREATE FUNCTION public.list_admin_submissions(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 50);
  v_result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501'; END IF;
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode = 'P0503'; END IF;

  SELECT coalesce(jsonb_agg(sub_json), '[]'::jsonb) INTO v_result FROM (
    SELECT jsonb_build_object(
      'id', s.id,
      'status', s.status,
      'title', s.title,
      'organizer_name', s.organizer_name,
      'category_slug', s.category_slug,
      'mode', s.mode,
      'submitter_relationship', s.submitter_relationship,
      'submitter_user_id', s.submitter_user_id,
      'submitter_email', u.email,
      'canonical_event_id', m.canonical_event_id,
      'version', s.version,
      'created_at', s.created_at,
      'updated_at', s.updated_at
    ) AS sub_json
    FROM public.event_submissions s
    LEFT JOIN auth.users u ON u.id = s.submitter_user_id
    LEFT JOIN private.event_submission_moderation m ON m.submission_id = s.id
    WHERE (p_status IS NULL OR p_status = '' OR s.status = p_status)
      AND (
        p_cursor_created_at IS NULL OR
        s.created_at < p_cursor_created_at OR
        (s.created_at = p_cursor_created_at AND s.id < p_cursor_id)
      )
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT (v_limit + 1)
  ) t;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_admin_submissions(text, integer, timestamptz, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_admin_submissions(text, integer, timestamptz, uuid) TO authenticated;

-- 12. Admin Read RPC: get_admin_submission
CREATE FUNCTION public.get_admin_submission(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_sub record;
  v_canonical jsonb := NULL;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501'; END IF;
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode = 'P0503'; END IF;

  SELECT s.*, u.email AS submitter_email, m.canonical_event_id, m.reviewed_by, m.reviewed_at, m.internal_notes,
         r.email AS reviewer_email
  INTO v_sub
  FROM public.event_submissions s
  LEFT JOIN auth.users u ON u.id = s.submitter_user_id
  LEFT JOIN private.event_submission_moderation m ON m.submission_id = s.id
  LEFT JOIN auth.users r ON r.id = m.reviewed_by
  WHERE s.id = p_submission_id;

  IF v_sub.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_sub.canonical_event_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', id,
      'title', title,
      'slug', slug,
      'publication_status', publication_status
    ) INTO v_canonical
    FROM public.events WHERE id = v_sub.canonical_event_id;
  END IF;

  RETURN jsonb_build_object(
    'submission', to_jsonb(v_sub) - 'canonical_event_id' - 'reviewed_by' - 'reviewed_at' - 'internal_notes' - 'reviewer_email',
    'moderation', jsonb_build_object(
      'canonical_event_id', v_sub.canonical_event_id,
      'reviewed_by', v_sub.reviewed_by,
      'reviewer_email', v_sub.reviewer_email,
      'reviewed_at', v_sub.reviewed_at,
      'internal_notes', v_sub.internal_notes
    ),
    'canonical_event', v_canonical
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_submission(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_submission(uuid) TO authenticated;

-- 13. Admin Read RPC: get_admin_submission_history
CREATE FUNCTION public.get_admin_submission_history(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501'; END IF;
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode = 'P0503'; END IF;

  SELECT coalesce(jsonb_agg(row_to_json(h)), '[]'::jsonb) INTO v_result FROM (
    SELECT e.id, e.submission_id, e.action, e.actor_id, e.actor_role,
           u.email AS actor_email, e.from_status, e.to_status,
           e.public_notes, e.internal_notes, e.created_at
    FROM public.submission_moderation_events e
    LEFT JOIN auth.users u ON u.id = e.actor_id
    WHERE e.submission_id = p_submission_id
    ORDER BY e.created_at ASC, e.id ASC
  ) h;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_submission_history(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_submission_history(uuid) TO authenticated;

-- 14. Admin Mutation RPC: start_review_event_submission
CREATE FUNCTION public.start_review_event_submission(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_sub_id uuid := (p_command->>'id')::uuid;
  v_expected_version integer := (p_command->>'expected_version')::integer;
  v_sub public.event_submissions;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501'; END IF;
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode = 'P0503'; END IF;
  IF v_sub_id IS NULL OR v_expected_version IS NULL THEN RAISE EXCEPTION 'validation' USING errcode = 'P0522'; END IF;

  SELECT * INTO v_sub FROM public.event_submissions WHERE id = v_sub_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING errcode = 'P0504'; END IF;
  IF v_sub.version <> v_expected_version THEN RAISE EXCEPTION 'version_conflict' USING errcode = 'P0509'; END IF;
  IF v_sub.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_transition' USING errcode = 'P0522'; END IF;

  UPDATE public.event_submissions
  SET status = 'under_review',
      version = version + 1,
      updated_at = now()
  WHERE id = v_sub_id RETURNING * INTO v_sub;

  INSERT INTO public.submission_moderation_events (
    submission_id, action, actor_id, actor_role, from_status, to_status, internal_notes
  ) VALUES (
    v_sub_id, 'review_started', (SELECT auth.uid()), 'admin', 'submitted', 'under_review', p_command->>'internal_notes'
  );

  RETURN to_jsonb(v_sub);
END;
$$;
REVOKE ALL ON FUNCTION public.start_review_event_submission(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_review_event_submission(jsonb) TO authenticated;

-- 15. Admin Mutation RPC: reject_event_submission
CREATE FUNCTION public.reject_event_submission(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_sub_id uuid := (p_command->>'id')::uuid;
  v_expected_version integer := (p_command->>'expected_version')::integer;
  v_reason_code text := p_command->>'rejection_reason_code';
  v_reason_details text := p_command->>'rejection_reason_details';
  v_internal_notes text := p_command->>'internal_notes';
  v_sub public.event_submissions;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501'; END IF;
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode = 'P0503'; END IF;
  IF v_sub_id IS NULL OR v_expected_version IS NULL OR v_reason_code IS NULL THEN
    RAISE EXCEPTION 'validation' USING errcode = 'P0522';
  END IF;

  IF v_reason_code NOT IN ('duplicate', 'source_invalid', 'insufficient_information', 'not_relevant', 'expired_event', 'cannot_verify', 'spam_abuse', 'other') THEN
    RAISE EXCEPTION 'validation' USING errcode = 'P0522';
  END IF;

  SELECT * INTO v_sub FROM public.event_submissions WHERE id = v_sub_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING errcode = 'P0504'; END IF;
  IF v_sub.version <> v_expected_version THEN RAISE EXCEPTION 'version_conflict' USING errcode = 'P0509'; END IF;
  IF v_sub.status NOT IN ('submitted', 'under_review') THEN RAISE EXCEPTION 'invalid_transition' USING errcode = 'P0522'; END IF;

  UPDATE public.event_submissions
  SET status = 'rejected',
      rejection_reason_code = v_reason_code,
      rejection_reason_details = v_reason_details,
      version = version + 1,
      updated_at = now()
  WHERE id = v_sub_id RETURNING * INTO v_sub;

  INSERT INTO private.event_submission_moderation (
    submission_id, reviewed_by, reviewed_at, internal_notes
  ) VALUES (
    v_sub_id, (SELECT auth.uid()), now(), v_internal_notes
  )
  ON CONFLICT (submission_id) DO UPDATE SET
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_at = EXCLUDED.reviewed_at,
    internal_notes = EXCLUDED.internal_notes,
    updated_at = now();

  INSERT INTO public.submission_moderation_events (
    submission_id, action, actor_id, actor_role, from_status, to_status, public_notes, internal_notes
  ) VALUES (
    v_sub_id, 'rejected', (SELECT auth.uid()), 'admin', v_sub.status, 'rejected', v_reason_details, v_internal_notes
  );

  RETURN to_jsonb(v_sub);
END;
$$;
REVOKE ALL ON FUNCTION public.reject_event_submission(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_event_submission(jsonb) TO authenticated;

-- 16. Admin Mutation RPC: accept_event_submission
CREATE FUNCTION public.accept_event_submission(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_submission_id uuid := (p_command->>'submission_id')::uuid;
  v_expected_version integer := (p_command->>'expected_version')::integer;
  v_event_command jsonb := p_command->'event_command';
  v_internal_notes text := p_command->>'internal_notes';
  v_public_notes text := p_command->>'public_notes';
  v_sub public.event_submissions;
  v_event_result jsonb;
  v_created_event_id uuid;
  v_sanitized_patch jsonb;
BEGIN
  -- 1. Authorization
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501'; END IF;
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode = 'P0503'; END IF;

  -- 2. Lock & Validate Submission
  SELECT * INTO v_sub
  FROM public.event_submissions
  WHERE id = v_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING errcode = 'P0504'; END IF;

  -- 3. Uniqueness Check: Prevent Double Acceptance
  IF v_sub.status = 'accepted' OR EXISTS (
    SELECT 1 FROM private.event_submission_moderation
    WHERE submission_id = v_submission_id AND canonical_event_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'already_accepted' USING errcode = 'P0522';
  END IF;

  IF v_sub.version <> v_expected_version THEN RAISE EXCEPTION 'version_conflict' USING errcode = 'P0509'; END IF;
  IF v_sub.status NOT IN ('submitted', 'under_review') THEN RAISE EXCEPTION 'invalid_transition' USING errcode = 'P0522'; END IF;

  -- 4. Validate & Sanitize Event Command for C05 mutate_event
  IF (v_event_command->>'action') <> 'create' THEN RAISE EXCEPTION 'validation' USING errcode = 'P0522'; END IF;
  IF v_event_command ? 'id' OR v_event_command ? 'expected_version' THEN RAISE EXCEPTION 'validation' USING errcode = 'P0522'; END IF;

  -- Enforce canonical trust state invariants: strictly draft (table default), community_submitted, pending
  v_sanitized_patch := ((v_event_command->'event') - 'publication_status') || jsonb_build_object(
    'verification_level', 'community_submitted',
    'verification_status', 'pending'
  );

  -- Ensure date_precision is set to date_only if dates are provided without explicit precision
  IF ((v_sanitized_patch->>'start_date') IS NOT NULL OR (v_sanitized_patch->>'end_date') IS NOT NULL) AND
     (v_sanitized_patch->>'date_precision' IS NULL OR v_sanitized_patch->>'date_precision' = 'unknown') THEN
    v_sanitized_patch := v_sanitized_patch || jsonb_build_object('date_precision', 'date_only');
  END IF;

  v_event_command := jsonb_set(v_event_command, '{event}', v_sanitized_patch);

  -- 5. Invoke Existing C05 mutate_event Contract
  v_event_result := public.mutate_event(v_event_command);
  v_created_event_id := (v_event_result->>'id')::uuid;

  IF v_created_event_id IS NULL THEN RAISE EXCEPTION 'database_failure' USING errcode = 'P0500'; END IF;

  -- 6. Record Admin Moderation Details in private Schema
  INSERT INTO private.event_submission_moderation (
    submission_id, canonical_event_id, reviewed_by, reviewed_at, internal_notes
  ) VALUES (
    v_submission_id, v_created_event_id, (SELECT auth.uid()), now(), v_internal_notes
  )
  ON CONFLICT (submission_id) DO UPDATE SET
    canonical_event_id = EXCLUDED.canonical_event_id,
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_at = EXCLUDED.reviewed_at,
    internal_notes = EXCLUDED.internal_notes,
    updated_at = now();

  -- 7. Transition Submission State
  UPDATE public.event_submissions
  SET status = 'accepted',
      version = version + 1,
      updated_at = now()
  WHERE id = v_submission_id;

  -- 8. Record Moderation Audit Entry
  INSERT INTO public.submission_moderation_events (
    submission_id, action, actor_id, actor_role, from_status, to_status, public_notes, internal_notes
  ) VALUES (
    v_submission_id, 'accepted', (SELECT auth.uid()), 'admin', v_sub.status, 'accepted', v_public_notes, v_internal_notes
  );

  RETURN jsonb_build_object(
    'submission_id', v_submission_id,
    'canonical_event_id', v_created_event_id,
    'status', 'accepted'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.accept_event_submission(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_event_submission(jsonb) TO authenticated;

-- 17. Submitter Read RPC: list_user_submissions
CREATE FUNCTION public.list_user_submissions(
  p_limit integer DEFAULT 24,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 50);
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501'; END IF;

  SELECT coalesce(jsonb_agg(sub_json), '[]'::jsonb) INTO v_result FROM (
    SELECT jsonb_build_object(
      'id', s.id,
      'status', s.status,
      'submitter_relationship', s.submitter_relationship,
      'title', s.title,
      'organizer_name', s.organizer_name,
      'category_slug', s.category_slug,
      'mode', s.mode,
      'official_url', s.official_url,
      'registration_url', s.registration_url,
      'start_date', s.start_date,
      'end_date', s.end_date,
      'registration_deadline_precision', s.registration_deadline_precision,
      'registration_deadline_local_date', s.registration_deadline_local_date,
      'registration_deadline_due_at', s.registration_deadline_due_at,
      'registration_deadline_timezone', s.registration_deadline_timezone,
      'venue', s.venue,
      'city', s.city,
      'state', s.state,
      'country', s.country,
      'description', s.description,
      'eligibility_summary', s.eligibility_summary,
      'min_team_size', s.min_team_size,
      'max_team_size', s.max_team_size,
      'fee_status', s.fee_status,
      'fee_amount', s.fee_amount,
      'currency', s.currency,
      'prize_description', s.prize_description,
      'submitter_notes', s.submitter_notes,
      'rejection_reason_code', s.rejection_reason_code,
      'rejection_reason_details', s.rejection_reason_details,
      'published_event_slug', CASE WHEN e.publication_status = 'published' THEN e.slug ELSE NULL END,
      'version', s.version,
      'created_at', s.created_at,
      'updated_at', s.updated_at
    ) AS sub_json
    FROM public.event_submissions s
    LEFT JOIN private.event_submission_moderation m ON m.submission_id = s.id
    LEFT JOIN public.events e ON e.id = m.canonical_event_id AND e.publication_status = 'published'
    WHERE s.submitter_user_id = v_uid
      AND (
        p_cursor_created_at IS NULL OR
        s.created_at < p_cursor_created_at OR
        (s.created_at = p_cursor_created_at AND s.id < p_cursor_id)
      )
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT (v_limit + 1)
  ) t;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_user_submissions(integer, timestamptz, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_user_submissions(integer, timestamptz, uuid) TO authenticated;

COMMIT;
