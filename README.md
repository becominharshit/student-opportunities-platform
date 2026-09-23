# Student Opportunities Platform

C01/C02 foundation plus C03 database migrations, RLS and safe Supabase clients.
C04 adds minimal authentication pages, protected account/admin destinations and session refresh.
C05 adds canonical event management; C06 adds public Explore and Event Detail.
C18 adds complete administrator dashboard and lossless structured event editing.
Calendar Export adds RFC 5545 `.ics` download and safe Google Calendar prefilled event links.
Notifications adds in-app notifications (/notifications), transactional email transport, hourly deadline reminders, and substantive event changes sweepers.
Organizer Submissions adds authenticated event submission (/submit-event), private submitter dashboard (/account/submissions) with withdrawal capability, administrator moderation queue (/admin/submissions), and single-submission review workbench (/admin/submissions/[id]) with duplicate candidate detection and atomic conversion to private canonical event drafts.
No automated source integration or AI assistant features are implemented.
Current release: **Manual-Content Product Beta**. See [the implementation roadmap and milestone status](docs/planning/implementation-roadmap.md).
Automatic external discovery/sync is **deferred, not completed**; C07 research and C08/C08.5 infrastructure remain preserved. C12–C16, C18, Calendar Export, Notifications, and Organizer Submissions are complete.

See [Organizer Submissions review and validation](docs/section-36-organizer-submissions-review.md). Exactly one additive migration `20260924000200_organizer_submissions.sql` applied. Run `npm run test:submissions`, `npm run test:submissions:performance`, `npm run test:submissions:ui` (Playwright across 320/390/768/1280px), and `npm run test:submissions:hosted` for isolated and hosted checks.
See [Notifications review and validation](docs/section-36-notifications-review.md). Exactly one additive migration `20260924000100_notifications.sql` applied. Run `npm run test:notifications`, `npm run test:notifications:performance`, `npm run test:notifications:ui`, and `npm run test:notifications:hosted`.
See [Calendar Export review and validation](docs/section-36-calendar-review.md). Zero new database migrations. Run `npm run test:calendar`, `npm run test:calendar:ui`, and `npm run test:calendar:hosted`.
See [C18 administrator experience review](docs/section-36-c18-review.md). Run `npm run test:admin`, `npm run test:admin:ui`, and `npm run test:admin:hosted`.
See [C04 authentication setup and review](docs/c04-authentication.md), including required hosted email templates.
See [C03 database guide](docs/c03-database.md) for schema, security and test details.
See [latest C03 security verification](docs/c03-final-security-verification.md) for the current credential gate.

## Local development

Use Node 24 (tested with 24.19.0) and npm 11.17.0.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The holding page needs no environment values; authentication
requires the Supabase settings, APP_URL and AUTH_COOKIE_SECRET described in the C04 guide.

```sh
npm run build
npm run lint
npm run typecheck
npm start
```

Build and typecheck both generate Next.js route types; run them sequentially.
C03 checks: `npm test` replays migrations in isolated PGlite PostgreSQL and tests
RLS/security; `npm run test:boundary` checks Next.js rejects privileged client
imports; `npm run test:bundle` scans browser assets after building.

## Structure

- `src/app`: App Router layout, global Tailwind tokens, truthful holding page.
- `src/components/ui`: small shadcn-style native Button primitive.
- `src/lib/utils.ts`: class merging utility.
- `components.json`: shadcn component generation configuration.
- `.env.example`: blank Supabase settings, no credentials.
- `docs/planning`: supplied product baseline, historical implementation baseline, and current implementation roadmap.

System fonts keep builds independent of Google Fonts availability. The holding
page requests no indexing; revisit metadata when real public content exists.
The Button follows the shadcn CVA pattern with a deliberately small native API;
no interactive component library or motion package is needed at this stage.

## Environment and database boundary

Use `.env.example` as a template for ignored local `.env.local` configuration.
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public
project settings. `SUPABASE_SECRET_KEY` is privileged and must remain in
server/worker secret storage, never browser code or a NEXT_PUBLIC variable.
These values are read lazily by separate browser/user-context/server-service
helpers. The holding page does not initialize clients. Three C03 migrations
are replayed in isolated test databases and confirmed present on the linked hosted
project `vzuoscpwmytgibsxugcx`. The server variable requires a new `sb_secret_` key;
there is no fallback to the legacy variable name.

## Review boundary and risks

C04 received final sign-off on 16 September 2026, including actual received signup and recovery emails. See docs/c04-inbox-smoke-review.md for evidence and public-launch limitations. C05 was subsequently approved and committed; see the current PROJECT_STATE.md.
Hosted Supabase/Auth/PostgREST verification passed. Docker is unavailable for the
full local Supabase stack. Full C03 security sign-off was granted on 15 September
2026 after all historical credential checks rejected access and validation passed;
see the latest security verification above.
All live sources remain gated.

All direct dependencies and the lockfile are pinned. ESLint 9.39.5 is deprecated
but compatible with Next 16.3.5's bundled React/import/accessibility plugins;
ESLint 10 produced invalid peer dependencies. Revisit when that upstream plugin
set supports ESLint 10. Do not bypass peer checks with force/legacy-peer-deps.

## C05 review checkpoint

C05 event services and protected admin management are implemented; see
[the C05 review](docs/section-36-c05-review.md) for behavior, validation and limitations.
The additive C05 transaction function is applied to the linked hosted project.
Run `npm run test:events` for isolated event lifecycle/RLS coverage.
C05 was approved and pushed as bddab781ce57db1b3400bf8e8e8b011d5e597336.

## C06 review checkpoint

Public `/explore` and `/events/[slug]` are implemented with anonymous published-only
reads, 24-item keyset pagination and explicit missing-information labels. No new
environment settings or migrations. See [C06 review](docs/section-36-c06-review.md)
and [current project state](PROJECT_STATE.md). C06 was approved and committed.

Additional validation:
```sh
npm run test:public
npx playwright install chromium
npm run build
npm run test:public:ui
npm run test:public:hosted
```
The browser fixture test requires the production CSS build. It uses only isolated
synthetic data. The hosted C06 smoke command is read-only and reports whether
genuine inventory or the empty state was checked. It does not seed production.

## C08 review checkpoint

Generic server-only fetch/connector infrastructure is implemented with synthetic tests.
No real source is registered or enabled. See [C08 architecture](docs/c08-connector-infrastructure.md)
and [C08 review](docs/section-36-c08-review.md). Run `npm run test:connectors` for isolated security/lease/replay coverage.
C08 is approved and committed. Its additive migration is now applied to hosted Supabase.
See [C08.5 hosted verification](docs/c085-hosted-verification.md) for actual Storage privacy,
exact fixture cleanup and full validation results. C09 has not started.

## C13 review checkpoint

Private `/account`, `/account/profile` and `/onboarding` now support optional student
information, controlled interests/skills and event preferences. Each section saves
through the authenticated session and an atomic RLS-protected transaction. Missing
information remains unset; profile completion is not an event match score.

See [C13 review](docs/section-36-c13-review.md) for schema, fields, validation,
hosted verification and exact fixture cleanup. The additive C13 migration is already
applied to the intended hosted project; do not reapply or reset the database.
Run `npm run test:profiles` and, after building, `npm run test:profiles:ui`.
`node scripts/verify-c13-hosted.mjs` explicitly creates and cleans up two temporary
Auth accounts; it is separate from the isolated test suite.

C13 is complete, hosted-verified and review-approved. C09–C11/C17 remain deferred. C14 is complete and review-approved; C15 is complete and review-approved.


## C14 review checkpoint

Server-only, three-valued eligibility and deterministic weighted match scoring are
integrated into Event Detail for the authenticated student only. Public facts remain
available anonymously. Unknown facts remain unknown; a headline match requires
eligible status and at least 75% weighted evidence coverage. No migration, new
configuration, AI or catalogue-wide personalized sort is introduced.

See [C14 review](docs/section-36-c14-review.md) for exact rules, scoring, privacy,
validation and the hosted profile/RLS-only verification limitation.

```sh
npm run test:recommendations
npm run test:recommendations:ui
npm run test:recommendations:hosted
```

Run UI validation after the production build. Hosted verification uses the existing
ignored environment configuration and creates/deletes exactly two temporary Auth
accounts and their private dependent rows; it never creates hosted events or sources.
Results/fixture IDs stay in ignored `work/c14`. C14 review was approved on 23 September 2026. C15 implementation status is recorded below. C09–C11/C17 remain DEFERRED.


## C15 review checkpoint

Authenticated `/for-you` uses a read-only SECURITY INVOKER PostgreSQL RPC to select
at most 100 candidates before applying the unchanged C14 evaluator. Best Matches
and Worth Reviewing are separate, with honest unknown/empty states and C13 profile
completion guidance. This is one bounded set, not whole-catalogue match pagination.

The additive `20260923000100_c15_for_you.sql` migration is already applied and
hosted-verified; do not reapply it. No environment changes or dependencies are needed.
See [C15 review](docs/section-36-c15-review.md) for ranking, privacy, local performance,
validation and exact hosted cleanup. C15 is complete and review-approved; C16 is implemented, awaiting review.

```sh
npm run test:for-you
npm run test:for-you:performance
npm run test:for-you:ui
npm run test:for-you:hosted
```

UI tests require a build. Performance fixtures remain isolated in embedded PostgreSQL.
Hosted verification uses genuine empty event inventory and exactly two temporary Auth
accounts, then deletes those accounts/dependent rows. Results stay in ignored `work/c15`.
No hosted events or sources are seeded. C15 review is approved; C16 status is recorded below.


## C16 review checkpoint

Private bookmarks now work across Explore, Event Detail and For You. `/saved` uses
24-item timestamp/UUID keyset pagination and published-only public card projections.
One shared same-origin POST behavior derives identity server-side and uses ordinary
RLS. Saves are idempotent; hidden event details never appear through Saved.

The existing C03 table/policies are reused. The additive
`20260923000200_c16_saved_order.sql` ordering index is already applied; all nine
migration versions match. No new environment variables or dependencies are required.
Do not reapply the migration. See [C16 review](docs/section-36-c16-review.md) for
schema, pagination, query plans, validation, hosted limitations and exact cleanup.

```sh
npm run test:saves
npm run test:saves:performance
npm run test:saves:ui
npm run test:saves:hosted
```

Build before UI tests. Performance/populated browser fixtures run only in isolated
PostgreSQL. Hosted verification creates/deletes exactly two temporary Auth accounts
and uses genuine empty inventory; it does not seed hosted events. Results remain in
ignored `work/c16`. C16 was approved and pushed to main in `6f8a2c15909eeff3c583b6005d67e34aaf8e1b82`.


## C18 review checkpoint

Milestone C18 completes the administrator experience with an operational summary command
center at `/admin`, structured event catalogue filtering with bounded lookahead pagination,
a lossless structured event editor (`EventEditor`) with controlled tags and independent
degree/year/rule columns, contextual workflow transitions, duplicate review alerts, and
safe ingestion provenance and audit timeline diffs.

Zero new migrations, zero database pushes, and zero weakening of publication guards or RLS.
Links to public event pages are rendered strictly when published. See
[C18 review](docs/section-36-c18-review.md) for architecture, validation, and limitations.

```sh
npm run test:admin
npm run test:admin:performance
npm run test:admin:ui
npm run test:admin:hosted
```

All 7 C18 tests and 354 total test suites pass. Playwright UI tests verify responsive
layout without horizontal overflow across 320px, 390px, 768px, and 1280px. Hosted verification
confirms empty catalogue, RLS negative checks, and exact temporary account cleanup.
C18 was approved and pushed to main in `3ad0e3140bb2ab9174e784f54306dee083f4eeac`.
C09–C11/C17 remain DEFERRED.

## Notifications review checkpoint

The Notifications milestone implements an asynchronous, privacy-preserving notification engine
across in-app (`/notifications`) and transactional email channels.

Features:
- Lookahead keyset pagination (24+1) on `(user_id, created_at DESC, id DESC)`.
- Partial index for navigation unread count (`notifications_user_unread_idx`).
- Safe dynamic resolution: Stored notifications contain generic text; published event titles are prepended on the fly; unpublished events omit links and render neutral redaction notices.
- Transactional email transport abstraction with pre-send publication verification and zero real email sandbox.
- Hourly registration deadline reminders with bounded single-stage catch-up ladder (`1d`, `3d`, `7d`).
- Hourly substantive event changes sweeper with persistent cursor tracking in `private.notification_runner_cursors`.
- Mutual exclusion runner leases (`private.notification_runner_leases`) with TTL preventing overlapping cron runs.
- Bounded `SECURITY DEFINER` RPCs (`mark_notification_read`, `mark_all_notifications_read`).
- One additive migration: `20260924000100_notifications.sql` (applied and verified on hosted Supabase).

```sh
npm run test:notifications
npm run test:notifications:performance
npm run test:notifications:ui
npm run test:notifications:hosted
```

All 21 Notifications unit tests pass (394 total test suites in `npm test`).
Playwright UI tests verify responsive layout without horizontal overflow across 320px, 390px, 768px, and 1280px.
EXPLAIN ANALYZE confirms index scans on 5,000 synthetic rows.
Hosted verification confirms RLS enforcement, cross-user isolation, runner secret protection, and clean teardown with 100% inventory conservation.
Notifications awaits review; do not commit/push or begin Notifications 1.1 / C19 / AI / organizer submissions.
