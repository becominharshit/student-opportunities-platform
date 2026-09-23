# Student Opportunities Platform

C01/C02 foundation plus C03 database migrations, RLS and safe Supabase clients.
C04 adds minimal authentication pages, protected account/admin destinations and session refresh.
C05 adds canonical event management; C06 adds public Explore and Event Detail.
No automated source integration, calendar, or AI is implemented.
Current release: **Manual-Content Product Beta**. See [the implementation roadmap and milestone status](docs/planning/implementation-roadmap.md).
Automatic external discovery/sync is **deferred, not completed**; C07 research and C08/C08.5 infrastructure remain preserved. C12 implementation is approved and C12.5 hosted verification passed; C13 is complete and committed; C14 is complete and review-approved.

See [C12 review and validation](docs/section-36-c12-review.md) and [C12.5 hosted sign-off](docs/c125-hosted-verification.md). The additive C12 migration is applied to the linked hosted project. Real anonymous/authenticated RPC and hosted-backed production-build Explore checks passed with genuine empty inventory. No new environment settings are required. Run `npm run test:search`, `npm run test:search:ui` (after a build), and `node scripts/explain-c12.mjs` for isolated C12 checks. The separate `scripts/verify-c125-hosted.mjs` verifier creates/deletes one exact temporary Auth account but never inserts event inventory; it supports `C125_ENV_FILE` for the existing ignored configuration path. C13/C14 status is recorded in PROJECT_STATE.md.
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
validation and exact hosted cleanup. C15 is complete and review-approved; C16 has not started.

```sh
npm run test:for-you
npm run test:for-you:performance
npm run test:for-you:ui
npm run test:for-you:hosted
```

UI tests require a build. Performance fixtures remain isolated in embedded PostgreSQL.
Hosted verification uses genuine empty event inventory and exactly two temporary Auth
accounts, then deletes those accounts/dependent rows. Results stay in ignored `work/c15`.
No hosted events or sources are seeded. C15 review is approved; do not begin C16 automatically.
