# C08.5 hosted verification

16 September 2026. **C08 receives hosted sign-off for the requested infrastructure/privacy scope.** C09 has not started. No application functionality, schema design, dependencies or environment variables changed during verification.

## Migration

Linked project: `vzuoscpwmytgibsxugcx`. C08 implementation was already committed as `e609508e24e3040532d30903d99b8a1d16736958`.

Remote history initially matched the four earlier migrations (`20260912000100`, `20260912000200`, `20260912000300`, `20260916000100`). The CLI dry run listed only `20260916000200_c08_connector_runtime.sql`, with no seeds or role changes. That additive migration applied successfully; subsequent local/remote history matched all five versions. No reset or destructive migration was performed. The CLI dry run enumerates pending migrations; successful application additionally verified SQL compatibility.

## Hosted results

`node scripts/verify-c085-hosted.mjs --snapshot` captured source/sync counts and hashes before application. `node scripts/verify-c085-hosted.mjs` passed 46 checks plus exact-fixture cleanup using real Auth, Data API and Storage HTTP endpoints. The script contacts only the intended Supabase project; it imports no source connector or fetch implementation.

- Both private tables exist: `connector_evidence` and `connector_host_budgets`.
- All five `sync_runs` additions exist: lease token, fencing token, parser version, policy snapshot and request count.
- The actual server-only helper reads both tables, writes the synthetic host budget, uploads/downloads private bytes, and executes `connector_runtime` through its absent-source permission guard.
- Service evidence INSERT reaches foreign-key validation, proving access without creating a source/evidence row.
- Anonymous and ordinary authenticated users receive permission denial for evidence reads/inserts/updates/deletes, budget reads/updates and RPC execution. Neither can see sync records.
- `connector-raw` is private with its 2 MiB limit. Public object URLs fail both without credentials and with publishable/ordinary authenticated credentials.
- Anonymous and ordinary authenticated Storage download, listing, upload, overwrite, deletion and signed-URL attempts cannot access or alter the exact object. A privileged read confirms the bytes remain unchanged.
- Source connector count, enabled count and sync-run count remain **zero**, with identical before/after hashes. No live source request occurred.

Hosted success of a source claim/retain lifecycle was intentionally not exercised: it requires a source row, which this task forbids creating. Isolated SQL tests cover leases, fencing, replay and checkpoint behavior. The hosted evidence table had no rows; read/write denials were explicit permission errors, not merely empty results. Sync visibility was checked against empty hosted inventory and is additionally covered by isolated RLS tests. This is not a hosted concurrency/load test.

## Exact cleanup

Verification run: `aaa97ea9-15d0-41f4-bfba-2cc1458b346f`.

- Deleted only temporary Auth user `0f3d110e-de59-4320-8261-ed14b43abb5e`; admin lookup returned 404 and dependent profile/membership checks were empty.
- Deleted only budget host `c085-aaa97ea9-15d0-41f4-bfba-2cc1458b346f.invalid`; verified absent. This is a synthetic database value, never a contacted host.
- Removed exact uploaded object `25bb9b75-1a59-46c6-afc2-65a94692d979/aaa97ea9-15d0-41f4-bfba-2cc1458b346f/a807bfdf-a7eb-40df-977a-aedd6dc72b4c` and checked its parent listing for absence.
- Also verified absence of the exact denied-upload path `7c0181d2-e03e-4e9d-aa50-9a0d67fa800b/aaa97ea9-15d0-41f4-bfba-2cc1458b346f/d5955df8-9810-4875-b1e7-a49237983d94` and rejected evidence UUID `5fd0cba5-4f66-4426-9f6e-f5a7cf92191e`.

Ignored `work/c085/results.json` records check names, fixture identifiers and baseline hashes without credentials, tokens or passwords. No broad deletion was used.

## Validation

| Command | Result |
|---|---|
| npm test | PASS: 157/157 |
| npm run db:types:check | PASS: clean migration replay matches types |
| npm run typecheck | PASS |
| npm run lint | PASS: zero warnings |
| npm run build | PASS |
| npm run test:bundle | PASS: 14 browser assets |
| npm run test:boundary | PASS: service helper and fetcher rejected from client components |
| npm run test:public:ui | PASS: four widths, Explore/detail/empty, keyboard and pagination |

No hosted incompatibility required a design change. Existing Node module-type warnings remain non-blocking. Source permissions/attribution, retention/orphan reconciliation and other launch gates remain required before live activation. Hosted sign-off does not approve any source or authorize C09.

Changed files are the verification script, this report and status updates in PROJECT_STATE, README and the two C08 documents. No new migration or environment setting was created. C08.5 hosted verification was approved on 17 September 2026 for commit/push. No additional hosted fixtures or application changes are needed for that commit.
