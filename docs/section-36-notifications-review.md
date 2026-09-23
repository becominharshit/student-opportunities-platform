# Notifications Milestone Review

24 September 2026. **Implemented — awaiting review.** Baseline: clean `main` at `94a766c08cf5b2173a0280ad51cd87ce614ad562` (Calendar Export approved and committed). Notifications milestone changes remain uncommitted and unstaged pending owner review. Notifications 1.1 (recommendations), organizer submissions, AI assistant, C19 redesign, and C20/C21 have not started. C09–C11 and C17 remain strictly DEFERRED.

---

## 1. Objectives & Executive Summary

The Notifications milestone introduces an asynchronous, privacy-preserving notification engine for authenticated students across two initial channels:

1. **In-App Notifications (`/notifications`)**:
   - Navigation bar unread count indicator with partial index acceleration.
   - Lookahead keyset pagination (24 items + 1 lookahead) using composite cursor `(created_at, id)` to prevent page drift.
   - Bounded mark-as-read and mark-all-as-read mutations via secure route handlers and SECURITY DEFINER RPCs.
   - Safe dynamic resolution: Stored notifications contain only generic text; published event titles are prepended on the fly; unpublished or deleted events omit action links and display neutral copy (*"This opportunity is no longer published."*).
2. **Transactional Email**:
   - Clean server-only transport abstraction (`DevelopmentEmailSender` in test/local; `TransactionalApiEmailSender` for production).
   - Conservative opt-in default (`email_enabled = false`) requiring explicit student consent.
   - Pre-send publication check immediately before dispatch: suppresses delivery with code `EVENT_UNPUBLISHED` if the opportunity was unpublished, draft, or archived.
   - Zero real emails sent during tests or verification suites.
3. **Privileged System Write Boundary & Durability**:
   - Zero direct client writes to `public.notifications` or `public.notification_deliveries`.
   - Durable runner lease system (`private.notification_runner_leases`) with TTL preventing overlapping cron executions across stateless serverless invocations.
   - Durable cursor tracking (`private.notification_runner_cursors`) for substantive `event_changes` sweeper.
   - Constant-time secret authentication on runner endpoint (`/api/notifications/runner`).
4. **Single Additive Database Migration**:
   - Exactly one additive migration: `supabase/migrations/20260924000100_notifications.sql`.
   - Total migration count: 10. No database resets or destructive operations applied.

---

## 2. Technical Architecture & Database Contracts

### Database Migration (`20260924000100_notifications.sql`)

1. **`public.notification_preferences`**:
   - Columns: `user_id` (PK), `in_app_enabled` (default `true`), `email_enabled` (default `false`), `deadlineReminders` (default `true`), `eventChanges` (default `true`), `recommendations` (default `false`, reserved for 1.1), `created_at`, `updated_at`.
   - RLS: Authenticated users may read, insert, and update **only** their own row (`auth.uid() = user_id`).
   - Table grants: `GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated`.
2. **`public.notifications`**:
   - Columns: `id` (UUID PK), `user_id`, `type`, `event_id`, `event_version`, `title`, `body`, `action_url`, `idempotency_key`, `in_app_visible`, `read_at`, `created_at`.
   - RLS: Authenticated users may read only their own rows where `in_app_visible = true`.
   - Table grants: `REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated, anon;` `GRANT SELECT ON public.notifications TO authenticated;`.
   - Partial indexes:
     - `notifications_user_unread_idx` on `(user_id, created_at DESC) WHERE in_app_visible = true AND read_at IS NULL`.
     - `notifications_user_list_idx` on `(user_id, created_at DESC, id DESC) WHERE in_app_visible = true`.
     - `notifications_event_id_idx` on `(event_id) WHERE event_id IS NOT NULL`.
3. **`public.notification_deliveries`**:
   - Columns: `id`, `notification_id`, `user_id`, `channel` ('email'), `status` ('pending', 'processing', 'sent', 'retryable', 'failed', 'suppressed'), `attempt_count`, `next_attempt_at`, `sent_at`, `last_error_code`, `last_error_message`, `idempotency_key` (UNIQUE), `created_at`, `updated_at`.
   - RLS: Revoked from `public, anon, authenticated`. Granted strictly to `service_role`.
   - Partial index: `notification_deliveries_pending_idx` on `(status, next_attempt_at) WHERE status IN ('pending', 'retryable') AND attempt_count < 3`.
4. **Runner Infrastructure (`private` schema with public SECURITY DEFINER RPCs)**:
   - `private.notification_runner_leases` and `private.notification_runner_cursors` in `private` schema.
   - Public RPCs: `acquire_runner_lease`, `release_runner_lease`, `get_runner_cursor`, `update_runner_cursor`, `claim_email_deliveries`.
   - Grants: Revoked from `public, anon, authenticated`; granted strictly to `service_role`.
5. **Bounded Mutation RPCs**:
   - `mark_notification_read(p_notification_id uuid)`: Updates `read_at = now()` for caller's own row.
   - `mark_all_notifications_read()`: Updates `read_at = now()` for all unread rows of caller.
   - Security: `SECURITY DEFINER SET search_path = ''` to enforce column-level update safety without granting table-level `UPDATE` to ordinary users.

---

## 3. Sweeper Runners & Operational Rules

### 1. Registration Deadline Reminders (`runDeadlineReminders`)
- **Cadence**: Hourly (`0 * * * *`).
- **Source of Truth**: `event_deadlines.kind = 'registration' AND active = true` on published events.
- **Ladder & Bounded Catch-Up**: Evaluates `1d`, `3d`, and `7d` stages. Deterministic ladder picks the single most urgent eligible stage:
  - $\le 24$h and $>-24$h: `1d`
  - $\le 72$h and $> 24$h: `3d`
  - $\le 168$h and $> 72$h: `7d`
- **Idempotency**: Key `deadline:${deadline.id}:${window}` prevents re-sending even if the sweeper runs 100 times.

### 2. Event Change Notifications (`runEventChangeNotifications`)
- **Cadence**: Hourly.
- **Cursor Tracking**: Persisted in `private.notification_runner_cursors`.
- **Substantive Triggers**: Evaluated against `field_diff` for `status = 'cancelled'`, `start_date`, `end_date`, `start_at`, `end_at`, `timezone`, `registration_status`, `mode`, `venue`, `city`, `state`, `country`, and active registration deadlines.
- **Chunking**: Subscribers fetched from `saved_events` in bounded chunks of maximum 500 users.
- **Single Notification Invariant**: Multiple changed fields consolidate into a single notification per change/user (`event-change:${change.id}:${user_id}`).

### 3. Email Delivery Sweeper (`processEmailDeliveries`)
- **Cadence**: Every 15 minutes.
- **Atomic Claim**: Uses `claim_email_deliveries` (`FOR UPDATE SKIP LOCKED`, max 50 rows).
- **Pre-Send Publication Check**: Immediately queries `events.publication_status`. If not published, marks `status = 'suppressed'` with code `EVENT_UNPUBLISHED`.
- **Retry Ladder**: Exponential retry (5m $\rightarrow$ 30m $\rightarrow$ failed after 3 attempts).

### 4. Bounded Retention Purging (`purgeExpiredNotifications`)
- **Read notifications**: Purged after 60 days.
- **Unread notifications**: Purged after 180 days.
- **Terminal deliveries**: Purged after 30 days.
- **Active deliveries protection**: Notifications with pending deliveries are never purged.
- **Batch limit**: Maximum 500 rows per run.

---

## 4. Verification & Validation Summary

### 1. Automated Test Suite (`npm test`)
- **Command**: `npm test`
- **Result**: **394 of 394 tests passed** (including all 21 Notifications test cases in `tests/notifications/notifications.test.mjs`).
  - Anonymous table denial and runner RPC rejection: PASS.
  - Ordinary user direct write/delete blocked: PASS.
  - Cross-user RLS isolation (User A cannot see or mark User B notifications): PASS.
  - Exact default preferences fallback without DB backfill: PASS.
  - In-app visibility toggle (`in_app_visible = false` hidden from in-app list): PASS.
  - Creation gate ($(\text{topic}) \land (\text{in-app} \lor \text{email})$): PASS.
  - Deterministic idempotency on repeat runs: PASS.
  - Bounded deadline window ladder: PASS.
  - Non-registration deadlines produce 0 reminders: PASS.
  - Substantive change classification & cursor advancement: PASS.
  - Mutual exclusion runner lease acquire, conflict, and release: PASS.
  - Email delivery mock dispatch and pre-send suppression on unpublished events: PASS.
  - Safe URL validator allowlist enforcement: PASS.
  - Dynamic title prepending and unpublished redaction: PASS.
  - Lookahead keyset pagination and invalid cursor recovery: PASS.
  - Unread count calculation and mark-read mutation: PASS.
  - Bounded retention purge: PASS.

### 2. Browser UI & Accessibility Test Suite (`npm run test:notifications:ui`)
- **Command**: `npm run test:notifications:ui`
- **Result**: **100% PASS** across all 4 viewports (320px, 390px, 768px, 1280px).
  - Zero horizontal overflow (`document.documentElement.scrollWidth <= innerWidth`): PASS.
  - Unread badge indicator in navigation and cards: PASS.
  - Accessible button states and relative timestamps: PASS.
  - Delivery channels and topic toggles accessible with keyboard focus: PASS.
  - Full-page screenshots captured to `work/notifications/ui/`.

### 3. Query Plan Performance Verification (`npm run test:notifications:performance`)
- **Command**: `npm run test:notifications:performance`
- **Result**: **PASS**. 5,000 synthetic notifications indexed in isolated database.
  - Unread badge count uses Index Only Scan on `notifications_user_unread_idx`.
  - Keyset pagination query uses Index Scan on `notifications_user_list_idx`.
  - Output written to `work/notifications/performance.json`.

### 4. Hosted Verification (`npm run test:notifications:hosted`)
- **Command**: `npm run test:notifications:hosted`
- **Target**: `https://vzuoscpwmytgibsxugcx.supabase.co`
- **Result**: **100% PASS** with clean teardown.
  - Exactly 10 migrations verified on hosted Supabase.
  - Anonymous client denied access to `notifications`, `notification_preferences`, `notification_deliveries`, and runner RPCs.
  - Temporary User A and User B created, authenticated, and tested.
  - Preference upsert and isolation verified.
  - Direct user table writes blocked.
  - Cross-user notification isolation and RPC `mark_notification_read` verified.
  - Complete teardown with 100% inventory conservation across all 13 tables (0 before, 0 after).

### 5. Static Analysis & Build Suite
- `npm run db:types:check`: PASS (Database types match clean migrations).
- `npm run typecheck`: PASS (0 errors).
- `npm run lint`: PASS (0 warnings, 0 errors).
- `npm run test:boundary`: PASS (All 5 server boundaries verified).
- `npm run test:bundle`: PASS (18 browser assets scanned; no private environment values or service-key references).
- `npm run build`: PASS (Production build succeeded with all routes optimized).

---

## 5. Status & Current Git Working Tree

All changes remain **uncommitted and unstaged** for owner review:
- Added `supabase/migrations/20260924000100_notifications.sql`
- Added `src/lib/notifications/types.ts`
- Added `src/lib/notifications/email.ts`
- Added `src/lib/notifications/service.ts`
- Added `src/lib/notifications/runner.ts`
- Added `src/lib/notifications/handler.ts`
- Added `src/app/api/notifications/runner/route.ts`
- Added `src/app/api/notifications/mark-read/route.ts`
- Added `src/app/api/notifications/preferences/route.ts`
- Added `src/components/notifications.tsx`
- Added `src/components/notification-preferences.tsx`
- Added `src/app/notifications/page.tsx`
- Updated `src/app/account/page.tsx`
- Updated `src/components/public-events.tsx`
- Updated `src/lib/supabase/database.types.ts`
- Added `tests/notifications/notifications.test.mjs`
- Added `scripts/explain-notifications.mjs`
- Added `scripts/test-notifications-ui.mjs`
- Added `scripts/verify-notifications-hosted.mjs`
- Updated `scripts/test-server-boundary.mjs`
- Updated `package.json`
