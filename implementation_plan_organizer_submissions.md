# Implementation Plan — Organizer / Community Event Submissions (Final Approved Architecture)

## Milestone Overview & Objective
Allow authenticated users (students, event organizers, or community members) to submit genuine student technology opportunities for administrator review.

### Cardinal Safety Invariant
**A submitted opportunity must NEVER become public automatically.**
Organizer submissions are untrusted evidence and input for administrators. They are **not** verified events, **not** organizer endorsements, **not** eligibility proofs, and **not** published catalogue entries.

```
[ Authenticated Submitter ]
            │
            ▼  RPC: submit_event_opportunity(payload)
               (Advisory-locked, rate-limited, duplicate-checked, atomic audit)
[ Public Submissions Table ] (status: 'submitted', RLS private to submitter + admin)
  (submitter-safe columns ONLY; NO internal notes, NO canonical event ID, NO reviewer ID)
            │
            ▼  Admin inspects /admin/submissions/[id]
               (Deterministic URL & title duplicate candidates check)
[ Moderation Review ] (RPC: start_review_event_submission, status: 'under_review')
       ┌────┴───────────────────────────┐
       ▼                                ▼
[ RPC: reject_event_submission ]   [ RPC: accept_event_submission ]
• Structured reason code           • Transactional single-RPC acceptance
• User-facing explanation          • Calls C05 mutate_event(action = 'create')
• Private notes stored in          • Forces publication_status = 'draft'
  private.event_submission_moderation • Forces verification_level = 'community_submitted'
• status: 'rejected'               • Forces verification_status = 'pending'
• Moderation audit logged          • Populates private.event_submission_moderation
                                   • status: 'accepted'
                                   • Moderation audit logged
                                        │
                                        ▼
                           [ Canonical Event Workflow ]
                           • publication_status = 'draft'
                           • verification_level = 'community_submitted'
                           • verification_status = 'pending'
                           • C05 evidence & verification checks
                           • ONLY after normal manual admin publish
                                        │
                                        ▼
                           [ Public Catalogue (/explore) ]
```

---

## 1. Privilege Boundaries & Revocation of Direct Table Writes

### The RLS Column Exposure Vulnerability
PostgreSQL Row Level Security (RLS) protects rows, **not individual columns**. Granting `INSERT` or `UPDATE` on `public.event_submissions` to authenticated users would allow a malicious client to craft REST payloads writing or modifying arbitrary columns (e.g. attempting to set status, assign canonical event IDs, or bypass validation).

### Hardened Privilege Model
1. **Direct Writes Revoked**:
   ```sql
   REVOKE INSERT, UPDATE, DELETE ON public.event_submissions FROM public, anon, authenticated;
   REVOKE ALL ON TABLE private.event_submission_moderation FROM public, anon, authenticated;
   REVOKE ALL ON TABLE public.submission_moderation_events FROM public, anon, authenticated;
   ```
2. **Submitter Read-Only Grant**:
   `authenticated` users receive strictly `SELECT` on `public.event_submissions`, governed by RLS `submitter_user_id = (SELECT auth.uid())`.
3. **All Mutations via Bounded RPCs**:
   All user and administrator mutations occur exclusively through dedicated, validated PostgreSQL functions with `SET search_path = ''`.
4. **Server-Derived Identity**:
   Every RPC derives user identity directly from `(SELECT auth.uid())`. No browser-supplied `user_id` is ever accepted.
5. **Email-Confirmed Requirement**:
   In `submit_event_opportunity`, user identity is derived and email confirmation is strictly enforced directly in PostgreSQL:
   ```sql
   IF NOT EXISTS (
     SELECT 1 FROM auth.users
     WHERE id = (SELECT auth.uid()) AND email_confirmed_at IS NOT NULL
   ) THEN
     RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501';
   END IF;
   ```

---

## 2. Safe Separation of User-Visible and Admin-Private Data

To guarantee database-level privacy against direct PostgREST or REST queries, sensitive moderation state is physically partitioned into the `private` schema.

### Table Schema Partitioning

```
┌────────────────────────────────────────────────────────┐
│ public.event_submissions                               │
│ (Readable by Submitter via RLS & by Admins via RPCs)   │
├────────────────────────────────────────────────────────┤
│ • id (uuid, PK)                                        │
│ • submitter_user_id (uuid, FK auth.users, ON DEL SET NULL)│
│ • status ('submitted','under_review','accepted','rejected','withdrawn') │
│ • submitter_relationship                               │
│ • title, organizer_name, category_slug, mode           │
│ • official_url, registration_url                       │
│ • start_date, end_date (calendar dates only)           │
│ • registration_deadline_precision, local_date, due_at, timezone │
│ • city, state, country, venue                          │
│ • description, eligibility_summary                     │
│ • min_team_size, max_team_size                         │
│ • fee_status, fee_amount, currency                     │
│ • prize_description, submitter_notes                   │
│ • rejection_reason_code, rejection_reason_details      │
│ • version (integer, concurrency control)               │
│ • created_at, updated_at                               │
└────────────────────────────────────────────────────────┘
                           │ 1:1
                           ▼
┌────────────────────────────────────────────────────────┐
│ private.event_submission_moderation                    │
│ (ZERO public/anon/authenticated grants; Admins only)   │
├────────────────────────────────────────────────────────┤
│ • submission_id (uuid, PK, FK event_submissions)      │
│ • canonical_event_id (uuid, UNIQUE, FK events, NULL)   │
│ • reviewed_by (uuid, FK auth.users, ON DELETE SET NULL)│
│ • reviewed_at (timestamptz)                            │
│ • internal_notes (text, up to 5000 chars)              │
│ • created_at, updated_at                               │
└────────────────────────────────────────────────────────┘
```

### Direct-Query Privacy Guarantee
Even if a submitter executes `SELECT * FROM public.event_submissions WHERE id = :id` or queries Supabase directly via REST, `canonical_event_id`, `internal_notes`, and `reviewed_by` **physically do not exist** in `public.event_submissions`. They reside in `private.event_submission_moderation`, where all access is revoked from ordinary users.

### Dynamic Resolution of Public Canonical Event Links
The submitter's dashboard resolves an opportunity link (`/events/[slug]`) **only dynamically** via a server query or function that joins `events`:
```sql
SELECT s.*,
       CASE WHEN e.publication_status = 'published' THEN e.slug ELSE NULL END AS published_event_slug
FROM public.event_submissions s
LEFT JOIN private.event_submission_moderation m ON m.submission_id = s.id
LEFT JOIN public.events e ON e.id = m.canonical_event_id AND e.publication_status = 'published'
WHERE s.submitter_user_id = (SELECT auth.uid());
```
If the canonical event is in `draft`, `review`, `unpublished`, or `archived`, `published_event_slug` is `NULL`. The submitter is shown `"Accepted for review — publication pending"` with **zero** exposure of internal draft event UUIDs or slugs.

---

## 3. Append-Only Moderation Audit History & Actor Deletion Semantics

All moderation events are recorded in `public.submission_moderation_events`.

### Schema Definition
```sql
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
```

### Explicit Deletion Semantics
1. **Submitter Account Deletion**:
   - `event_submissions.submitter_user_id` has `ON DELETE SET NULL`. If a user deletes their student account, their submitted event is anonymized (PII unlinked) but historical submission facts are retained for editorial and fraud integrity.
   - `submission_moderation_events.actor_id` has `ON DELETE SET NULL`. Historical audit records retain `actor_role = 'submitter'`, preserving the timeline without blocking account deletion.
2. **Admin Account Deletion**:
   - `private.event_submission_moderation.reviewed_by` has `ON DELETE SET NULL`.
   - `submission_moderation_events.actor_id` has `ON DELETE SET NULL`. The administrative audit action remains preserved with `actor_role = 'admin'`.
3. **Submission Deletion**:
   - Normal product flows **never** hard-delete submissions.
   - If an administrator manually purges a malicious submission, `submission_moderation_events` and `private.event_submission_moderation` cascade delete (`ON DELETE CASCADE`).

---

## 4. Atomic Lifecycle State Machine & Mutation Functions

Every lifecycle transition updates the submission state AND appends an audit event in the **exact same database transaction**.

### Submitter Mutation Functions

#### 1. `public.submit_event_opportunity(p_payload jsonb) RETURNS jsonb`
- **Security**: `SECURITY DEFINER SET search_path = ''`.
- **Grant**: `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated;`.
- **Validation**:
  - Enforces exact allowlisted keys (unknown keys rejected with P0522).
  - Enforces email confirmation in `auth.users`.
  - Acquires 64-bit transaction-scoped advisory lock derived from submitter UUID:
    ```sql
    PERFORM pg_catalog.pg_advisory_xact_lock(('x' || substr(replace((SELECT auth.uid())::text, '-', ''), 1, 16))::bit(64)::bigint);
    ```
  - **Strict Rolling Rate Limit**: Maximum 5 submissions in rolling 24 hours.
  - **Duplicate Flood Guard**: Checks normalized title (`lower(btrim(regexp_replace(p_payload->>'title', '\s+', ' ', 'g')))`).
  - Validates URL constraints (http/https, <= 2048 chars, no user:pass, no loopback/private IPs, no control chars).
  - Validates deadline precision consistency.
  - Inserts row into `public.event_submissions` with `status = 'submitted'`, `version = 1`.
  - Inserts record into `public.submission_moderation_events` (`action = 'submitted'`, `actor_role = 'submitter'`).

#### 2. `public.edit_event_submission(p_command jsonb) RETURNS jsonb`
- **Security**: `SECURITY DEFINER SET search_path = ''`.
- **Grant**: `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated;`.
- **Atomic Operations**:
  - Verifies ownership and `expected_version`.
  - Verifies `status = 'submitted'` (locked if `under_review`, `accepted`, `rejected`, or `withdrawn`).
  - Validates payload using the same strict rules.
  - Updates permitted fields, increments `version`, sets `updated_at = now()`.
  - Inserts into `public.submission_moderation_events` (`action = 'edited'`, `actor_role = 'submitter'`).

#### 3. `public.withdraw_event_submission(p_command jsonb) RETURNS jsonb`
- **Security**: `SECURITY DEFINER SET search_path = ''`.
- **Grant**: `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated;`.
- **Atomic Operations**:
  - Verifies ownership and `expected_version`.
  - Verifies `status IN ('submitted', 'under_review')`.
  - Updates `status = 'withdrawn'`, increments `version`, sets `updated_at = now()`.
  - Inserts into `public.submission_moderation_events` (`action = 'withdrawn'`, `actor_role = 'submitter'`).

---

### Administrator Read Architecture
Routine administrator operations use the **authenticated user session** (no service-role client) with authoritative `private.is_admin()` verification inside SECURITY DEFINER read RPCs:

#### 1. `public.list_admin_submissions(p_status text, p_limit integer, p_cursor_created_at timestamptz, p_cursor_id uuid) RETURNS jsonb`
- `SET search_path = ''`
- Requires `auth.uid() IS NOT NULL` and `private.is_admin()`.
- Returns keyset-paginated submissions list (up to 25 items + 1 lookahead) with submitter email and status.
- `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated;`.

#### 2. `public.get_admin_submission(p_submission_id uuid) RETURNS jsonb`
- `SET search_path = ''`
- Requires `private.is_admin()`.
- Joins `public.event_submissions` with `private.event_submission_moderation`.
- Returns full submission details, internal notes, canonical event ID, and reviewer information.
- `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated;`.

#### 3. `public.get_admin_submission_history(p_submission_id uuid) RETURNS jsonb`
- `SET search_path = ''`
- Requires `private.is_admin()`.
- Queries `public.submission_moderation_events` ordered chronologically.
- Returns moderation timeline including public notes and internal notes.
- `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated;`.

---

### Administrator Mutation Functions

All admin mutation functions use the authenticated user session:
`REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated;`
Inside every function:
`require auth.uid()`
`require private.is_admin()`
`SET search_path = ''`

#### 4. `public.start_review_event_submission(p_command jsonb) RETURNS jsonb`
- Locks row `FOR UPDATE`, verifies `expected_version`, verifies `status = 'submitted'`.
- Updates `status = 'under_review'`, increments `version = version + 1`.
- Inserts into `public.submission_moderation_events` (`action = 'review_started'`, `actor_role = 'admin'`).

#### 5. `public.reject_event_submission(p_command jsonb) RETURNS jsonb`
- Locks row `FOR UPDATE`, verifies `expected_version`, verifies `status IN ('submitted', 'under_review')`.
- Validates `rejection_reason_code`.
- Updates `public.event_submissions` with `status = 'rejected'`, rejection code, details, increments `version`.
- Inserts/updates `private.event_submission_moderation` with `reviewed_by = (SELECT auth.uid())`, `reviewed_at = now()`, `internal_notes`.
- Inserts into `public.submission_moderation_events` (`action = 'rejected'`, `actor_role = 'admin'`).

---

## 5. Transactional Acceptance RPC (`accept_event_submission`) & `mutate_event` Integration

Acceptance is a critical operation executed within a **single database transaction**.

### Forced Trust State in Database
`accept_event_submission` sanitizes and forces canonical event trust fields server-side before invoking `mutate_event`:
- `publication_status = 'draft'` (strictly forced; rejected if caller requests anything else)
- `verification_level = 'community_submitted'` (strictly forced; never verified or source_confirmed)
- `verification_status = 'pending'` (strictly forced; never current)

### Zero Source Fabrication
- Acceptance copies `official_url` and `registration_url` into the canonical event record where selected by the administrator.
- **Zero source evidence is fabricated**: no checked evidence, validated observations, field evidence, or fake check timestamps are created. The canonical draft requires normal C05 source verification before publication.

### Acceptance RPC Implementation
```sql
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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = 'P0501'; END IF;
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'forbidden' USING errcode = 'P0503'; END IF;

  -- 2. Lock & Validate Submission
  SELECT * INTO v_sub
  FROM public.event_submissions
  WHERE id = v_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING errcode = 'P0504'; END IF;
  IF v_sub.version <> v_expected_version THEN RAISE EXCEPTION 'version_conflict' USING errcode = 'P0509'; END IF;
  IF v_sub.status NOT IN ('submitted', 'under_review') THEN RAISE EXCEPTION 'invalid_transition' USING errcode = 'P0522'; END IF;

  -- 3. Uniqueness Check: Prevent Double Acceptance
  IF EXISTS (
    SELECT 1 FROM private.event_submission_moderation
    WHERE submission_id = v_submission_id AND canonical_event_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'already_accepted' USING errcode = 'P0522';
  END IF;

  -- 4. Validate & Sanitize Event Command for C05 mutate_event
  IF (v_event_command->>'action') <> 'create' THEN RAISE EXCEPTION 'validation' USING errcode = 'P0522'; END IF;
  IF v_event_command ? 'id' OR v_event_command ? 'expected_version' THEN RAISE EXCEPTION 'validation' USING errcode = 'P0522'; END IF;

  -- Enforce canonical trust state invariants
  v_sanitized_patch := (v_event_command->'event') || jsonb_build_object(
    'publication_status', 'draft',
    'verification_level', 'community_submitted',
    'verification_status', 'pending'
  );
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
```

---

## 6. Data Modeling, Precision & Controlled Vocabularies

### 1. Registration Deadline Precision & Transfer
```sql
registration_deadline_precision text NOT NULL DEFAULT 'unknown'
  CHECK (registration_deadline_precision IN ('unknown', 'date_only', 'datetime')),
registration_deadline_local_date date,
registration_deadline_due_at timestamptz,
registration_deadline_timezone text CHECK (private.valid_zone(registration_deadline_timezone)),

CHECK (
  (registration_deadline_precision = 'unknown' AND registration_deadline_local_date IS NULL AND registration_deadline_due_at IS NULL) OR
  (registration_deadline_precision = 'date_only' AND registration_deadline_local_date IS NOT NULL AND registration_deadline_due_at IS NULL) OR
  (registration_deadline_precision = 'datetime' AND registration_deadline_due_at IS NOT NULL)
)
```
- `date_only`: submitter knows the date only. Stored in `local_date`. `due_at` remains `NULL`. **Never invent midnight**. When transferring to canonical draft, creates canonical deadline with `precision = 'date_only'` and `local_date` only.
- `datetime`: exact timestamp is known. Stored in `due_at`, with `timezone` if provided.
- `unknown`: both remain `NULL`. No deadline transferred.

### 2. Calendar Dates vs Event Times
- `start_date` and `end_date` are strictly calendar dates (`date` type).
- A timezone field is **never** used to imply a start time. Unknown event times remain unknown.

### 3. Controlled Categories
- Column: `category_slug text NOT NULL REFERENCES public.event_categories(slug)`
- Direct foreign key to existing unique `public.event_categories(slug)`.
- Prevents schema duplication and drift.

### 4. Canonical Timezone Validator Reuse
- Uses `private.valid_zone(timezone)` from `20260912000100_c03_schema.sql`.
- Zero duplicate validator definitions.

---

## 7. Informational Duplicate Detection (No Auto-Merge)

During administrator review on `/admin/submissions/[id]`, the UI executes a bounded search for candidate duplicates:
1. **URL Match**: Normalized source URL comparison against `events.official_url`, `events.registration_url`, and `event_sources.source_url`.
2. **Title Match**: Case-insensitive exact title match (`lower(btrim(events.title)) = lower(btrim(submitted_title))`).
3. **Admin Guidance Only**: Candidate matches are displayed as an informational advisory card. The system will **never** automatically merge submissions. C10 cross-source deduplication remains deferred.

---

## 8. User Submissions Dashboard (`/account/submissions`)

- **Route**: `/account/submissions`
- **Keyset Pagination**: 24 items + 1 lookahead (`(created_at, id)`).
- **Security**: Displays only submissions where `submitter_user_id = (SELECT auth.uid())`.
- **Card Elements**:
  - Event title, organizer name, submitted date, status badge (`Submitted`, `Under Review`, `Accepted`, `Rejected`, `Withdrawn`).
  - Submitter relationship label.
  - If `submitted`: "Edit submission" and "Withdraw" buttons.
  - If `under_review`: "Withdraw" button (edits locked).
  - If `rejected`: Displays structured reason code label and `rejection_reason_details`.
  - If `accepted`: Displays public link `/events/[slug]` **only if** the event is currently `published`. Otherwise displays `"Accepted for review — publication pending"`.
  - `internal_notes`, reviewer UUIDs, and draft event UUIDs are **strictly omitted**.

---

## 9. Comprehensive Database Schema Migration (`20260924000200_organizer_submissions.sql`)

### Monotonic Migration Versioning
- Previous migration: `20260924000100_notifications.sql`.
- Next monotonic migration: `20260924000200_organizer_submissions.sql`.
- Additive only; zero breaking changes; zero table drops.

---

## 10. Comprehensive Test Plan

### Automated Regression Harness (`tests/submissions/submissions.test.mjs`)
1. **RLS & Privilege Boundary Tests**:
   - Direct `INSERT`, `UPDATE`, `DELETE` on `public.event_submissions` rejected by PostgreSQL for ordinary authenticated users.
   - Direct `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `private.event_submission_moderation` rejected for all authenticated users.
   - Direct `SELECT` on `public.submission_moderation_events` rejected for non-admin users.
   - Submitter A cannot select Submitter B's submission.
2. **Submitter Mutation RPCs**:
   - `submit_event_opportunity`: creates submission, derives `auth.uid()`, enforces email confirmation, enforces rolling 5-submission daily cap, rejects duplicate title submitted within 24h, inserts audit event.
   - `edit_event_submission`: updates fields when `status = 'submitted'`, rejects if status is `under_review` or `accepted`, rejects version conflict.
   - `withdraw_event_submission`: succeeds when `status = 'submitted'` or `'under_review'`, records audit event, rejects if already `'accepted'`.
3. **Admin Moderation & Acceptance**:
   - Non-admin calling admin read/mutation RPCs fails with `forbidden` (P0503).
   - Admin calling `accept_event_submission` invokes `mutate_event`, creates canonical draft event (`publication_status = 'draft'`), forces `verification_level = 'community_submitted'` and `verification_status = 'pending'`, links `canonical_event_id` in `private.event_submission_moderation`, updates status to `'accepted'`.
   - Double acceptance rejected.
   - Transactional rollback: if `mutate_event` fails (e.g. invalid slug), submission remains unaccepted and zero orphan records exist.
4. **Information Disclosure & Privacy**:
   - Direct query on `public.event_submissions` contains zero admin-private columns.
   - Draft canonical event slug is hidden from submitter until `events.publication_status = 'published'`.
5. **UI & Responsive Verification (`scripts/test-submissions-ui.mjs`)**:
   - Playwright verification across 320px, 390px, 768px, 1280px with zero horizontal overflow.
   - Submission status badges, relationship labels, validation errors, moderation state, acceptance/rejection controls.

---

## 11. Hosted Verification Protocol

- **Execution Environment**: Hosted Supabase project `vzuoscpwmytgibsxugcx`.
- **Zero Real Inventory Modification**: No fake published opportunities will be created.
- **Hosted Acceptance Safety**: Because deleting canonical events from hosted Supabase triggers cascade risks on audit/versioning tables, **hosted acceptance will be intentionally skipped on hosted Supabase**. Full acceptance atomicity and rollback testing will run in isolated PostgreSQL (`tests/submissions/submissions.test.mjs`).
- **Hosted Verification Scope**:
  - Migration integrity (11th migration applied cleanly).
  - RLS policies & direct table write revocation.
  - Submitter RPCs (`submit_event_opportunity`, `edit_event_submission`, `withdraw_event_submission`).
  - Cross-user isolation (Submitter B cannot read Submitter A's submission).
  - Admin authorization (Non-admin denied access to admin RPCs).
  - Admin lifecycle (`start_review_event_submission`, `reject_event_submission`).
  - Private schema isolation (`private.event_submission_moderation` completely unreadable via REST/client).
  - Exact fixture teardown (deleting temporary auth users and temporary submission rows).
  - 100% row count conservation verified.

---

## 12. Expected Files Changed & Created

### Migration
- `[NEW]` `supabase/migrations/20260924000200_organizer_submissions.sql`

### Types & Domain Service
- `[MODIFY]` `src/lib/supabase/database.types.ts`
- `[NEW]` `src/lib/submissions/types.ts`
- `[NEW]` `src/lib/submissions/validation.ts`
- `[NEW]` `src/lib/submissions/service.ts`

### UI Components & Routes
- `[NEW]` `src/app/submit-event/page.tsx`
- `[NEW]` `src/app/api/submissions/route.ts`
- `[NEW]` `src/app/api/submissions/[id]/route.ts`
- `[NEW]` `src/app/account/submissions/page.tsx`
- `[NEW]` `src/app/admin/submissions/page.tsx`
- `[NEW]` `src/app/admin/submissions/[id]/page.tsx`
- `[NEW]` `src/app/admin/submissions/mutate/route.ts`
- `[NEW]` `src/components/submission-form.tsx`
- `[NEW]` `src/components/submission-list.tsx`
- `[MODIFY]` `src/app/account/page.tsx` (Add navigation link to "Your submissions")
- `[MODIFY]` `src/components/public-events.tsx` (Add "Submit an opportunity" link in DiscoveryShell footer)

### Tests & Verification Scripts
- `[NEW]` `tests/submissions/submissions.test.mjs`
- `[NEW]` `scripts/test-submissions-ui.mjs`
- `[NEW]` `scripts/explain-submissions.mjs`
- `[NEW]` `scripts/verify-submissions-hosted.mjs`
- `[MODIFY]` `scripts/test-server-boundary.mjs`
- `[MODIFY]` `package.json` (Add `test:submissions` scripts)

---

## 13. Explicitly Deferred Features & Scope Boundaries
- **No External Sync / Scraping**: C09, C10, C11, and C17 remain deferred.
- **No AI Assistant**: Grounded AI assistant has not started.
- **No Notifications 1.1**: Recommendation alerts deferred.
- **No Email Notifications for Submissions**: Real-time email notifications for submission status changes are deferred to a later integration.
- **No File / PDF Uploads**: Attachment uploads are deferred.
- **No Public Organizer Profiles**: Public organizer branding or organizer role tiers are deferred.
- **No C19 Visual Redesign**: Existing styling tokens and page layouts are preserved.
