-- Additive migration: Notifications (In-App & Transactional Email)
BEGIN;

-- 1. Notification Preferences Table
CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false, -- Conservative opt-in
  deadline_reminders boolean NOT NULL DEFAULT true,
  event_changes boolean NOT NULL DEFAULT true,
  recommendations boolean NOT NULL DEFAULT false, -- Deferred to Notifications 1.1
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_preferences FROM public, anon;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

CREATE POLICY notification_preferences_select ON public.notification_preferences
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY notification_preferences_insert ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY notification_preferences_update ON public.notification_preferences
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- 2. In-App Notifications Table (Logical Notification Occurrence)
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'deadline_approaching',
    'registration_closing_soon',
    'event_time_changed',
    'event_cancelled',
    'recommendation_match',
    'event_updated'
  )),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  event_version integer,
  title text NOT NULL CHECK (btrim(title) <> ''),
  body text NOT NULL CHECK (btrim(body) <> ''),
  action_url text,
  idempotency_key text NOT NULL,
  in_app_visible boolean NOT NULL DEFAULT true,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, idempotency_key)
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Read own visible notifications only
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id AND in_app_visible = true);

-- Ordinary users cannot INSERT, UPDATE, or DELETE directly
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated, anon;
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Partial indexes for badge counts and keyset pagination
CREATE INDEX notifications_user_unread_idx ON public.notifications(user_id, created_at DESC)
  WHERE in_app_visible = true AND read_at IS NULL;
CREATE INDEX notifications_user_list_idx ON public.notifications(user_id, created_at DESC, id DESC)
  WHERE in_app_visible = true;
CREATE INDEX notifications_event_id_idx ON public.notifications(event_id)
  WHERE event_id IS NOT NULL;

-- 3. Bounded Mutation RPCs (SECURITY DEFINER)
CREATE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE id = p_notification_id AND user_id = (SELECT auth.uid()) AND in_app_visible = true AND read_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.mark_all_notifications_read()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE user_id = (SELECT auth.uid()) AND in_app_visible = true AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated, service_role;

-- 4. Notification Email Deliveries Table (System-Only Queue)
CREATE TABLE public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'retryable', 'failed', 'suppressed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR octet_length(last_error_code) <= 64),
  last_error_message text CHECK (last_error_message IS NULL OR octet_length(last_error_message) <= 256),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_deliveries FROM public, anon, authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;

CREATE INDEX notification_deliveries_pending_idx ON public.notification_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'retryable') AND attempt_count < 3;

-- 5. Private Runner Infrastructure (Leases & Cursors)
CREATE TABLE private.notification_runner_leases (
  job_name text PRIMARY KEY,
  lease_owner text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  last_started_at timestamptz NOT NULL DEFAULT now(),
  last_completed_at timestamptz
);

REVOKE ALL ON TABLE private.notification_runner_leases FROM public, anon, authenticated;
GRANT ALL ON TABLE private.notification_runner_leases TO service_role;

CREATE TABLE private.notification_runner_cursors (
  job_name text PRIMARY KEY,
  cursor_timestamp timestamptz NOT NULL DEFAULT '-infinity',
  cursor_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.notification_runner_cursors FROM public, anon, authenticated;
GRANT ALL ON TABLE private.notification_runner_cursors TO service_role;

-- 6. System-Only Privileged Helper Functions (Accessible to service_role only)
CREATE FUNCTION public.acquire_runner_lease(p_job_name text, p_owner text, p_duration_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO private.notification_runner_leases (job_name, lease_owner, lease_expires_at, last_started_at)
  VALUES (p_job_name, p_owner, now() + (p_duration_seconds || ' seconds')::interval, now())
  ON CONFLICT (job_name) DO UPDATE
    SET lease_owner = p_owner,
        lease_expires_at = now() + (p_duration_seconds || ' seconds')::interval,
        last_started_at = now()
    WHERE private.notification_runner_leases.lease_expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

CREATE FUNCTION public.release_runner_lease(p_job_name text, p_owner text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE private.notification_runner_leases
  SET lease_expires_at = now() - interval '1 second',
      last_completed_at = now()
  WHERE job_name = p_job_name AND lease_owner = p_owner;
END;
$$;

CREATE FUNCTION public.get_runner_cursor(p_job_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_rec record;
BEGIN
  SELECT c.cursor_timestamp, c.cursor_id INTO v_rec
  FROM private.notification_runner_cursors c
  WHERE c.job_name = p_job_name;
  IF NOT FOUND THEN
    RETURN json_build_object('cursor_timestamp', '-infinity', 'cursor_id', '00000000-0000-0000-0000-000000000000')::jsonb;
  END IF;
  RETURN json_build_object('cursor_timestamp', to_char(v_rec.cursor_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'cursor_id', v_rec.cursor_id)::jsonb;
END;
$$;

CREATE FUNCTION public.update_runner_cursor(p_job_name text, p_cursor_timestamp timestamptz, p_cursor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO private.notification_runner_cursors (job_name, cursor_timestamp, cursor_id, updated_at)
  VALUES (p_job_name, p_cursor_timestamp, p_cursor_id, now())
  ON CONFLICT (job_name) DO UPDATE
    SET cursor_timestamp = p_cursor_timestamp,
        cursor_id = p_cursor_id,
        updated_at = now();
END;
$$;

CREATE FUNCTION public.claim_email_deliveries(p_batch_size integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH claimed AS (
    UPDATE public.notification_deliveries
    SET status = 'processing', updated_at = now()
    WHERE id IN (
      SELECT id FROM public.notification_deliveries
      WHERE status IN ('pending', 'retryable')
        AND next_attempt_at <= now()
      ORDER BY next_attempt_at ASC, id ASC
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  )
  SELECT coalesce(json_agg(row_to_json(claimed)), '[]'::json)::jsonb INTO v_result FROM claimed;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_runner_lease(text, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_runner_lease(text, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.release_runner_lease(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_runner_lease(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_runner_cursor(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_runner_cursor(text) TO service_role;
REVOKE ALL ON FUNCTION public.update_runner_cursor(text, timestamptz, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_runner_cursor(text, timestamptz, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.claim_email_deliveries(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_deliveries(integer) TO service_role;

COMMIT;
