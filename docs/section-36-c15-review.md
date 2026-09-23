# C15 For You review

23 September 2026. **Complete — review approved.** Baseline: approved C14 commit `e7ddee75d136a34e2fb9f21f119ff59c5cb9737f`. Milestone commit/push is authorized. C16 has not started. C09–C11/C17 remain DEFERRED.

## Architecture

`/for-you` is a dynamic authenticated server page. The existing identity guard preserves `/for-you` through the existing login destination allowlist. `src/lib/for-you/service.ts` resolves identity internally, reads the current student's existing C13 profile, requests a bounded database candidate set, bulk-reads event facts, checks publication/version again and calls `ranking.ts`. That server-only adapter calls the existing C14 `evaluateRecommendation` without changing or copying its formula. The UI receives only public card facts, eligibility state, permitted score, coverage and fixed C14 explanation messages.

No caller-supplied user ID, filtering form, profile selector, service-role access, external recommendation API, AI, cache table or persisted score is introduced. C14 Event Detail evaluation is retained unchanged. C12 search/filter ordering, pagination and anonymous projections remain unchanged (the existing card projection constant is now exported for reuse).

## Candidate retrieval and bound

The additive migration `20260923000100_c15_for_you.sql` creates `public.for_you_candidates()` with no arguments. It is STABLE, SECURITY INVOKER with an empty search_path, fully qualified objects and ordinary RLS. EXECUTE is revoked from PUBLIC/anon and granted to authenticated. It explicitly filters published events even for administrators. It returns only `{items:[{id,version}],has_published}`; no AST, profile values, evidence or diagnostic fields.

The RPC reads only profiles/relationships where user_id=auth.uid(). Four explicit retrieval hints each add one to an internal ordering key: category preference, participation-mode preference, controlled interest/domain overlap, and controlled skill-ID overlap. Hybrid mode provides online/offline retrieval overlap. Missing evidence contributes no retrieval hint, not negative eligibility. No degree, year, geography, skill competency or eligibility outcome is inferred here. Category-any is explicit, not an empty-list convention. These hints select candidates only; they are never presented as match scores.

Ordering is hint count descending, stored start_date ascending with null last, UUID ascending. The maximum is **100 events** per request, hard-coded in both SQL and application validation. Cancelled/completed/registration-closed records are excluded from this pool; unknown availability is preserved as unknown. A separate EXISTS distinguishes genuinely empty published inventory from published events that are unavailable or lack reliable matches.

When there are more than 100 available published events, only the first 100 by this deterministic retrieval order are evaluated. Consequently Best Matches means best within this candidate set, not a global optimum across the catalogue. Low-hint or missing-date events can fall outside the bound. The page discloses that limit. The database can scan/sort eligible catalogue rows, but the application never downloads the entire event catalogue. This is a beta-scale contract; larger catalogues require fresh plan review and retrieval diversification/index work, without weakening eligibility.

## Bulk reads, concurrency and privacy

C13 profile/reference reads are reused: five queries. One candidate RPC and two bulk event reads bring a populated request to **eight database requests**, independent of candidate count, plus Auth identity verification. One bulk event query includes the public card projection and exactly the additional C14 facts. A second ID/version/publication read prevents presenting a candidate changed or unpublished during retrieval. Both reads use at most 100 IDs and a limit of 100; there is no per-event network N+1. Events whose versions differ from the candidate snapshot or final check are omitted; refresh retrieves current facts.

The bulk query reads the eligibility AST only inside the server layer. Before producing the card DTO it removes that AST, team evaluation facts, tags and version. Private profile values, raw evidence and source diagnostics are not rendered. C13 completeness returns only missing section labels. The ordinary authenticated client enforces ownership; privileged credentials appear only in the explicit hosted verification script for exact fixture setup/cleanup/inventory checks. `/for-you` is included in existing private/no-store proxy/session handling and has noindex metadata.

Profile edits or event edits may reorder the next request. There is no persistent ranking snapshot, cross-request cache or promise of stable pagination. A final visibility check cannot promise immunity to an edit after the check, but avoids knowingly mixing candidate/event versions within evaluation.

## Groups, ranking and explanations

- **Best Matches:** C14 says eligible, returns a score and permits recommendation. Score descending, then coverage descending, then UUID ascending. Explicit unavailable states and ineligible results are excluded.
- **Worth Reviewing:** unknown eligibility or insufficient scoring coverage, excluding malformed/ineligible/unavailable records. Coverage descending then UUID. Score is always null here. Copy explicitly states these are not recommendations.
- Ineligible events remain accessible through ordinary Explore; For You does not hide or mutate event inventory.

There is one bounded set, with no load-more cursor or offset pagination. Users may refresh current results or use C12 Explore for the rest of the catalogue. This avoids falsely stable personalized pages and introduces no global match sort into Explore.

C14 controls all eligibility, score and coverage decisions, including the 75% evidence threshold and unknown semantics. Missing skills/year/team maximum/location/registration/domain are not interpreted as success or a known mismatch. Cards reuse EventCard with an optional heading level and show title, organizer, category/mode, dates, registration deadline, location, availability, trust labels and Event Detail links. They add textual eligibility, permitted match percentage, evidence coverage, and up to four existing C14 reason messages. Unknown cases use “What to review”, never invented requirements or AI prose.

## Partial profiles and empty states

C13's completeness function identifies missing Basic information, Education, Interests, Skills or Preferences sections. Completion is explicitly distinguished from event eligibility and evidence coverage; no completion gate or onboarding redirect is added. Missing profile/query data returns a retryable unavailable state, not fabricated empty inventory.

The page distinguishes:

1. No published events: “No opportunities are available yet.”
2. Partial profile: a completion prompt and relevant section names; results can still appear.
3. Published inventory with no reliable matches: “No strong matches yet. Explore all opportunities.”
4. Unknown/low-coverage results: Worth Reviewing, with no recommendation score.

Authenticated For You navigation appears in its main navigation and in account/profile/onboarding areas. Anonymous direct visits use existing login. Event Detail is not redesigned; saves, C16, calendars, notifications, AI, submissions, ingestion and C19 polish are absent.

## Migration and environment

The one additive RPC migration was replayed in isolated PostgreSQL. Linked project: `vzuoscpwmytgibsxugcx`. Remote history initially matched seven existing versions; dry run listed only `20260923000100_c15_for_you.sql`. That migration was applied, and all eight versions now match. No existing migration was reapplied, no reset or seed was run, and no tables, RLS policies, indexes, environment variables or dependencies changed. Existing indexes are used by the query. Database types were regenerated. The type generator now correctly represents a zero-argument RPC as `Record<string, never>` rather than an overly permissive empty object type.

## Performance evidence

`npm run test:for-you:performance` creates **5,028 published events** in isolated PGlite PostgreSQL, with 10,000 additional controlled domain/skill tags and structured eligibility on scale fixtures. No hosted inventory is written. It extracts the exact RPC SQL for EXPLAIN (ANALYZE, BUFFERS), under the authenticated role and ordinary RLS.

Recorded final run: **100 candidates**, **100 C14 evaluations**, **eight database calls**, including **two bulk event reads**. Plan uses existing profile/relationship/event/tag indexes, a bounded LIMIT and **top-N heapsort (29 kB)**. Planning **3.413 ms**, execution **62.868 ms**. The full plan is saved in ignored `work/c15/performance.json` and text output. These are local embedded PostgreSQL measurements, not hosted throughput/latency claims. Earlier runs varied with concurrent validation load. No application N+1 remains; SQL still performs database-side catalogue ranking and RLS checks, which should be remeasured at larger scale.

## Files changed

- `src/app/for-you/page.tsx`, `src/components/for-you.tsx`, `src/lib/for-you/{service,ranking}.ts`.
- Shared EventCard optional heading level and DiscoveryShell authenticated navigation; exported existing public card projection.
- Account/profile navigation, safe login destination allowlist and proxy matcher.
- One C15 RPC migration, generated database types and zero-argument type-generator support.
- `tests/for-you/{harness,c15.test}.mjs`; `scripts/{test-c15-ui,verify-c15-hosted,explain-c15}.mjs`; additional actual Next server-only boundary test; npm scripts.
- README, PROJECT_STATE, roadmap checkpoint and this review.

## Validation

The full pre-existing C03–C14 regression suite passes. C15 adds 23 tests for publication states, independent profile hints, ordinary RLS identity, anonymous rejection, minimal DTOs, bounded bulk retrieval, visibility/version races, safe failures, exact C14 score ordering, coverage/UUID ties, unknown/ineligible/low-coverage handling, availability exclusions, partial/empty profiles, deterministic changes, current event updates and genuine empty inventory. The performance test additionally proves the 100-candidate/evaluation cap above catalogue size.

Production build, type checks, migration-generated types and lint passed. Browser bundle scan passed (15 assets); four actual Next unsafe client imports were rejected (service client, connector fetcher, C14 evaluator and C15 ranking). Public events, search, profile, C14 detail and C15 UI suites passed at 320/390/768/1280px. C15 covers populated Best Matches, Worth Reviewing, empty/incomplete/no-match/unavailable states, semantic headings, textual labels, keyboard skip/event navigation, visible focus and no overflow. Populated browser scenarios use actual components and actual C14 ranking against isolated fixtures; they do not claim populated hosted production inventory.

Commands: `npm test`, `npm run test:for-you`, `npm run test:for-you:performance`, `npm run db:types:check`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:bundle`, `npm run test:boundary`, `npm run test:public:ui`, `npm run test:search:ui`, `npm run test:profiles:ui`, `npm run test:recommendations:ui`, `npm run test:for-you:ui`. Hosted command/results are recorded below.

## Hosted verification and exact cleanup

`npm run test:for-you:hosted` uses genuine empty hosted inventory and actual production Next.js login/session/For You responses. It creates exactly two temporary ordinary Auth accounts with `.invalid` non-delivery addresses; passwords stay in memory. It verifies anonymous RPC denial, ordinary candidate access, rejected identity arguments, cross-user profile privacy, real login redirect to For You, incomplete profile/empty state without invented scores, no raw AST/private profile values in HTML, private/no-store headers, ignored browser user_id and logout protection. No email delivery, hosted events or source integrations are created.

Exact IDs and before/after counts are recorded in ignored `work/c15/hosted-results.json`. Cleanup deletes only those Auth IDs, verifies Auth absence and dependent profile/interests/skills/admin absence, and compares eight inventory counts. An initial connectivity failure occurred before baseline capture or fixture creation; a connectivity check succeeded and verification was retried. Final result: **PASS, 25 named checks plus exact cleanup**. Both Auth accounts and dependents were confirmed absent. All eight before/after table counts were zero. No secrets, passwords or tokens were logged.

## Remaining limitations

The capped retrieval set can omit a globally higher C14 score. Date order uses stored start_date only and preserves unknown dates; it does not invent times or registration availability. Review candidates can have little usable evidence and are clearly labeled uncertain. Actual student-status/team-size facts remain unavailable under C13/C14. No automatic external freshness exists. A genuine populated hosted recommendation journey remains a beta QA item when real reviewed events exist; isolated tests cover populated behavior now.

C15 review is approved; milestone commit/push is authorized. C16 has not started. C09–C11/C17 remain DEFERRED.


**C15 implementation and hosted verification are complete — owner review approved.** The entire automated suite contains 331 passing tests (308 existing plus 23 C15). The approved milestone is ready for commit/push without functionality changes.
