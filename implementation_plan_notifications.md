# Notifications Milestone Implementation Plan (Final Specification)

**Milestone**: Notifications (In-App & Transactional Email)  
**Date**: 24 September 2026  
**Status**: Final Operational Specification for Owner Review (Implementation NOT started)  
**Baseline**: Clean `main` at `94a766c08cf5b2173a0280ad51cd87ce614ad562` (Calendar Export approved and committed).  
**Deferred Dependencies**: C09–C11 and C17 remain strictly DEFERRED. Recommendation alerts are explicitly deferred to Notifications 1.1. Organizer submissions, AI assistant, and C19 redesign have not started.

---

## 1. Architectural Overview & Boundary Invariants

The Notifications milestone introduces an asynchronous, privacy-preserving notification engine for authenticated students across two initial channels:
1. **In-App Notifications**: Displayed at `/notifications` with lookahead keyset pagination, unread badge indicators, mark-as-read controls, and safe dynamic resolution for published events.
2. **Transactional Email**: Plaintext and semantic HTML notifications delivered strictly through a server-only transport abstraction, with conservative opt-in defaults.

Channels explicitly **excluded** (reserved for later enhancements): Web Push, Native Mobile Push, WhatsApp, Telegram, and SMS.

### Strict Data & Security Invariants
- **Canonical Facts Only**: Driven exclusively by confirmed database records (`saved_events`, `events`, `event_deadlines`, `event_changes`, and `notification_preferences`).
- **Zero Fabrication**: No fabricated deadlines (event `start_date` is never treated as a registration deadline), no assumed times, no midnight conversions, and no marketing notifications.
- **Strict Information Disclosure Protections**: Hidden, unpublished, or archived events never leak confidential facts through stored notification copy, API responses, or URLs.
- **Privileged System Write Boundary**: Ordinary authenticated users can **never** insert notifications, delivery jobs, or manipulate runner leases/cursors. Writes occur exclusively through server-only service context guarded by bundle and boundary tests.

---

## 2. Comprehensive Operational Contracts (The 20 Decision Areas)

### 1. Preference Defaults & Application Fallback
Per-user preferences are stored in `public.notification_preferences`:
- `in_app_enabled`: `boolean NOT NULL DEFAULT true`
- `email_enabled`: `boolean NOT NULL DEFAULT false` (**conservative opt-in**, requires explicit student consent)
- `deadline_reminders`: `boolean NOT NULL DEFAULT true`
- `event_changes`: `boolean NOT NULL DEFAULT true`
- `recommendations`: `boolean NOT NULL DEFAULT false` (deferred to Notifications 1.1)

#### Application Fallback Semantics
- If no row exists in `public.notification_preferences` for a user, the application evaluates them with these exact defaults:
  `{ in_app_enabled: true, email_enabled: false, deadline_reminders: true, event_changes: true, recommendations: false }`.
- No database migration backfill of historical users is required.
- When a user first updates preferences in `/account`, their row is upserted (`INSERT ... ON CONFLICT (user_id) DO UPDATE`).
- Ordinary users have RLS permission to read and update **only** their own row (`auth.uid() = user_id`).

#### Creation Gate
A logical notification is created only when:
$$(\text{topic\_enabled} = \text{true}) \land (\text{in\_app\_enabled} \lor \text{email\_enabled})$$
Topic toggles apply universally to both channels.

---

### 2. Exact Deterministic Idempotency Keys
Enforced by PostgreSQL unique constraints to guarantee that running sweepers 100 times back-to-back creates **zero** duplicate notifications or email deliveries:

1. **Registration Deadline Reminder**:
   `deadline:<deadline_id>:<window>`
   - *Format*: `deadline:${deadline.id}:${window}` (where window $\in \{ \text{'7d'}, \text{'3d'}, \text{'1d'} \}$)
   - *Example*: `deadline:8f80c6a2-e64e-4f59-a2ea-f481c9646b9a:7d`
   - *Constraint*: `UNIQUE(user_id, idempotency_key)` on `public.notifications`.

2. **Saved Event Change**:
   `event-change:<event_change_id>:<user_id>`
   - *Format*: `event-change:${change.id}:${user_id}`
   - *Rationale*: One event change notifies many saved subscribers; binding `user_id` ensures each subscriber receives exactly one notification for that change revision.
   - *Example*: `event-change:340e8400-e29b-41d4-a716-446655440001:550e8400-e29b-41d4-a716-446655440000`
   - *Constraint*: `UNIQUE(user_id, idempotency_key)` on `public.notifications`.

3. **Email Delivery Job**:
   `email:<notification_id>`
   - *Format*: `email:${notification.id}`
   - *Example*: `email:99887766-5544-3322-1100-aabbccddeeff`
   - *Constraint*: `UNIQUE(idempotency_key)` on `public.notification_deliveries`.

---

### 3. Privileged System Write Path
- **Ordinary Users**:
  - `REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated, anon;`
  - `GRANT SELECT ON public.notifications TO authenticated;`
  - Normal users can only:
    1. SELECT their visible notifications (`in_app_visible = true`) via RLS.
    2. Change read state via bounded `SECURITY INVOKER` RPCs (`mark_notification_read`, `mark_all_notifications_read`).
    3. Read and update their own `notification_preferences`.
- **System Generation**:
  - All notification generation, delivery queueing, lease management, and cursor updates execute via the dedicated server-only service client (`createServiceClient()` in `src/lib/supabase/service.ts` using `SUPABASE_SECRET_KEY`).
  - Strict boundary rules:
    - Marked with `import "server-only"`.
    - Confined exclusively to `src/lib/notifications/runner.ts`.
    - Never imported into Client Components or client bundles.
    - Never returned in client API responses.
    - Never logged.
    - Enforced by existing CI checks: `npm run test:bundle` and `npm run test:boundary`.

---

### 4. Notification List Keyset Pagination (`/notifications`)
- **Page Size**: 24 items.
- **Lookahead**: Requests 25 items (`LIMIT 25`) to determine `nextCursor` without full-table `COUNT(*)` queries.
- **Ordering**: Deterministic descending keyset:
  `ORDER BY created_at DESC, id DESC`
- **Cursor Format**: URL-safe base64-encoded JSON: `{"created_at": "<ISO>", "id": "<UUID>"}`.
- **Keyset Filter**:
  `WHERE (created_at, id) < (cursor_timestamp, cursor_id)`
- **Visibility Filter**: Strictly filters `in_app_visible = true`. Hidden notifications created for email-only delivery never appear.
- **Cursor Safety**: Invalid, malformed, or tampered cursors fail safely by falling back to the first page, displaying an informative recovery notice without crashing.

---

### 5. Single-Query Unread Badge Architecture
- The navigation unread indicator performs at most **1 indexed database query** on authenticated layout renders:
  ```sql
  SELECT count(*) FROM public.notifications
  WHERE user_id = auth.uid() AND in_app_visible = true AND read_at IS NULL;
  ```
- **Performance**: Powered by partial index `notifications_user_unread_idx ON public.notifications(user_id, created_at DESC) WHERE in_app_visible = true AND read_at IS NULL`. Average execution time is sub-millisecond ($< 0.1\text{ms}$).
- **Data Minimization**: Queries only `count(*)`; never fetches notification bodies or payloads to calculate badge state.
- **Anonymous Cost**: Exactly **0 database queries** for anonymous users (`if (!authenticated) return null;`).
- **UI Cap**: Displays exact count up to 99; displays `99+` if $> 99$.

---

### 6. Deadline Runner Cadence
- **Cadence**: Evaluated **once per hour** (`0 * * * *`).
- **Rationale**: Hourly execution supports `datetime` deadlines without substantial timing drift, processes `date_only` deadlines predictably, and ensures batch sizes remain small and bounded.
- **Production Scheduler Boundary**: Actual production scheduler configuration (e.g. Supabase `pg_cron`, GitHub Actions, or Vercel Cron) is deferred to the C21 deployment milestone. The application provides the hardened, authenticated runner endpoint.

---

### 7. Deadline Reminder Semantics & Bounded Catch-Up

#### Source of Truth
- Only `event_deadlines.kind = 'registration' AND active = true` qualifies.
- Event `start_date` or `start_at` is **never** used as a deadline.
- Unknown precision or null date/instant produces **zero** reminders.

#### Date Precision Handling
- **Datetime Deadlines (`precision = 'datetime'` with `due_at`)**:
  - Uses the canonical UTC instant `due_at`.
  - Calculates time difference: `hours_until = EXTRACT(EPOCH FROM (due_at - now())) / 3600`.
- **Date-Only Deadlines (`precision = 'date_only'` with `local_date`)**:
  - Treats `local_date` as a calendar date.
  - Does **not** convert to midnight UTC or fabricate an instant.
  - Compares calendar days in the event's canonical timezone (or UTC if missing):
    `days_until = local_date - (now() AT TIME ZONE coalesce(timezone, 'UTC'))::date`.

#### Reminder Windows & Bounded Catch-Up Selection
The runner evaluates three reminder stages: `1d`, `3d`, and `7d`.

To prevent flooding a user with multiple stale reminders if the runner executed late or was temporarily delayed, each run evaluates the **most urgent applicable single stage** using this deterministic ladder:

```typescript
function selectDeadlineWindow(hoursUntil: number): "1d" | "3d" | "7d" | null {
  // 1-Day Window: due in <= 24 hours, but not more than 24 hours overdue
  if (hoursUntil <= 24 && hoursUntil > -24) {
    return "1d";
  }
  // 3-Day Window: due in <= 72 hours and > 24 hours
  if (hoursUntil <= 72 && hoursUntil > 24) {
    return "3d";
  }
  // 7-Day Window: due in <= 168 hours and > 72 hours
  if (hoursUntil <= 168 && hoursUntil > 72) {
    return "7d";
  }
  return null;
}
```

*Example*: If a deadline is currently 2.5 days (60 hours) away because the 7-day window was missed, the runner generates **only** the `3d` reminder once. It does not generate a stale `7d` reminder.

---

### 8. Event Change Trigger Rules
Evaluated strictly against `public.event_changes.field_diff` for published events.

#### Substantive Triggering Fields
A notification is generated if `field_diff` contains any of:
- `status`: transitions to `'cancelled'`. (Type: `event_cancelled`).
- `start_date`, `end_date`, `start_at`, `end_at`, `timezone`: event date/time modified. (Type: `event_time_changed`).
- `registration_status`: meaningful transition (e.g. `open` $\leftrightarrow$ `closed`, `waitlist`). (Type: `event_updated`).
- `mode`, `venue`, `city`, `state`, `country`: participation mode or location updated. (Type: `event_updated`).
- `event_deadlines`: active registration deadline added, removed, or changed. (Type: `event_updated`).

#### Ignored Fields (Zero Notifications)
- Admin audit reason text (`reason`).
- Audit actor ID (`actor_id`).
- Verification bookkeeping alone (`verification_status`, `last_checked_at`).
- Source metadata and internal evidence (`event_sources`, `raw_storage_ref`).
- Description prose formatting (`short_description`, `full_description`).
- `updated_at` alone.

#### Single Notification Invariant
If a single `event_change` modifies multiple substantive fields (e.g. both `start_date` and `venue`), the system creates **ONE** consolidated logical notification for that change/user:
`idempotency_key = event-change:${change.id}:${user_id}`.

---

### 9. Event Change Runner Architecture
- **Frequency**: Every hour.
- **Cursor Tracking**: Persisted in `private.notification_runner_cursors` using composite key `(cursor_timestamp, cursor_id)`.
- **Batch Progression**:
  1. Queries at most 100 `event_changes` records strictly after cursor:
     ```sql
     SELECT * FROM public.event_changes
     WHERE (created_at, id) > (cursor_timestamp, cursor_id)
     ORDER BY created_at ASC, id ASC
     LIMIT 100;
     ```
  2. For each substantive change:
     - Identifies the event.
     - Bulk-fetches saved subscribers from `public.saved_events` joined with `public.notification_preferences` in bounded chunks of **maximum 500 users** per database query.
     - Bulk-inserts notifications using `ON CONFLICT (user_id, idempotency_key) DO NOTHING`.
  3. Cursor advances **only after** the complete batch of 100 changes (and all its subscriber chunks) has been safely processed. If a failure occurs, the cursor does not advance, ensuring reliable replay upon the next run.

---

### 10. Durable Lease Contract (`private.notification_runner_leases`)
To guarantee mutual exclusion across stateless PostgREST HTTP calls without session-bound advisory locks:

#### Lease Table Schema
```sql
CREATE TABLE private.notification_runner_leases (
  job_name text PRIMARY KEY,
  lease_owner text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  last_started_at timestamptz NOT NULL DEFAULT now(),
  last_completed_at timestamptz
);
```

#### Standard Jobs
- `deadline-reminders`
- `event-changes`
- `email-delivery`
- `notification-retention`

#### Lease Rules
- **TTL Duration**: 10 minutes (600 seconds).
- **Atomic Acquisition (`private.acquire_runner_lease`)**:
  Inserts or updates the lease row **only if** `lease_expires_at < now()`. Returns `true` if acquired, `false` if another runner instance holds an active lease.
- **Early Release (`private.release_runner_lease`)**:
  Sets `last_completed_at = now()` and sets `lease_expires_at = now()` if `lease_owner = p_owner`.
- **Crash Recovery**: If a worker crashes or encounters an unhandled exception, its lease naturally expires after 10 minutes, allowing subsequent runs to resume automatically.
- **Owner ID**: A cryptographically random server-generated UUID (`crypto.randomUUID()`). Never exposed publicly.

---

### 11. Email Delivery Queue & Retry State Machine
- **Frequency**: Every 15 minutes.
- **Batch Size**: Maximum 50 deliveries per invocation.
- **Queue Table**: `public.notification_deliveries`.

#### State Transitions
$$\text{'pending'} \xrightarrow{\text{claim}} \text{'processing'} \xrightarrow{\text{send}} \begin{cases} \text{'sent'} & (\text{success}) \\ \text{'retryable'} & (\text{transient failure, attempts} < 3) \\ \text{'failed'} & (\text{attempts} \ge 3 \text{ or permanent}) \\ \text{'suppressed'} & (\text{event unpub. / unverified email}) \end{cases}$$

#### Atomic Claim Mechanism
To prevent race conditions between concurrent workers:
```sql
UPDATE public.notification_deliveries
SET status = 'processing', updated_at = now()
WHERE id IN (
  SELECT id FROM public.notification_deliveries
  WHERE status IN ('pending', 'retryable')
    AND next_attempt_at <= now()
  ORDER BY next_attempt_at ASC, id ASC
  LIMIT 50
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

#### Retry Backoff Ladder
- Attempt 1 failure $\rightarrow$ `status = 'retryable'`, `next_attempt_at = now() + INTERVAL '5 minutes'`.
- Attempt 2 failure $\rightarrow$ `status = 'retryable'`, `next_attempt_at = now() + INTERVAL '30 minutes'`.
- Attempt 3 failure $\rightarrow$ `status = 'failed'` (terminal, no further retries).
- Known permanent provider errors (e.g. invalid domain, hard bounce) immediately transition to `status = 'failed'`.

---

### 12. Email Visibility Check at Send Time
Immediately before rendering and dispatching an email delivery:
1. Re-query `events.publication_status` for the linked `event_id`.
2. **If `publication_status === 'published'`**: Render email with public title, details, and `/events/<slug>` link.
3. **If `publication_status !== 'published'` (draft, review, unpublished, archived, deleted)**:
   - **Suppress the email immediately**: Set delivery `status = 'suppressed'` with `last_error_code = 'EVENT_UNPUBLISHED'`.
   - **Rationale**: Email cannot be recalled once sent. Sending an email about an opportunity that is no longer public or active provides zero value and risks student confusion or unauthorized information disclosure.

---

### 13. Transactional Email Provider Configuration & Testing Boundary
- **Transport Abstraction (`src/lib/notifications/email.ts`)**:
  - `EmailSender` interface: `send(payload: EmailPayload): Promise<SendResult>`.
  - `DevelopmentEmailSender`: In-memory recording / console logging (default in dev and local test harnesses).
  - `TransactionalApiEmailSender`: HTTP REST client using server-only environment variables `NOTIFICATION_EMAIL_API_KEY` and `NOTIFICATION_EMAIL_FROM`.
- **Production Sending Boundary**:
  - Production email delivery is **not** launch-ready until an owned, verified sending domain and deliverability DNS records (SPF, DKIM, DMARC) are provisioned.
  - If unconfigured, the transport safely logs and marks deliveries as suppressed/disabled without throwing unhandled exceptions.
- **Log Sanitation**: Normal application logs must **never** print recipient email addresses, email message bodies, provider HTTP responses, or API keys.
- **Zero Real Emails in Tests**: Local test harnesses and hosted verification suites strictly use the mock sender; zero real emails are ever dispatched during testing.

---

### 14. Hidden Event Storage & Dynamic Presentation
To ensure direct inspection of a user's own `public.notifications` row can never leak details of a subsequently unpublished event:
1. **Generic Stored Copy**:
   - `title`: `"Registration deadline reminder"`
   - `body`: `"A saved opportunity has an upcoming registration deadline."`
   - Stored copy **never** contains the event's title or specific details.
2. **Dynamic Server Presentation**:
   - When `/notifications` is fetched, the server performs a bounded join with `events(id, slug, title, publication_status)`.
   - **If Published**: Dynamically prepends public title (`"${event.title}: Registration deadline reminder"`) and generates verified relative action link (`/events/${event.slug}`).
   - **If Unpublished / Deleted**: Suppresses action link (`action_url = null`), omits event title, and renders a neutral notice: *"This opportunity is no longer published."*

---

### 15. Retention & Purging Policy
To prevent notification tables from growing unboundedly:
- **Read Notifications**: Eligible for deletion after **60 days** (`read_at < now() - INTERVAL '60 days'`).
- **Unread Notifications**: Eligible for deletion after **180 days** (`created_at < now() - INTERVAL '180 days'`).
- **Terminal Deliveries**: Rows with `status IN ('sent', 'failed', 'suppressed')` eligible after **30 days**.
- **Active Deliveries Protection**: A logical notification is **never** deleted while it still has active deliveries (`status IN ('pending', 'processing', 'retryable')`).
- **Retention Worker Cadence**: Evaluated **once daily** (`0 2 * * *`).
- **Bounded Deletion Limit**: Maximum **500 deletions per table per invocation** (`DELETE ... WHERE id IN (SELECT id ... LIMIT 500)`). No unlimited DELETE queries.
- **Permanent Records**: Runner leases, cursors, and immutable audit logs (`public.event_changes`) are preserved permanently.

---

### 16. Hardened Runner Endpoint (`POST /api/notifications/runner`)
- **HTTP Method**: `POST` only.
- **Authentication**: Requires header:
  `Authorization: Bearer <NOTIFICATION_RUNNER_SECRET>`
- **Secret Rejection**:
  - Missing header $\rightarrow$ HTTP 401.
  - Invalid secret $\rightarrow$ HTTP 401.
  - Secret passed in URL query string or body $\rightarrow$ HTTP 401 (strictly rejected).
- **Constant-Time Verification**: Uses Node.js `crypto.timingSafeEqual` over SHA-256 digests to prevent timing attacks.
- **Cache Headers**: `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.
- **Response Format**: Minimal non-sensitive summary counts:
  ```json
  {
    "ok": true,
    "duration_ms": 142,
    "processed": {
      "deadlineReminders": 12,
      "eventChanges": 3,
      "emailDeliveries": 5,
      "retentionPurged": 0
    }
  }
  ```
  Never returns user IDs, email addresses, event titles, delivery error messages, or secrets.

---

### 17. Concrete Batch & Query Limits Summary

| Operation | Batch / Query Limit | Strategy |
|---|---|---|
| `/notifications` Page | **24 items** (+1 lookahead) | Keyset pagination on `(created_at, id)` |
| Deadline Lookup | Max **500 qualifying deadlines** | Bounded index scan |
| Subscriber Lookup | Max **500 subscribers per chunk** | Keyset pagination on `(user_id, event_id)` |
| Event Changes Sweeper | Max **100 event_changes per run** | Keyset pagination on `(created_at, id)` |
| Email Deliveries Sweeper | Max **50 deliveries per run** | Atomic claim with `FOR UPDATE SKIP LOCKED` |
| Retention Purge | Max **500 rows per table per run** | Bounded keyset `DELETE ... WHERE id IN (...)` |
| Navigation Badge | **1 count query** | Index-only scan on partial index |

Zero unbounded scans into application memory.

---

### 18. Hosted Verification Protocol (`scripts/verify-notifications-hosted.mjs`)
Performs strict read-only and permission verification against the linked hosted Supabase project:
1. **Anonymous Negative Check**: Anonymous client cannot read or query `public.notifications` or `public.notification_preferences`.
2. **Cross-User Isolation**: User A cannot read or mark read User B's notifications.
3. **Privileged Write Protection**: Ordinary authenticated users are strictly blocked from inserting into `public.notifications` or `public.notification_deliveries`.
4. **Internal State Isolation**: `private.notification_runner_leases` and `private.notification_runner_cursors` are completely inaccessible to authenticated users.
5. **Endpoint Security**: `POST /api/notifications/runner` rejects missing, invalid, or query-param bearer tokens.
6. **Zero Real Emails**: Mocks verify zero outbound network calls are made.
7. **Clean Fixture Teardown**: Temporary accounts, preferences, notifications, and deliveries are deleted with exact ID tracking.
8. **Inventory Conservation**: Verifies pre-test and post-test table counts are identical.

---

### 19. Comprehensive Regression & Validation Suite

```sh
# 1. Platform regressions
npm test
npm run test:admin
npm run test:saves
npm run test:for-you

# 2. Notifications-specific suites
npm run test:notifications
npm run test:notifications:ui
npm run test:notifications:hosted

# 3. Static analysis & boundaries
npm run db:types:check
npm run typecheck
npm run lint
npm run build
npm run test:bundle
npm run test:boundary

# 4. Clean git check
git diff --check
git status
```

---

## 3. Database Migration DDL (`20260924000100_notifications.sql`)

```sql
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

CREATE POLICY notification_preferences_select ON public.notification_preferences
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY notification_preferences_insert ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY notification_preferences_update ON public.notification_preferences
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- 2. In-App Notifications Table
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

-- Partial indexes for badge counts and keyset pagination
CREATE INDEX notifications_user_unread_idx ON public.notifications(user_id, created_at DESC)
  WHERE in_app_visible = true AND read_at IS NULL;
CREATE INDEX notifications_user_list_idx ON public.notifications(user_id, created_at DESC, id DESC)
  WHERE in_app_visible = true;

-- 3. Bounded Mutation RPCs (SECURITY INVOKER)
CREATE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE id = p_notification_id AND user_id = (SELECT auth.uid()) AND read_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.mark_all_notifications_read()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
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
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- 4. Notification Email Deliveries Table (System-Only)
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

CREATE FUNCTION private.acquire_runner_lease(p_job_name text, p_owner text, p_duration_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO private.notification_runner_leases (job_name, lease_owner, lease_expires_at, last_started_at)
  VALUES (p_job_name, p_owner, now() + (p_duration_seconds || ' seconds')::interval, now())
  ON CONFLICT (job_name) DO UPDATE
    SET lease_owner = p_owner,
        lease_expires_at = now() + (p_duration_seconds || ' seconds')::interval,
        last_started_at = now()
    WHERE private.notification_runner_leases.lease_expires_at < now();
  RETURN FOUND;
END;
$$;

CREATE FUNCTION private.release_runner_lease(p_job_name text, p_owner text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE private.notification_runner_leases
  SET lease_expires_at = now(),
      last_completed_at = now()
  WHERE job_name = p_job_name AND lease_owner = p_owner;
END;
$$;

REVOKE ALL ON FUNCTION private.acquire_runner_lease FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.acquire_runner_lease TO service_role;
REVOKE ALL ON FUNCTION private.release_runner_lease FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.release_runner_lease TO service_role;

COMMIT;
```

---

## 4. Expected Deliverables & File Changes (Upon Approval)

### New Files
1. `supabase/migrations/20260924000100_notifications.sql`: Complete additive database schema, RLS, functions, leases, and cursors.
2. `src/lib/notifications/types.ts`: TypeScript contracts, DTOs, preference interfaces, and validation predicates.
3. `src/lib/notifications/service.ts`: Authenticated client service (notifications listing, unread count, read mutations, preferences).
4. `src/lib/notifications/runner.ts`: Server-only background runner (deadline sweeper, change sweeper, lease manager, retention purge).
5. `src/lib/notifications/email.ts`: Pluggable transactional email transport with test/development logging mode.
6. `src/app/notifications/page.tsx`: In-app notification center with responsive design and hidden-event safety.
7. `src/app/notifications/actions.ts`: Server actions for marking notifications read.
8. `src/app/api/notifications/runner/route.ts`: Protected runner invocation endpoint (`Authorization: Bearer`).
9. `src/components/notifications.tsx`: Notification card list, timestamps, action buttons, and empty state.
10. `src/components/notification-preferences.tsx`: Form controls for notification channels and topics.
11. `tests/notifications/notifications.test.mjs`: Node test suite covering all 21 test scenarios.
12. `scripts/test-notifications-ui.mjs`: Playwright browser UI suite across 320px, 390px, 768px, and 1280px.
13. `scripts/verify-notifications-hosted.mjs`: Hosted verification script with exact cleanup.
14. `docs/section-36-notifications-review.md`: Complete milestone review document.

### Modified Files
1. `src/components/public-events.tsx`: Add single-query unread notification indicator badge to shared authenticated navigation in `DiscoveryShell`.
2. `src/app/account/page.tsx`: Link to `/notifications` and embed notification preference controls.
3. `package.json`: Add scripts `test:notifications`, `test:notifications:ui`, and `test:notifications:hosted`.
4. `PROJECT_STATE.md`: Update milestones and recorded checkpoints.
5. `README.md`: Document notification commands and verification instructions.
