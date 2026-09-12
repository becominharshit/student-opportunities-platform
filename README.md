# Student Opportunities Platform

C01 inspection and C02 foundation. No event inventory, authentication, database,
source integration, calendar, or AI is implemented yet.

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
No automated test suite exists at C02. The production route is smoke-checked over
HTTP; database security tests are required with C03.

## Structure

- `src/app`: App Router layout, global Tailwind tokens, truthful holding page.
- `src/components/ui`: small shadcn-style native Button primitive.
- `src/lib/utils.ts`: class merging utility.
- `components.json`: shadcn component generation configuration.
- `.env.example`: blank future Supabase settings, no credentials.
- `docs/planning`: unchanged supplied product and implementation baselines.

System fonts keep builds independent of Google Fonts availability. The holding
page requests no indexing; revisit metadata when real public content exists.
The Button follows the shadcn CVA pattern with a deliberately small native API;
no interactive component library or motion package is needed at this stage.

## Environment and database boundary

Copy `.env.example` to `.env.local` only when configuring Supabase later.
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public
project settings. `SUPABASE_SERVICE_ROLE_KEY` is privileged and must remain in
server/worker secret storage, never browser code or a NEXT_PUBLIC variable.
None is read by the current app. No Supabase project has been linked, no clients
are initialized, and no migrations have been added or applied.

## Review boundary and risks

Next: C03 canonical/auth-support migrations, constraints, indexes, explicit RLS,
and isolated-database replay plus anonymous/user A/user B/admin access tests.
An isolated Supabase environment is needed to verify that stage. Production
region, accounts and deployment remain undecided. All live sources remain gated.

All direct dependencies and the lockfile are pinned. ESLint 9.39.5 is deprecated
but compatible with Next 16.3.5's bundled React/import/accessibility plugins;
ESLint 10 produced invalid peer dependencies. Revisit when that upstream plugin
set supports ESLint 10. Do not bypass peer checks with force/legacy-peer-deps.
