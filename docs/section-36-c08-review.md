# Section 36 — C08 review

16 September 2026. Baseline: approved C07 commit 366367f9e68da636adc5ca6c5f2b467de4751ddf on main. C08 is limited to generic infrastructure, as explicitly authorized despite no approved live source.

## Outcome

**C08 is complete for local implementation review.** Generic server-only connector contracts, policy-bound fetching, private evidence retention, source leases/checkpoints, shared request budgets and sync-run logging are implemented. Production registration is empty. No source was enabled/contacted; no FOSS United fetch, real parser, event normalization, canonical publication, scheduler or C09 implementation was added. Changes remain uncommitted for review. This is not a live-ingestion or hosted Storage sign-off.

See [architecture and operational limits](c08-connector-infrastructure.md) for the complete security, error, storage and rate-limit model.

## Files and migration

- `src/lib/connectors/contracts.ts`, `errors.ts`, `policy.ts`, `transport.ts`, `fetcher.ts`, `store.ts`, `runner.ts`: typed capability contracts, fixed redacted errors, strict policy/URL/DNS/HTTPS boundaries, bounded page runner and privileged private persistence.
- `supabase/migrations/20260916000200_c08_connector_runtime.sql`: two private RLS tables, sync-run metadata, private Storage bucket/restrictive object policy and atomic service-role-only RPC. Adds no source rows and enables none.
- `src/lib/supabase/database.types.ts`: regenerated from clean migrations.
- `tests/connectors/harness.mjs`, `c08.test.mjs`: synthetic transport and actual isolated SQL tests.
- `tests/database/bootstrap.sql`: minimal local Storage schema contract; `c03.test.mjs`: preserves the original 17 tables plus the two new private runtime tables, all with RLS.
- `scripts/test-server-boundary.mjs`: extends actual Next client-import rejection to the connector fetcher.
- `tsconfig.json`: excludes ignored temporary `work` fixtures from application type checking; these fixtures intentionally fail standalone Next builds.
- `package.json`: C08 test command and inclusion in the existing suite. No dependency or lockfile change.
- README, PROJECT_STATE and these C08 documents: current review boundary and repeatable checks.

No environment variables added/changed. Existing SUPABASE_SECRET_KEY stays in the original server-only helper. No hosted migration, reset or fixture writes were performed.

## Test coverage

Synthetic tests cover permitted requests; host/path/query rejection; redirect destination and private-IP checks; mixed DNS/private IPv4/IPv6; address pinning/TLS/proxy settings; size/type/encoding/truncation; DNS/transport/body timeouts; cancellation; 401/403; 429 seconds/date Retry-After; bounded 5xx retry; policy expiry/disable/revocation; persistent run/daily budgets; host concurrency; lease expiry/fencing; immutable duplicate replay and parser versions; checkpoint rollback and partial failure; swallowed access denial; redacted diagnostics; raw metadata/object privacy; failed-upload compensation; and zero source requests before approval.

The real application/SQL implementation is exercised with synthetic input. PGlite is PostgreSQL but uses a serialized connection, not a hosted concurrency/load test. Storage HTTP is mocked; actual bucket delivery and infrastructure policies still need isolated Supabase integration verification before live activation. Existing raw source data and real accounts are not used as fixtures.

## Validation

| Check | Result |
|---|---|
| npm test | PASS: 157 tests, including 76 C08 tests and the existing 81 |
| npm run db:types:check | PASS: types match clean migration replay |
| npm run typecheck | PASS |
| npm run lint | PASS, zero warnings |
| npm run build | PASS |
| npm run test:bundle | PASS: 14 browser assets; no private values/service-key references |
| npm run test:boundary | PASS: actual service helper and connector fetcher both rejected from client components |
| npm run test:public:ui | PASS: Explore/detail/empty at four widths, keyboard focus/navigation and pagination |
| git diff --check | PASS |
| Changed-file credential scan | PASS: all 20 changed/new files; no configured credentials or private-key blocks |

.env.local remains ignored/untracked. Existing Node module-type warnings remain; no dependency changes were made to suppress them. TypeScript initially scanned an intentionally invalid ignored build fixture; excluding the temporary work directory resolved this without excluding application code.

Existing hosted auth/public smoke scripts are excluded to honor the synthetic/local constraint; no hosted-suite success is claimed. Existing database/event/public/security test aliases are covered by npm test. No install was required because dependencies are unchanged.

## Remaining gates

- C07 source permission/attribution gates remain unchanged. No qualified live source or release source-count claim.
- Review/apply the additive migration in isolated Supabase and verify actual Storage HTTP/privacy before enabling a future source.
- Retention/orphan cleanup and backup deletion must be operational before live ingestion. C08 stores expiry and compensates failed uploads; no scheduled purge is activated.
- IPv6-only hosts, compressed payloads and validated conditional 304 requests are deliberately unsupported/fail closed. Review extensions when a qualified source needs them.
- C09 owns real parsing/normalization/field evidence; C10 canonical deduplication; C11 scheduling, recurring refresh and retention operations. No later stage is started.
- Existing launch gates (owned SMTP sender, deployment/edge controls and genuine inventory verification) persist.

Stop after C08 review. Do not commit/push until approval.
