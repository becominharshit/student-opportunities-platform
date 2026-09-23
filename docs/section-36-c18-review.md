# C18 Administrator Experience Review

23 September 2026. **Implemented — awaiting review.** Baseline: approved/pushed C16 commit `6f8a2c15909eeff3c583b6005d67e34aaf8e1b82`. No C18 commit/push is authorized until review approval. C19, calendars, notifications, and organizer submissions have not started. C09–C11 and C17 remain DEFERRED.

---

## 1. Objectives & Executive Summary

Milestone C18 turned the existing functional C05 admin/event controls into a practical, robust, and accessible administrator dashboard without altering the underlying event contracts, RLS policies, or publication guards:

1. **Operational Command Center (`/admin`)**: Real-data metrics (Draft, In Review, Published, Unpublished, Archived, Needs Attention, Pending Duplicates) derived from concurrent bounded queries; filterable event management table/cards; lookahead pagination; and recent audit activity feed.
2. **Lossless Structured Event Editor (`src/components/event-editor.tsx`)**: Replaced raw JSON textareas with structured visual controls:
   - Controlled domain and skill tags strictly resolving to official vocabulary (`interests` and `skills`).
   - Structured deadline rows with Add/Remove, active/primary flags, stable ID preservation, and raw JSON fallback.
   - Independent study years (`number[] | null`), independent degrees (`string[] | null` preserved as exact strings without taxonomy), and independent eligibility rules AST (`Json | null`).
   - Safe eligibility helpers with 4 presets that strictly require explicit evidence text from administrators (never fabricating evidence); custom AST editor for complex trees.
3. **Structured Provenance & Audit Presentation (`/admin/events/[id]`)**:
   - Ingestion provenance (`event_sources`) formatted safely for staff while strictly omitting `raw_storage_ref` and connector diagnostics.
   - Pending duplicate review warning banner when duplicate reviews exist for the event.
   - Contextual workflow state transition buttons with required reason inputs, deriving allowed transitions directly from C05 database guards.
   - Before $\rightarrow$ after field diff audit timeline from immutable `event_changes`.
4. **Conditional Public Linking**: Links to public event pages (`/events/[slug]`) are rendered **only** when `publication_status === 'published'`. No draft preview route is introduced.
5. **Security & Zero Schema Changes**:
   - 3-layer authorization enforced across Next.js page guards (`requireAdministrator()`), service authorization (`authorizeAdmin()`), and PostgreSQL RLS (`private.is_admin()`).
   - Zero new migrations, zero database pushes, zero weakening of publication requirements.

---

## 2. Real Database Contract & Schema Verification

Before implementing any field or UI component, the database schema and generated types in `src/lib/supabase/database.types.ts` and migration files were verified:

- **`event_sources`**: Columns `id`, `event_id`, `connector_id`, `external_id`, `source_url`, `normalized_url`, `last_checked_at`, `validated_observation`, `field_evidence`. The column `raw_storage_ref` exists in the database but is intentionally excluded from service queries and admin views to prevent exposing raw storage paths.
- **`event_changes`**: Columns `id`, `event_id`, `event_version`, `actor_id`, `reason`, `field_diff`, `evidence_snapshot`, `created_at`. Foreign key to `events(id)` verified.
- **`duplicate_reviews`**: Columns `id`, `event_a_id`, `event_b_id`, `signals`, `status`, `created_at`. (Confirmed `signals` exists; confirmed no `confidence` column exists—avoided fabricating non-existent fields).
- **`event_tags`**: Foreign keys enforce that domain tags must exist in `interests.slug` and skill tags must reference valid `skills(id, slug)`. Custom uncontrolled tags are disallowed by schema constraints.
- **`event_deadlines`**: Stable UUID primary keys; date-only deadlines require `due_at` to be null; datetime precision requires timezone and matching local date.
- **Field Independence**: Verified that `eligible_years` (`integer[]`), `eligible_degrees` (`text[]`), and `eligibility_rules` (`jsonb`) are three separate columns on `events`.

---

## 3. Service Layer Architecture (`src/lib/events/service.ts`)

The service layer was extended with three bounded operations using standard PostgreSQL/Supabase queries:

1. **`getAdminDashboardSummary(client)`**:
   - Runs 8 concurrent queries via `Promise.all`: 7 `head: true` count queries (`draft`, `review`, `published`, `unpublished`, `archived`, `needsAttention`, `duplicateReviews`) and 1 bounded read for the last 5 `event_changes` with joined event title/slug.
   - Zero N+1 query patterns.
2. **`listAdminEvents(client, options)`**:
   - Supports filtering by `status` (publication status), `categoryId`, and `verificationStatus`.
   - Uses bounded lookahead pagination: requests 26 items (`range(offset, offset + 25)`). Returns 25 items and sets `hasNextPage: true` if 26 items were returned, avoiding full catalogue count queries.
3. **`readAdminEvent(client, id)`**:
   - Queries the event with safe joins: `organizers`, `event_categories`, `event_tags`, `event_deadlines`, `event_changes`, and safe fields of `event_sources` (`id, source_url, last_checked_at, validated_observation, field_evidence`).
   - Checks `duplicate_reviews` for pending duplicate pairs involving the event (`event_a_id = id or event_b_id = id`).
4. **`reviewEvent`**: Exported alongside `createEvent`, `updateEvent`, `publishEvent`, `unpublishEvent`, and `archiveEvent`.

---

## 4. Visual & UI Implementation

### Admin Dashboard (`/admin`)
- Metric summary tiles for all 7 key states. Clicking on a state tile filters the event list.
- Filter toolbar with publication status, category dropdown, and verification status.
- Responsive presentation: Accessible data table on desktop (`1280px` / `768px`) with horizontal scroll safety; clean card stack on mobile (`390px` / `320px`).
- Lookahead pagination navigation (`Previous` / `Next`) preserving active filter parameters.
- Recent activity timeline showing staff actor ID, timestamp, reason, and modified field names.

### Event Detail & Edit (`/admin/events/[id]`)
- Warning banner when pending duplicate reviews exist for the event.
- Contextual workflow state transition forms deriving allowed actions from C05 state machine:
  - `draft` $\rightarrow$ `Submit for review` or `Archive`
  - `review` $\rightarrow$ `Publish` (with explicit notice of publication requirements) or `Archive`
  - `published` $\rightarrow$ `Unpublish` or `Archive`
  - `unpublished` $\rightarrow$ `Submit for review` or `Archive`
  - `archived` $\rightarrow$ Terminal state notice
- Structured provenance card list displaying source URL, last checked time, per-field evidence status badges, and expandable validated observations.
- Audit history accordion listing all revisions in descending order, with before $\rightarrow$ after diff tables for changed scalar fields.
- Link to public page rendered **only** when `publication_status === 'published'`.

### Structured Event Editor (`src/components/event-editor.tsx`)
- **Controlled Tags**: Checkboxes for domains (`interests`) and skills (`skills`). Legacy tags outside vocabulary (if present) are displayed read-only with a warning and preserved during unrelated edits.
- **Structured Deadlines**: Add/Remove rows; precision toggle (`date_only`, `datetime`, `unknown`); active and primary registration toggles; stable UUID preservation for existing deadlines; collapsible raw JSON fallback.
- **Independent Academic Rules**:
  - `eligible_years`: Year 1–6 checkboxes; empty selection sets column to null (unknown).
  - `eligible_degrees`: Free-form comma-separated input; preserved as exact strings without taxonomy (e.g. `B.Tech, B.E., BCA`).
  - `eligibility_rules`: 4 safe presets requiring explicit administrator evidence text; custom AST JSON textarea for advanced trees; blank input sets column to null.
- Grouped into 9 semantic `<fieldset>` containers with `<legend>` for screen readers and keyboard navigation.

---

## 5. Verification Results

### 1. Automated Unit & Integration Tests
- **`npm run test:admin`**: **7/7 passed**.
  - 3-layer authorization: anonymous and non-admin requests rejected (`unauthorized` / `forbidden`).
  - Operational dashboard metrics report exact counts and recent changes.
  - Filters by status, category, and verification status with lookahead pagination.
  - `readAdminEvent` includes pending duplicate reviews and omits `raw_storage_ref`.
  - Editor integrity: `eligible_years`, `eligible_degrees`, and `eligibility_rules` remain independent.
  - Controlled tags enforce foreign keys; arbitrary custom tags rejected.
  - Structured deadlines maintain stable IDs across edits.
- **`npm test`**: **354/354 passed** (all 347 prior regressions + 7 C18 tests).

### 2. Browser UI & Responsive Verification (`scripts/test-c18-ui.mjs`)
- Tested across all 4 target breakpoints: **320px, 390px, 768px, and 1280px**.
- **Results**:
  - Zero horizontal overflow (`document.documentElement.scrollWidth <= innerWidth`) on all 3 surfaces at all 4 breakpoints.
  - Accessible headings (`h1`, `h2`, `h3`) and semantic structure.
  - Interactive form elements (checkboxes, inputs, selects, textareas) responsive and keyboard focusable.
  - Captured 12 post-implementation screenshots in `scratch/after_admin/`:
    - `admin_dashboard_320.png`, `admin_dashboard_390.png`, `admin_dashboard_768.png`, `admin_dashboard_1280.png`
    - `admin_new_320.png`, `admin_new_390.png`, `admin_new_768.png`, `admin_new_1280.png`
    - `admin_detail_320.png`, `admin_detail_390.png`, `admin_detail_768.png`, `admin_detail_1280.png`

### 3. Hosted Production Verification (`scripts/verify-c18-hosted.mjs`)
- Ran against linked Supabase project `vzuoscpwmytgibsxugcx`.
- Confirmed genuine hosted event inventory is 0 (`events === 0`). Zero hosted event fixtures created.
- Verified anonymous and ordinary non-admin RLS negative checks (`admin_memberships`, `event_changes`, `duplicate_reviews`, and `mutate_event` RPC).
- Temporary ordinary test account created, tested, and deleted.
- Final inventory matched initial inventory across all 10 verified tables (`before === after`).

### 4. Query Performance & EXPLAIN Benchmarks (`scripts/explain-c18.mjs`)
- Tested against an isolated database fixture with **1,200 synthetic events**, 100 audit entries, and 10 duplicate reviews.
- Measured with `EXPLAIN (ANALYZE, BUFFERS)` via `npm run test:admin:performance`:
  - **`count_published`**: **0.570 ms** execution time, 53 shared buffer hits, **Bitmap Index Scan** on `events_published_date_idx`.
  - **`count_draft`**: **0.859 ms** execution time, 160 shared buffer hits, **Seq Scan** on in-memory buffered heap.
  - **`count_review`**: **0.463 ms** execution time, 160 shared buffer hits, **Seq Scan**.
  - **`count_unpublished`**: **0.390 ms** execution time, 160 shared buffer hits, **Seq Scan**.
  - **`count_archived`**: **0.330 ms** execution time, 160 shared buffer hits, **Seq Scan**.
  - **`count_verification_attention`**: **0.481 ms** execution time, 160 shared buffer hits, **Seq Scan**.
  - **`count_pending_duplicates`**: **0.036 ms** execution time, 1 shared buffer hit, **Seq Scan** on `duplicate_reviews`.
  - **`recent_activity`**: **0.588 ms** execution time, 501 shared buffer hits, **Nested Loop Left Join** via index scan on `event_changes` and `events_pkey`.
  - **`admin_events_list_filtered`**: **2.871 ms** execution time, 167 shared buffer hits, **Index Scan** on `events_category_idx` with Top-N heapsort (limit 26) + Memoize on `event_categories_pkey`.
  - **`duplicate_check_detail`**: **0.055 ms** execution time, 3 shared buffer hits, **BitmapOr** via index scans on `duplicate_reviews_event_a_id_event_b_id_key` and `duplicate_reviews_b_idx`.
- **Database Request Counts**:
  - `/admin`: Exactly **3 server-side database calls** (`getAdminDashboardSummary` 8 concurrent queries via single `Promise.all`, `listAdminEvents` bounded range query 0..25, and 1 category list query). Zero N+1.
  - `/admin/events/[id]`: Exactly **2 server-side database calls** (`readAdminEvent` single joined event query + pending duplicate check, and 1 `Promise.all` for 4 reference lookups). Zero N+1.
- **Index & Migration Assessment**:
  - PostgreSQL automatically leverages existing partial indexes (`events_published_date_idx`) for published queries and existing foreign key indexes for detail lookups.
  - Non-published status counts complete in < 0.9 ms over memory-buffered heap pages (160 blocks = 1.28 MB).
  - No new indexes are needed. The C18 migration count is **ZERO**.

### 5. Publication Guard Authority & Eligibility Evidence Integrity
- **Authoritative Database Publication Guard**:
  - The UI does not present a simplified checklist as the publication contract.
  - C05 `mutate_event` RPC and C03 triggers (`private.assert_publication`, `private.publication_guard`) remain fully authoritative.
  - Detected blockers in `/admin/events/[id]` are displayed with the explicit statement:
    *"These are currently detected blockers. Final publication requirements are enforced by the server/database."*
- **Exact C03 Eligibility Evidence Contract**:
  - Presets in `src/components/event-editor.tsx` enforce `jsonb_typeof(node->'evidence') = 'string'` and `btrim(evidence) <> ''`.
  - Administrators must provide explicit evidence text or an unresolved reason before applying presets.
  - No evidence, source references, timestamps, or verification status are fabricated.

### 6. Code Quality & Boundary Checks
- `npm run test:admin:performance`: All 10 queries benchmarked in sub-3ms.
- `npm run db:types:check`: Clean database types match clean migrations.
- `npm run typecheck`: Passed with 0 TypeScript errors.
- `npm run lint`: Passed with 0 ESLint errors and 0 warnings.
- `npm run build`: Production Next.js build completed successfully.
- `npm run test:bundle`: 16 browser assets scanned; no server secrets leaked.
- `npm run test:boundary`: Client Component boundary guards verified.
- Prior milestone suites all passing: `test:saves`, `test:saves:ui`, `test:saves:performance`, `test:for-you`, `test:recommendations`, `test:profiles`, `test:search`.

---

## 6. Files Changed & Added

- **Modified**:
  - `src/lib/events/service.ts`: Added `getAdminDashboardSummary`, `reviewEvent`, updated `listAdminEvents` and `readAdminEvent`.
  - `src/components/event-editor.tsx`: Complete visual editor with controlled tags, structured deadlines, independent academic fields, and safe eligibility presets.
  - `src/app/admin/page.tsx`: Complete operational dashboard with metrics, filters, responsive table/cards, lookahead pagination, and audit history.
  - `src/app/admin/events/[id]/page.tsx`: Event detail page with workflow action buttons, duplicate warning banner, safe provenance, and audit timeline.
  - `src/app/admin/events/new/page.tsx`: Updated to fetch controlled vocabulary for new event drafts.
  - `package.json`: Added `test:admin`, `test:admin:ui`, `test:admin:hosted`, and `test:admin:performance` scripts.
- **Added**:
  - `tests/admin/c18.test.mjs`: Unit and integration test suite.
  - `scripts/test-c18-ui.mjs`: Playwright responsive UI and screenshot test script.
  - `scripts/verify-c18-hosted.mjs`: Hosted empty-catalogue authorization verification script.
  - `scripts/explain-c18.mjs`: Performance benchmark and query plan inspection script.
  - `docs/section-36-c18-review.md`: This milestone review.

---

## 7. Status & Completion Boundary

- **Milestone C18 is COMPLETE and AWAITING OWNER REVIEW.**
- All changes remain **UNCOMMITTED and UNPUSHED**.
- No subsequent milestones (C19, calendars, notifications, organizer submissions) have started.
- Deferred milestones (C09–C11, C17) remain DEFERRED.
