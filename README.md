# Student Opportunities Platform

C01/C02 foundation plus C03 database migrations, RLS and safe Supabase clients.
No event inventory, authentication UI, source integration, calendar, or AI is implemented.
See [C03 database guide](docs/c03-database.md) for schema, security and test details.
See [latest C03 security verification](docs/c03-final-security-verification.md) for the current credential gate.

## Local development

Use Node 24 (tested with 24.19.0) and npm 11.17.0.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. No environment values are needed for this stage.

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

C03 is the current review boundary; do not start C04 without the next instruction.
Hosted Supabase/Auth/PostgREST verification passed. Docker is unavailable for the
full local Supabase stack. Full C03 security sign-off was granted on 15 September
2026 after all historical credential checks rejected access and validation passed;
see the latest security verification above.
All live sources remain gated.

All direct dependencies and the lockfile are pinned. ESLint 9.39.5 is deprecated
but compatible with Next 16.3.5's bundled React/import/accessibility plugins;
ESLint 10 produced invalid peer dependencies. Revisit when that upstream plugin
set supports ESLint 10. Do not bypass peer checks with force/legacy-peer-deps.
