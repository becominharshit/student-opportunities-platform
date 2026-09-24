-- Migration: 20260924000300_ai_assistant_limits.sql
-- Grounded AI Assistant: durable PostgreSQL-backed rate limits, UTC daily quotas, and atomic concurrency lease control.

BEGIN;

-- 1. Private Assistant Usage Table
CREATE TABLE private.assistant_usage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  minute_window_start timestamptz NOT NULL DEFAULT now(),
  minute_request_count integer NOT NULL DEFAULT 0 CHECK (minute_request_count >= 0),
  daily_window_start date NOT NULL DEFAULT (timezone('UTC', now()))::date,
  daily_request_count integer NOT NULL DEFAULT 0 CHECK (daily_request_count >= 0),
  current_lease_id uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Zero privileges to public, anon, or authenticated
REVOKE ALL ON TABLE private.assistant_usage FROM anon, authenticated, public;
GRANT ALL ON TABLE private.assistant_usage TO service_role;

-- 2. Atomic Quota & Concurrency Claim RPC
CREATE OR REPLACE FUNCTION public.claim_assistant_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_now timestamptz := clock_timestamp();
  v_today date := (timezone('UTC', v_now))::date;
  v_usage private.assistant_usage;
  v_lease_id uuid;
  v_lease_duration interval := interval '30 seconds';
BEGIN
  -- 1. Authentication & Email Confirmation Verification
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501';
  END IF;

  -- 2. Concurrency-safe initialization: eliminate first-request race condition
  INSERT INTO private.assistant_usage (
    user_id, minute_window_start, minute_request_count,
    daily_window_start, daily_request_count,
    current_lease_id, lease_expires_at, updated_at
  ) VALUES (
    v_uid, v_now, 0, v_today, 0, NULL, NULL, v_now
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- 3. Lock row for current user
  SELECT * INTO v_usage
  FROM private.assistant_usage
  WHERE user_id = v_uid
  FOR UPDATE;

  -- 4. In-Flight Concurrency Check (Max 1 in-flight request per user)
  IF v_usage.current_lease_id IS NOT NULL AND v_usage.lease_expires_at > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'concurrent_request_in_flight',
      'retry_after_seconds', CEIL(EXTRACT(EPOCH FROM (v_usage.lease_expires_at - v_now)))
    );
  END IF;

  -- 5. Fixed 60-Second Window Accounting (10 requests per 60s)
  IF v_now - v_usage.minute_window_start >= interval '60 seconds' THEN
    v_usage.minute_window_start := v_now;
    v_usage.minute_request_count := 0;
  END IF;

  IF v_usage.minute_request_count >= 10 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'rate_limit_exceeded_minute',
      'retry_after_seconds', CEIL(60 - EXTRACT(EPOCH FROM (v_now - v_usage.minute_window_start)))
    );
  END IF;

  -- 6. Fixed UTC Daily Quota Accounting (50 requests per UTC calendar day)
  IF v_today > v_usage.daily_window_start THEN
    v_usage.daily_window_start := v_today;
    v_usage.daily_request_count := 0;
  END IF;

  IF v_usage.daily_request_count >= 50 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'rate_limit_exceeded_daily',
      'retry_after_seconds', 3600
    );
  END IF;

  -- 7. Claim 30-Second Concurrency Lease & Atomically Increment Counters
  v_lease_id := gen_random_uuid();

  UPDATE private.assistant_usage
  SET minute_request_count = v_usage.minute_request_count + 1,
      daily_request_count = v_usage.daily_request_count + 1,
      minute_window_start = v_usage.minute_window_start,
      daily_window_start = v_usage.daily_window_start,
      current_lease_id = v_lease_id,
      lease_expires_at = v_now + v_lease_duration,
      updated_at = v_now
  WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'allowed', true,
    'lease_id', v_lease_id,
    'remaining_minute', 10 - (v_usage.minute_request_count + 1),
    'remaining_daily', 50 - (v_usage.daily_request_count + 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_assistant_request() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_assistant_request() TO authenticated;

-- 3. Atomic Concurrency Lease Release RPC
CREATE OR REPLACE FUNCTION public.release_assistant_request(p_lease_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL OR p_lease_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE private.assistant_usage
  SET current_lease_id = NULL,
      lease_expires_at = NULL,
      updated_at = clock_timestamp()
  WHERE user_id = v_uid AND current_lease_id = p_lease_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.release_assistant_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.release_assistant_request(uuid) TO authenticated;

COMMIT;
