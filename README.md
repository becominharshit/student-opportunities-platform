# Student Opportunities Platform

C01/C02 foundation plus C03 database migrations, RLS and safe Supabase clients.
C04 adds minimal authentication pages, protected account/admin destinations and session refresh.
C05 adds canonical event management; C06 adds public Explore and Event Detail.
No automated source integration, calendar, or AI is implemented.
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
- `docs/planning`: unchanged supplied product and implementation baselines.

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
