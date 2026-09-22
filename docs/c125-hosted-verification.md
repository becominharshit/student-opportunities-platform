# C12.5 hosted verification — full sign-off

Verified 22 September 2026. **C12 receives full hosted sign-off for the requested scope.** C12 behavior did not change. C13 has not started. No commit or push was made.

## Intended project and migration history

Linked Supabase project: `vzuoscpwmytgibsxugcx`. The local project-ref file and hosted API configuration both identified this project.

| Migration | Hosted before | Hosted after |
|---|---|---|
| 20260912000100_c03_schema.sql | Applied | Applied |
| 20260912000200_c03_security.sql | Applied | Applied |
| 20260912000300_c03_eligibility_contract.sql | Applied | Applied |
| 20260916000100_c05_event_commands.sql | Applied | Applied |
| 20260916000200_c08_connector_runtime.sql | Applied | Applied |
| 20260922000100_c12_public_search.sql | Pending — only pending migration | Applied |

Executed, in order:

1. `supabase migration list --linked`: the first five versions matched; only C12 was missing remotely.
2. `supabase db push --linked --dry-run`: listed only `20260922000100_c12_public_search.sql`; seeds and roles were empty.
3. Read-only baseline: zero events, published events, connectors, enabled connectors and sync runs.
4. `supabase db push --linked --yes`: successfully applied that single additive migration.
5. `supabase migration list --linked`: all six local/remote versions matched.
6. A final `supabase db push --linked --dry-run`: remote up to date, no pending migrations, seeds or roles.

No reset, seed, destructive migration, event insertion or source registration/activation occurred.

## Hosted definition and authorization inspection

The installed function has the expected signature:

`public.search_published_events(filters jsonb, page_after jsonb) returns jsonb`

Read-only PostgreSQL inspection confirmed:

- SECURITY INVOKER (`prosecdef = false`).
- STABLE volatility.
- Empty search_path.
- Execute access for both anon and authenticated.
- RLS enabled on events and all joined organizer/category/tag/deadline tables.
- Events' public-read policy requires publication_status = published; related event metadata policies require a published parent.
- The function retains its explicit published-only predicate independently of staff policies.

The hosted function body and the reviewed local migration body have the same normalized MD5, `0fbb0a1c5beff00636ca9916370b0e7d`. This is an equality check of deployed code, not a claim about cryptographic security. It confirms that the explicit public card/deadline projection, database LIMIT 25, predicates and cursor logic are the reviewed implementation.

## Real hosted RPC verification

The new `scripts/verify-c125-hosted.mjs` ran actual Supabase Auth and PostgREST requests against the linked project.

- Anonymous publishable-key RPC execution: HTTP 200, [].
- Ordinary authenticated session RPC execution: HTTP 200, [].
- Both clients attempted injected draft/private flags; these could not broaden the function's published-only scope and returned [].
- Direct queries for unpublished events returned no rows for both clients.
- Attempts to read source/evidence, connector, sync and admin records returned permission errors or no visible rows.
- Anonymous access to profiles and ordinary-user access to other profiles returned no private records.
- RPC responses contained no private event/source/admin/profile data or diagnostic fields.

The hosted catalogue contains **zero events**, including zero unpublished events. No event was created to manufacture a nonempty test. Therefore the nonempty-card and actual hidden-row cases are supported by the deployed body/policy inspection and the passing isolated C12/RLS tests, not falsely claimed as populated hosted row tests. Exact key assertions are present in the verification script for any genuine returned cards; in this run the array was empty.

### Malformed input

Both anonymous and authenticated API requests produced controlled HTTP 400 errors:

| Input | PostgreSQL/PostgREST code |
|---|---|
| Nonobject filters | 22023 |
| Unsupported match sort | 22023 |
| Query over 200 characters | 22023 |
| Array cursor | 22023 |
| Cursor missing required fields | 22023 |
| Invalid UUID/numeric cursor | 22P02 |
| Invalid date | 22007 |
| Invalid team size | 22P02 |

No RPC-not-found error (PGRST202), credentials or private row contents appeared. The application form/parser continues to reject or ignore invalid URL values and provide recovery UI as designed. No C12 change was needed.

## Explore smoke against hosted Supabase

Started the **real production Next.js build locally**, with the intended hosted Supabase configuration supplied in memory. This was not a mock route or isolated database adapter, and it was not a new public deployment.

Chromium at a 390px viewport verified:

- /explore responds HTTP 200.
- The genuine “No published opportunities are available yet” state appears.
- Submitting the search form produces the expected no-match state.
- Submitting online + IN filters works against the real hosted RPC.
- Search/filter forms do not produce RPC-not-found errors.
- Filter URL state survives refresh.
- Invalid cursor links offer recovery.
- Malformed filter values show the safe query notice.
- No private configuration values appear in the built browser assets.

The local production server and browser were closed after the checks. Populated hosted discovery, pagination and event-detail journeys remain naturally unavailable until genuine reviewed inventory exists; the isolated suites continue to cover them.

## Temporary Auth fixture and exact cleanup

Authenticated execution required a real ordinary user session. One temporary Auth account was created with email delivery disabled and no admin membership. It was not an event, source, organizer or production inventory fixture.

- Verification run: `6847a763-eb96-4c57-8a1a-eb07dabe7c36`.
- Exact temporary Auth user: `d8424021-bf20-4051-ad74-b8366e59db1c`.
- That user was deleted; subsequent Auth lookup returned 404.
- No matching profile or admin membership remained.
- No other account was changed or deleted.

The final baseline comparison passed:

| Inventory | Before verification | After exact cleanup |
|---|---:|---:|
| Events / published events | 0 / 0 | 0 / 0 |
| Event source records | 0 | 0 |
| Source connectors / enabled connectors | 0 / 0 | 0 / 0 |
| Sync runs | 0 | 0 |
| Profiles | 0 | 0 |
| Admin memberships | 0 | 0 |

Verification completed successfully with 121 assertions, including per-asset private-configuration checks. Synthetic production events created: **0**. Source writes: **0**.

## Requested validation results

All ten requested commands were run during C12.5 and passed:

| Command | Result |
|---|---|
| npm test | PASS — 189/189 |
| npm run test:search | PASS — 32/32 |
| npm run db:types:check | PASS — clean migration replay matches types |
| npm run typecheck | PASS |
| npm run lint | PASS — zero warnings |
| npm run build | PASS — production Next.js/Turbopack build |
| npm run test:bundle | PASS — 14 browser assets |
| npm run test:boundary | PASS — service client and existing connector fetcher remain server-only |
| npm run test:public:ui | PASS — Explore/detail/empty, keyboard/focus and pagination at 320/390/768/1280px |
| npm run test:search:ui | PASS — filters, URL/history/refresh, pagination, recovery and keyboard/labels at 320/390/768/1280px |

Additionally, the actual repository's four security tests passed, including the actual ignored-credential and Git-history checks. The hosted verifier also scanned built browser assets against the actual private configuration values without writing or printing those values.

As in C12, build/test commands ran from the matching validation copy under `%TEMP%/student-opportunities-c12-validation` to avoid the known Documents-directory Node write failure. Application and migration file hashes matched the repository. The real .env.local was read from its original ignored location for hosted verification, passed to the production server in memory, and not copied to the validation folder. Standard suites used isolated synthetic databases; only the explicitly authorized hosted verification touched the linked service.

Existing Node module-type warnings and an npm upgrade notice were nonblocking. No package upgrade was made.

## Hosted differences and decision

No hosted Supabase incompatibility was found. Migration SQL, permissions, function lookup/schema cache, empty-array serialization, anonymous/authenticated execution and application RPC calls worked as implemented. Hosted invalid casts consistently returned controlled HTTP 400 errors, including on the empty catalogue.

**C12 has full hosted sign-off under the explicitly permitted empty-inventory verification path.** No search behavior, schema design, source connector implementation, dependencies or environment variable contract changed. Changes for this task are the verification script and review/status documentation; the previously reviewed C12 migration was applied as authorized.

Stop after C12.5. C13 has not started. Deferred C09–C11/C17 remain deferred; no commit or push was performed.
