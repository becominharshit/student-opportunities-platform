# Organizer & Community Event Submissions Review

24 September 2026. **Complete — review approved.** Baseline: clean `main` at `14b0adc89022f53f51f7914154cb256b8d1bb6ee` (Notifications milestone approved and committed). AI assistant, Notifications 1.1, C19 redesign, and C20/C21 have not started. C09–C11 and C17 remain strictly DEFERRED.

---

## 1. Objectives & Executive Summary

The Organizer & Community Event Submissions milestone introduces an authenticated workflow allowing student organizers, event hosts, and community members to submit technology opportunities for administrative review, without compromising the platform's core truth invariants or public catalogue integrity:

1. **Untrusted Evidence Isolation (Cardinal Safety Invariant)**:
   - A community submitted event **never** appears in the public catalogue automatically.
   - Submissions are strictly treated as untrusted evidence and input for platform administrators.
   - When accepted by an administrator, the submission is converted into a private canonical event **draft** (`publication_status = 'draft'`, `verification_level = 'community_submitted'`, `verification_status = 'pending'`).
   - The opportunity becomes public **only** after an administrator explicitly reviews and publishes the draft event through the existing C05 publication workflow and safety guards.
2. **Schema-Level Separation of Moderation Data**:
   - Submitters can inspect only their own submitted inputs and user-facing status.
   - Admin-private metadata (`canonical_event_id`, `reviewed_by`, `reviewer_email`, `internal_notes`) is physically stored in `private.event_submission_moderation`, inaccessible to ordinary users.
   - Submitter dashboard resolves a public link (`/events/[slug]`) **only** when `events.publication_status = 'published'`. If the canonical event is in draft or unpublished state, no link is returned.
3. **Privileged Write & Read Boundaries**:
   - Direct `INSERT`, `UPDATE`, and `DELETE` privileges on `public.event_submissions` are strictly revoked from ordinary authenticated users (`GRANT SELECT ON public.event_submissions TO authenticated`).
   - Ordinary authenticated users cannot execute direct mutations on the table, preventing any manipulation of moderation fields or bypass of audit triggers.
   - All submitter actions execute through bounded `SECURITY DEFINER` RPCs (`submit_event_opportunity`, `edit_event_submission`, `withdraw_event_submission`).
   - All administrator reviews and queries execute through bounded `SECURITY DEFINER` RPCs (`list_admin_submissions`, `get_admin_submission`, `get_admin_submission_history`, `start_review_event_submission`, `reject_event_submission`, `accept_event_submission`) that strictly enforce administrator membership via `private.require_admin_role()`.
4. **Abuse Mitigation & Rate Limiting**:
   - Submissions require an authenticated student session with confirmed email (`email_confirmed_at IS NOT NULL`). Anonymous submissions are strictly rejected.
   - Serialized submitter advisory locks (`pg_advisory_xact_lock`) eliminate race conditions.
   - Rolling 24-hour rate limit: maximum 5 submissions per user in any 24-hour window (`errcode = 'P0529'`).
   - Rolling 24-hour duplicate flood guard: repeat submissions with matching normalized title within 24 hours are blocked (`errcode = 'P0528'`).
   - Strict payload size limits (64 KB for submitter payloads, 128 KB for admin mutations) and strict input validation.
5. **Single Additive Database Migration**:
   - Exactly one additive migration: `supabase/migrations/20260924000200_organizer_submissions.sql`.
   - Total migration count: 11. Applied to hosted Supabase with zero database resets and zero hosted event fixtures.

---

## 2. Technical Architecture & Database Contracts

### Database Migration (`20260924000200_organizer_submissions.sql`)

1. **`public.event_submissions`**:
   - **Primary Key**: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - **Submitter Info**: `submitter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL`
   - **Status**: `status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'accepted', 'rejected', 'withdrawn'))`
   - **Relationship**: `submitter_relationship text NOT NULL CHECK (submitter_relationship IN ('organizer', 'participant', 'community_member', 'other'))`
   - **Submitted Facts**: `title`, `organizer_name`, `category_slug`, `mode`, `official_url`, `registration_url`, `start_date`, `end_date`, `registration_deadline_precision`, `registration_deadline_local_date`, `registration_deadline_due_at`, `registration_deadline_timezone`, `venue`, `city`, `state`, `country`, `description`, `eligibility_summary`, `min_team_size`, `max_team_size`, `fee_status`, `fee_amount`, `currency`, `prize_description`, `submitter_notes`.
   - **Submitter Rejection View**: `rejection_reason_code`, `rejection_reason_details`.
   - **Concurrency**: `version integer NOT NULL DEFAULT 1 CHECK (version > 0)`.
   - **Table Grants**:
     - `REVOKE ALL ON TABLE public.event_submissions FROM anon, authenticated, public;`
     - `GRANT SELECT ON TABLE public.event_submissions TO authenticated;`
     - `GRANT ALL ON TABLE public.event_submissions TO service_role;`
   - **RLS Policy**:
     - `event_submissions_submitter_select`: Submitter reads only their own rows (`auth.uid() = submitter_user_id`).
   - **Table Constraints**:
     - `CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)`
     - `CHECK (min_team_size IS NULL OR max_team_size IS NULL OR min_team_size <= max_team_size)`
     - `CHECK (official_url IS NOT NULL OR registration_url IS NOT NULL)`
     - `CHECK (registration_deadline_precision IN ('unknown', 'date_only', 'datetime'))` with strict date/time presence invariants.
2. **`private.event_submission_moderation`**:
   - Private admin-only storage quarantined in `private` schema.
   - **Columns**: `submission_id uuid PRIMARY KEY REFERENCES public.event_submissions(id) ON DELETE CASCADE`, `canonical_event_id uuid UNIQUE REFERENCES public.events(id) ON DELETE SET NULL`, `reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`, `reviewed_at timestamptz`, `internal_notes text`, `created_at`, `updated_at`.
   - Zero access granted to browser clients (`anon` or `authenticated`). Accessible only through administrative `SECURITY DEFINER` RPCs and server service role.
3. **`public.submission_moderation_events`**:
   - Append-only audit history table.
   - **Columns**: `id`, `submission_id`, `action` ('submitted', 'edited', 'review_started', 'rejected', 'accepted', 'withdrawn'), `actor_id`, `actor_role` ('submitter', 'admin'), `from_status`, `to_status`, `public_notes`, `internal_notes`, `created_at`.
   - RLS enabled; table access granted exclusively to administrators via RLS policy and `service_role`.
4. **Indexes**:
   - `event_submissions_submitter_idx`: `(submitter_user_id, created_at DESC, id DESC)` (covers submitter dashboard keyset pagination and rolling 24-hour rate-limit / duplicate checks via index-only scans; note that PostgreSQL disallows volatile expressions like `now()` in index predicates)
   - `event_submissions_status_idx`: `(status, created_at DESC, id DESC)`
   - `event_submissions_created_idx`: `(created_at DESC, id DESC)`
   - `submission_moderation_events_submission_idx`: `(submission_id, created_at ASC)`

---

## 3. Submitter & Admin RPC Contracts

### Submitter RPCs (Callable by Confirmed Authenticated Users)

1. **`submit_event_opportunity(p_payload jsonb)`**:
   - Enforces authenticated user with confirmed email.
   - Rejects unexpected keys and payloads exceeding 64 KB.
   - Acquires submitter transaction advisory lock.
   - Evaluates rolling 24-hour rate limit (< 5 submissions).
   - Evaluates 24-hour duplicate title flood guard.
   - Inserts row with `status = 'submitted'`, `version = 1`.
   - Records audit event `action = 'submitted'`.
   - Returns submission JSON.
2. **`edit_event_submission(p_command jsonb)`**:
   - Allows edits only while `status = 'submitted'`.
   - Requires caller identity to match `submitter_user_id`.
   - Enforces optimistic concurrency (`expected_version = version`).
   - Increments version and logs audit event `action = 'edited'`.
3. **`withdraw_event_submission(p_command jsonb)`**:
   - Allows withdrawal while in `submitted` or `under_review`.
   - Updates status to `withdrawn` and logs audit event `action = 'withdrawn'`.
4. **`list_user_submissions(p_limit, p_cursor_created_at, p_cursor_id)`**:
   - Returns submitter's own submissions with lookahead keyset pagination.
   - Resolves `published_event_slug` only if the canonical event has `publication_status = 'published'`.

### Administrator RPCs (Strictly Guarded by `private.require_admin_role()`)

1. **`list_admin_submissions(p_status, p_limit, p_cursor_created_at, p_cursor_id)`**:
   - Queries queue filtered by status ('submitted', 'under_review', 'accepted', 'rejected', 'withdrawn') or all.
   - Joins submitter email and canonical event ID.
2. **`get_admin_submission(p_submission_id)`**:
   - Returns composite object containing `submission`, `moderation`, `audit_events`, and linked `canonical_event` (if accepted).
3. **`get_admin_submission_history(p_submission_id)`**:
   - Returns complete timeline of moderation events with actor roles and timestamps.
4. **`start_review_event_submission(p_command jsonb)`**:
   - Transitions status from `submitted` to `under_review`.
   - Records reviewer ID, timestamp, and optional internal notes.
5. **`reject_event_submission(p_command jsonb)`**:
   - Validates rejection reason code ('duplicate', 'source_invalid', 'insufficient_information', 'not_relevant', 'expired_event', 'cannot_verify', 'spam_abuse', 'other').
   - Transitions status to `rejected`, stores public explanation in `event_submissions`, and records internal notes in `private.event_submission_moderation`.
6. **`accept_event_submission(p_command jsonb)`**:
   - Atomic two-phase conversion in a single transaction:
     - Strips `publication_status` from patch (enforcing C05 default `'draft'`).
     - Ensures valid `date_precision` (`'date_only'` when dates exist).
     - Invokes C05 `public.mutate_event` with `action: 'create'`, creating a canonical draft opportunity with `verification_level = 'community_submitted'`, `verification_status = 'pending'`.
     - Links `canonical_event_id` in `private.event_submission_moderation`.
     - Transitions submission status to `'accepted'`.
     - Records audit event `action = 'accepted'`.
     - Transaction rolls back completely if event creation or linking encounters any failure.

---

## 4. Duplicate Candidate Detection

To protect administrators from accepting duplicate opportunities, `findDuplicateCandidates` evaluates multiple signals:

1. **Normalized Title Search**: Queries canonical events using exact case-insensitive normalized title matching (via `.ilike("title", normalizedTitle)` without wildcards).
2. **Official URL Search**: Queries canonical events where `official_url` or `registration_url` matches the submitted link.
3. **Registration URL Search**: Queries canonical events where `registration_url` matches the submitted registration link.
4. **Duplicate Warning UI**: Displays existing matches in the administrator review screen with publication status, slug, links, and specific match reasons (*"Exact or matching title"*, *"Matching official/registration link"*).

---

## 5. Verification & Test Evidence

### 1. Automated Test Suite (`npm test`)
- **Command**: `npm test`
- **Result**: **406 of 406 tests passed** (0 failures).
- All 394 existing regression contracts across C01–C18, Calendar Export, and Notifications 1.0 continue to pass completely without regression.
- All 12 new Organizer Submissions test cases pass.

### 2. Milestone Unit & Security Tests (`npm run test:submissions`)
- **Command**: `npm run test:submissions`
- **Result**: **12 of 12 tests passed**.
  - `Anonymous user cannot submit`: Verified 401 rejection for unauthenticated callers.
  - `Submitter creates valid submission`: Verified valid insertion with version 1 and status `submitted`.
  - `24-Hour duplicate title flood guard rejects repeat`: Verified rejection with error code `P0528`.
  - `24-Hour rate limit allows max 5 submissions`: Verified rate limiting on 6th attempt with error code `P0529`.
  - `Submitter edits submission while submitted`: Verified field editing and optimistic concurrency increment.
  - `Submitter withdraws submission while submitted`: Verified status transition to `withdrawn`.
  - `Cross-user RLS isolation and direct table write revocation`: Verified direct `INSERT`/`UPDATE`/`DELETE` denied (42501) and User B cannot read User A's submission.
  - `Admin authorization checks on admin RPCs`: Verified non-admin callers rejected with forbidden error (`P0503`).
  - `Admin starts review and rejects submission`: Verified transition from `submitted` $\rightarrow$ `under_review` $\rightarrow$ `rejected` with recorded reason code.
  - `Admin accepts submission, creates draft canonical event, and publishes`: Verified atomic draft event creation and linking in accept_event_submission (draft, community_submitted, pending; submitter slug remains null), followed by simulated administrative C05 publication flow.
  - `Admin acceptance transaction rolls back cleanly on error`: Verified complete transactional rollback when event creation fails.
  - `Admin queue status filtering`: Verified queue filtering by status and keyset pagination.

### 3. Query Plan & Performance Verification (`npm run test:submissions:performance`)
- **Command**: `npm run test:submissions:performance`
- **Result**: **PASS**. Verified against 2,000 synthetic submissions using `EXPLAIN ANALYZE`:
  - `event_submissions_submitter_idx`: Index Scan backward on `(submitter_user_id, created_at, id)` for submitter dashboard pagination, and Index Only Scan for rolling 24-hour duplicate / rate-limit checks.
  - `event_submissions_created_idx`: Index Scan on `(created_at, id)` for admin moderation queue queries.

### 4. Responsive UI Verification across 4 Canonical Viewports (`npm run test:submissions:ui`)
- **Command**: `npm run test:submissions:ui`
- **Result**: **PASS** across all viewports with **0 horizontal overflow**:
  - `320px` (small mobile): Form inputs, status badges, buttons render cleanly without clipping or overflow.
  - `390px` (standard mobile): Full submitter and admin moderation flows render cleanly.
  - `768px` (tablet portrait): Grid layout adapts cleanly.
  - `1280px` (desktop): Full two-column review interface, duplicate detection card, and audit timeline display properly.
  - Keyboard navigation, visible focus rings, explicit form labels, and semantic headings verified.

### 5. Hosted Supabase Acceptance & Security Verification (`npm run test:submissions:hosted`)
- **Command**: `npm run test:submissions:hosted`
- **Result**: **PASS**.
  - Verified remote migrations: 11 of 11 applied and up to date.
  - Verified anonymous RLS restrictions and negative RPC access checks.
  - Verified direct table write revocation on `public.event_submissions` (`42501`).
  - Verified temporary submitter accounts A and B: submission creation, cross-user isolation, editing, and withdrawal.
  - Verified temporary admin account C: queue listing, detail retrieval, review start, and rejection with audit history.
  - **Zero event fixtures invariant preserved**: `accept_event_submission` was intentionally bypassed on hosted to prevent creating un-deletable canonical event fixtures.
  - **100% row count conservation**: All 15 monitored tables verified with before-and-after inventory counts; all temporary test users and submissions cleanly purged.

### 6. Architectural Boundary & Bundle Checks
- `npm run db:types:check`: **PASS** (database types match clean migrations).
- `npm run typecheck`: **PASS** (zero TypeScript compiler errors).
- `npm run lint`: **PASS** (zero ESLint warnings or errors with `--max-warnings=0`).
- `npm run build`: **PASS** (all routes compiled cleanly in production mode).
- `npm run test:bundle`: **PASS** (zero leaked secrets or server references in browser assets).
- `npm run test:boundary`: **PASS** (client/server boundary strictly enforced).
- `git diff --check`: **PASS** (zero whitespace errors or merge conflicts).

---

## 6. Limitations, Known Boundaries & Deferred Work

1. **No Automatic Ingestion / Scraping**:
   - The platform does not automatically crawl or scrape submitted URLs. Community submissions are human-reviewed untrusted inputs.
   - C09–C11 and C17 remain strictly deferred until post-beta authorization.
2. **No Document / PDF Uploads**:
   - File uploads are out of scope. Submitters provide official web URLs and registration links.
3. **No Automatic Publication**:
   - Acceptance by an administrator creates a canonical event in `'draft'` state. It does not become public until explicitly published via standard C05 administrative operations.
4. **AI Assistant & Visual Redesign**:
   - AI assistant features remain out of scope.
   - C19 visual redesign and C20/C21 remain unstarted.
