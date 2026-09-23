# C16 Saved Events / Bookmarks review

23 September 2026. **Implemented — awaiting review.** Baseline: approved/pushed C15 commit `3132e259e4929603cc75dc3c21c532e0c184c872`. No C16 commit/push is authorized until review approval. C18, calendar and notifications have not started. C09–C11/C17 remain DEFERRED.

## Schema reuse and migration decision

Reuse C03 `saved_events`: primary key `(user_id,event_id)`, `created_at timestamptz not null default now()`, Auth user FK with ON DELETE CASCADE and canonical event FK with default NO ACTION. Duplicate bookmarks cannot exist. Account deletion cascades the private relationship; an existing bookmark prevents an unsupported event hard-delete. No event deletion or merge workflow is introduced.

Existing RLS is unchanged: authenticated users select/delete only their own rows; inserts require user_id=auth.uid() and an explicitly published event. There is no update policy, despite the original table-level update grant. Ordinary save operations use insert-on-conflict-do-nothing rather than changing an existing row or timestamp. Anonymous table access remains denied. Administrator status does not grant another user's bookmarks.

The existing `(user_id,event_id)` PK supports ownership/state lookup; `(event_id,created_at)` remains intact. An isolated 5,028-save plan demonstrated a full per-user top-N sort for recent-first listing. The single additive migration **`20260923000200_c16_saved_order.sql`** therefore adds **`saved_events_user_order_idx(user_id,created_at desc,event_id desc)`**, enabling an ordered index scan with early LIMIT. No new table, RPC, RLS policy, cache, generated-type change or environment setting was needed.

The linked Supabase project is `vzuoscpwmytgibsxugcx`. Its eight prior migration versions matched before changes. Dry run listed only the C16 index migration; that migration was applied, and all nine versions now match. No database reset, old migration replay, seed or hosted event write occurred. Do not reapply this migration.

## Save architecture and mutation security

`src/lib/saves/` contains server-only state/list reads, cursor handling and the shared POST handler, plus a safe-return policy. `SaveControl` is a shared server-rendered form; no client store or optimistic state machine is added. Successful mutations redirect with 303 to the originating allowed page, whose newly rendered state comes from the database. Desired operations are explicit `save` and `unsave`, not a racy toggle. Rapid/repeated saves are idempotent; repeated deletes are safe. Saving again does not move an existing bookmark's original created_at.

`POST /saved/mutate` accepts only event_id, operation and return_to. It rejects unknown/repeated fields, malformed UUIDs, unsupported operations, bodies over 4 KiB, incorrect content types, missing/wrong Origin and cross-site Fetch Metadata. The existing request Supabase client verifies a confirmed Auth identity; ownership is derived from that identity and never from browser user_id. All normal reads/mutations use authenticated RLS, never a service-role client.

Save checks current published visibility and then upserts `(session user,event)` with ignoreDuplicates. C03 RLS checks publication again at insertion. Unsave filters both own user ID and event ID, without requiring that the event still be public. Raw Supabase/PostgreSQL messages are never returned. Fixed error pages provide safe recovery links; refreshed cookie chunks survive error responses. Personalized responses and redirects are private/no-store.

Return destinations are limited to Saved, For You, existing Event Detail slugs and canonicalized C12 Explore filters/cursor. External/protocol-relative/control-character/backslash/unsupported destinations cannot create open redirects. The login allowlist supports these implemented browse destinations. Anonymous users see “Sign in to save”, never a fabricated unsaved/saved assertion. Login returns to the event/list; it does not silently save on the user's behalf, so the user presses Save after authentication.

## Save-state loading and integrations

`loadSaveState` resolves identity once per call and performs one bounded query for the current surface's event IDs: at most 24 on Explore, 100 on For You, or one on Detail. It returns only that user's matching IDs. No per-card HTTP or database request exists. Empty surfaces need no saved-table query. Unavailable state is labeled as unavailable rather than rendered as unsaved.

- **Explore:** existing public C12 search remains anonymous/profile-independent. Only the separate bookmark controls use the authenticated context. Canonical search/filter/pagination URLs survive save redirects. Explore now receives existing private/no-store session handling because signed-in bookmark membership is private.
- **Event Detail:** the shared control sits alongside the preserved C14 section. Anonymous facts remain accessible; save/unsave does not alter eligibility or match explanations.
- **For You:** one bulk state read covers both C15 groups. Cards reuse the same control. C14 scoring and C15 candidate/ranking services are unchanged; bookmarks are not a recommendation signal.
- **Saved:** authenticated `/saved` uses the existing EventCard/public projection with unsave controls, dates/deadlines, organizer/category/mode/location/availability/trust labels and Event Detail links. Navigation is available from authenticated main navigation and account/profile/onboarding areas.

## Ordering, pagination and visibility

Order is created_at descending, event_id descending; it is explicitly not recommendation order. The list queries `saved_events` with an INNER embedded event relation filtered to `events.publication_status=published`, own user_id, two ordering keys and LIMIT 25. It returns up to 24 cards with one-row lookahead. The next opaque, bounded cursor carries a version, the original timestamp string (including microseconds) and UUID. Strict field/type/date/length validation prevents cursor interpolation attacks. The next query uses created_at less than the cursor or equal timestamp with smaller UUID; it never uses application offset pagination or loads all bookmarks.

One extra bounded own-row existence query distinguishes an empty bookmark set from unavailable historical bookmarks. A final bounded published-ID check suppresses events unpublished between the list read and presentation, including for administrator accounts. The list requires at most three database calls: joined page read, own existence check and published recheck. Related public card fields are embedded in the one list query, not fetched per card.

Draft/review/unpublished/archived events never produce cards, titles or diagnostics. Their private saved relationships remain unchanged until explicit unsave or future authorized cleanup. The page does not enumerate hidden IDs or add a hidden-event management/deletion flow. Empty copy distinguishes “You haven't saved any opportunities yet.” from the neutral “No currently available saved opportunities.” Invalid cursors offer a first-page recovery link. Concurrent visibility changes can shorten a page; existing cursor boundaries remain deterministic, but there is no frozen cross-request snapshot.

There are no public save counts, popularity/trending badges, membership lists or social-proof claims. No private profile, eligibility AST, raw source evidence or ingestion metadata enters saved cards.

## Query/performance evidence

`npm run test:saves:performance` uses isolated PGlite PostgreSQL with **5,028 published events/bookmarks** and ordinary authenticated RLS. No hosted fixtures are created. It records EXPLAIN (ANALYZE, BUFFERS) for the list before/after the proposed index, a deep keyset predicate, and bounded save-state lookup. An offset is used only by the measurement script to locate an example deep cursor; application pagination does not use offsets.

Final measured local run:

| Query | Execution |
|---|---:|
| First page without new index, full per-user sort | 16.878 ms |
| First page with ordering index, early 25-row stop | 0.514 ms |
| Keyset page at approximately 2,500 prior bookmarks | 0.985 ms |
| Own event save-state lookup | 0.301 ms |

The optimized list uses an index-only scan on saved_events_user_order_idx and indexed event lookups; the old plan scanned 5,028 rows then sorted. The performance harness asserts a 24-card page, a next cursor and one bulk state read. Full plans are in ignored `work/c16/performance.json`. These local timings are not hosted performance claims. Deep timestamp ties and many hidden events can require more database-side scanning; no extra application catalogue download or N+1 is introduced.

## Tests and validation

C16 automated checks cover anonymous denial, own save/read/unsave, cross-user read/insert/delete denial, duplicate save/timestamp preservation, repeated unsave, all hidden publication states, origin/content-type/body/operation/ownership validation, safe errors/cookies, return destinations, bulk state loading, hidden bookmark retention, 24+4 keyset pages with exact microseconds and UUID ties, invalid cursors, private projection and unchanged scoring/ranking source behavior.

Browser tests exercise actual shared components, actual POST handler and isolated PostgreSQL RLS for save/unsave transitions across Explore, Event Detail, For You and Saved at **320/390/768/1280px**. They verify C12 filter return URLs, unchanged match output, pressed-state/text labels, keyboard save and visible focus, anonymous login navigation, invalid-cursor recovery, hidden-event neutral copy and no horizontal overflow. These populated tests use clearly labeled isolated fixtures, not hosted production inventory.

Final `npm test`: **347/347 passed**, comprising 331 existing tests and 16 C16 tests. `npm run test:saves`: **16/16 passed**. All existing C03–C15 unit regressions continue passing. Prior public/search/profile/recommendation/For You browser suites also passed. Production build, type checks, lint, database-type replay check, 15-asset client bundle scan and four actual unsafe-client-import boundary builds passed. No dependency install was necessary.

Commands run: `npm test`, `npm run test:saves`, `npm run test:saves:ui`, `npm run test:saves:performance`, `npm run db:types:check`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:public:ui`, `npm run test:search:ui`, `npm run test:profiles:ui`, `npm run test:recommendations:ui`, `npm run test:for-you:ui`, `npm run test:bundle`, `npm run test:boundary`, `npm run test:saves:hosted`.

## Hosted verification and exact cleanup

**PASS: 29 checks plus exact cleanup**, using the permitted least-invasive path. Hosted event inventory was genuinely zero. Publishing a synthetic event would require source/publication/audit side effects, so no hosted event was created and no requirement was weakened. Populated save/unsave and populated cross-user isolation remain verified in isolated PostgreSQL.

The hosted verifier created exactly two temporary ordinary Auth accounts with non-delivery `.invalid` addresses and private profile bootstrap, recorded their exact IDs in ignored `work/c16/hosted-results.json`, and tested ordinary/anonymous saved-table access and negative writes. Cross-user reads/deletes returned no rows in the empty hosted table; this is not claimed as a populated hosted isolation test. Attempts to save for another user or without an existing published event failed.

Real production Next.js/browser checks passed for anonymous Saved login redirect/return, genuine empty Saved view, private/no-store headers, anonymous save/unsave rejection, nonexistent-event publication check, repeated unsave, owner injection and cross-origin rejection, invalid cursor recovery, account navigation and logout protection. No passwords, credentials or tokens were printed.

Both exact Auth accounts were deleted. Auth absence and dependent profile/saved/interests/skills/admin absence were verified. All nine before/after counts returned to zero: events, event_sources, source_connectors, sync_runs, profiles, saved_events, user_interests, user_skills, admin_memberships. No real user/event was modified. The service secret was used only by verification setup/cleanup/inventory reads, never normal bookmark operations.

## Files changed

- New `/saved` page and `/saved/mutate` route; `src/lib/saves/{policy,cursor,service,handler}.ts`.
- New shared `save-control.tsx` and Saved presentation; existing public/search/For You card and Detail integration, account/profile navigation, safe login destinations and proxy matcher.
- One additive ordering-index migration; no generated database-type change.
- `tests/saves/{harness,c16.test}.mjs`, C06/C12 test adapters for the added auth-only integration, three C16 UI/performance/hosted scripts and npm scripts.
- README, PROJECT_STATE, roadmap status and this review.

## Limitations and completion boundary

Hosted inventory remains empty, so a populated hosted save journey remains a genuine-content beta QA item. Hidden bookmark rows are retained privately and do not expose a hidden-event removal UI. This is server-confirmed interaction; there is no optimistic animation, automatic post-login save or persistent client state. Existing event FK/no-hard-delete semantics remain unchanged. Cross-source merge behavior stays deferred with C10.

**C16 implementation and permitted hosted verification are complete — awaiting owner review.** Nothing is committed/pushed. C18, calendars, notifications and later features have not started; C09–C11/C17 remain DEFERRED.


Final `git diff --check` passed. A scan of all 32 changed/new files found no configured environment secrets or credential signatures. `.env.local` and `work/c16` results remain ignored/untracked; no files were staged, committed or pushed.
