# C12 review — public event search and filtering

22 September 2026. **C12 implementation complete locally; awaiting review approval.** No commit/push. C13 has not started. External discovery/sync C09–C11/C17 remains deferred. C07 research and C08/C08.5 implementation, migrations and source permission records are unchanged.

> Subsequent status: C12 implementation review was approved and C12.5 hosted verification passed. The reviewed migration is now applied; see [C12.5 hosted sign-off](c125-hosted-verification.md). Unapplied-migration and awaiting-approval statements below are historical C12 review context. C12 behavior remains unchanged, and C13 has not started.

## Scope and architecture

The public Explore page now parses a bounded URL contract, calls a PostgreSQL search RPC through the existing anonymous publishable-key client, and renders the resulting public cards. All matching, ranking and cursor predicates run in PostgreSQL. The database returns at most 25 rows: 24 visible cards and one lookahead row. JavaScript only removes that lookahead and encodes the next cursor; it never downloads or filters the catalogue.

The new `public.search_published_events(filters jsonb, page_after jsonb)` function is STABLE and SECURITY INVOKER with an empty search_path. It keeps an explicit published-only predicate in addition to the existing RLS. Execute is granted only to anon/authenticated after revoking the default PUBLIC grant. Even a privileged SQL caller receives only the explicit published card projection.

The existing C06 anonymous client and event-detail flow remain in place. No source collector, scheduler, external search provider, new package or environment variable was added. The old C06 list function remains available for compatibility; Explore now uses the C12 search path.

## PostgreSQL search and filters

Text search uses `websearch_to_tsquery('simple', q)` and weighted PostgreSQL tsvectors:

- Title: existing A-weight vector.
- Summary: existing B-weight vector.
- Organizer name: B weight, joined from the canonical organizer.
- Domain and skill tag text: C weight, joined from event_tags.

The combined vector supports multiple search terms spanning fields. It is assembled at query time, so organizer/tag edits are reflected without a second indexing or synchronization pipeline. Web-search phrase/OR/exclusion syntax is interpreted by PostgreSQL, not interpolated into SQL. Empty/punctuation-only token searches can return no matches.

Filters are AND-combined. Subqueries for tags/degrees do not multiply event rows.

| Filter | Exact behavior |
|---|---|
| Category | Canonical category slug, including student_technology_event |
| Domain/topic | Case-insensitive exact domain tag |
| Mode | Online/offline/hybrid; explicit unknown option matches null |
| Country / city | Two-letter uppercase country input; case-insensitive exact city |
| Event dates | Inclusive range on stored start_date, not arbitrary event overlap |
| Registration deadline | Inclusive range on active primary registration deadline local_date |
| Fee | Explicit free/paid/varies/unknown status; null amount is not treated as zero |
| Team | Exact requested size within two known bounds, or size 1 when individual_allowed is explicitly true |
| Study year / degree | Direct eligible_years / eligible_degrees values only; case-insensitive exact degree text |
| Prize | Stated positive amount or nonempty prize description; explicit zero with no description; otherwise unknown when neither amount nor description exists |
| Registration status | Explicit not_open/open/closed/unknown values |

Missing bounds do not imply unlimited team capacity. Year/degree filtering does not parse prose, infer equivalent degrees, evaluate compound eligibility ASTs, or claim personal eligibility. The UI expressly says filters describe recorded information and directs users to the official rules. A text-only prize description is a stated prize detail, not a normalized monetary valuation; the UI's zero-prize option is deliberately labeled “Explicit zero prize.”

Dates use the event's stored source-local calendar day; no missing time is filled with midnight. Unknown dates do not match a bounded date filter.

## Sorting and pagination

Supported sorts:

- Relevance: descending ts_rank, with title stronger than organizer/summary and tags.
- Registration deadline: ascending known local deadline date, unknowns last.
- Event date: ascending known start_date, unknowns last.
- Newest: descending created_at, retaining fractional timestamp precision.
- Without a search term, relevance gives the stable UUID catalogue order.

Match sorting is not exposed until C14. Prize sorting is not exposed, so no cross-currency numerical comparison occurs.

Every sort uses UUID ascending as a final tie-breaker. SQL keyset predicates compare the stored sort value and UUID, with explicit transitions into the null-key segment. There is no offset or full-catalogue load. Cursor version 1 contains the exact numeric sort key as text, event UUID and a SHA-256 fingerprint of normalized filter/sort state, encoded as base64url. The fingerprint prevents accidental cursor reuse across different searches; it is not an authorization token.

Malformed, oversized, unsupported-version or mismatched cursors show a recovery link that preserves the current filters. Legacy UUID-only C06 page links likewise recover to the first filtered page. Editing/applying/removing filters resets pagination.

This is live keyset pagination, not a snapshot across requests. With unchanged sort keys it is stable, including ties, nulls, removal before the boundary and newly published entries before the boundary. If an administrator changes a record's sort key or search relevance between pages, that record can move across the boundary; returning to the first page refreshes the view.

## URL state and UI

All controls use a native GET form targeting /explore. Search, category, domain, mode, city/country, date/deadline ranges, fee, team, year, degree, prize, registration status and sort are URL-backed. Values are rendered from server-parsed query parameters. Native navigation supports sharing, refresh and browser back/forward without client-side filtering or a second state store.

The parser bounds text lengths, validates enums, positive numeric inputs and real calendar dates, rejects reversed ranges and duplicate parameter values, and safely ignores unsupported parameters with a visible notice. It never feeds query-string text into dynamic SQL.

Explore adds search, collapsible filters/sorting, active-filter removal links, clear-all, page result counts, no-match/empty states and cursor recovery. A native details/summary disclosure provides the mobile filter experience without a focus-trapping modal. Controls have separate explicit labels, visible focus and minimum 44px control height. Keyboard search submission, disclosure activation, select focus and pagination were exercised in Chromium. The restrained existing design tokens and EventCard component are reused; C19 polish was not performed.

## SQL migration and performance

New additive migration: `supabase/migrations/20260922000100_c12_public_search.sql`. It adds one read-only RPC and its permissions/comment. Generated database types include its arguments/result; clean replay/type comparison passes. No table, source registration, new index, permission-policy relaxation or event data was added to the hosted project.

**The migration has not been applied to hosted Supabase.** Apply it through the normal reviewed migration process before running the changed Explore page against that database. Until then, that database cannot serve the new RPC. No production events or hosted synthetic fixtures were inserted.

`node scripts/explain-c12.mjs` inspects the actual inner query under the anonymous role with 2,028 published synthetic events in isolated PGlite PostgreSQL. Representative measured runs:

| Query | Execution time | Observed plan |
|---|---:|---|
| Text “robotics”, relevance | ~20.3 ms | Existing organizer/tag/deadline indexes, combined-vector predicate, top-N heapsort, LIMIT 25 before card/deadline projection |
| Online + IN, event date | ~9.6 ms | Existing relation indexes, database predicates, top-N heapsort, LIMIT 25 |

These are local synthetic measurements, not hosted latency or a concurrency SLA. The query-time combined vector does not use the existing title-only GIN index for the complete search expression. It scans candidate vectors in PostgreSQL; filtered related lookups use existing indexes. No speculative index was added because these beta-scale plans did not justify one. Re-measure real catalogue distribution and load before larger-scale release; an indexed complete document would require a carefully maintained relational search projection.

## Complete validation results

| Validation | Result |
|---|---|
| npm test | PASS — 189/189, including all 157 existing C03–C08/auth/security tests and 32 C12 tests |
| npm run test:search | PASS — 32/32 on the actual repository |
| npm run db:types:check | PASS — clean replay matches checked-in types |
| npm run typecheck | PASS |
| npm run lint | PASS — zero warnings |
| npm run build | PASS — production Turbopack build |
| npm run test:bundle | PASS — 14 browser assets, no private environment/service-key references |
| npm run test:boundary | PASS — existing service client and connector fetcher remain server-only |
| npm run test:public:ui | PASS — existing Explore/detail/empty fixtures at 320/390/768/1280px, keyboard/focus, pagination |
| npm run test:search:ui | PASS — actual C12 server page with isolated SQL at 320/390/768/1280px, submit/refresh/back/forward, URL pagination, invalid/empty recovery, keyboard and labels |
| node --test tests/security.test.mjs in actual repository | PASS — 4/4, including actual ignored credentials and Git-history checks |
| node scripts/explain-c12.mjs | PASS — anonymous inner-query plans on isolated scale fixtures |
| git diff --check | PASS |

Coverage includes title, summary, organizer, domain and skill search; every requested filter; combinations; every supported sort; ties/nulls; malformed inputs; scoped/versioned cursors; stable pagination; URL serialization and recovery; empty/no-match results; unknown-versus-zero/false distinctions; all unpublished states; no private projection fields; read-error handling; responsive and keyboard use.

The browser harness renders the real Explore server page and production CSS against isolated PostgreSQL with a narrow RPC adapter. It does not claim a hosted PostgREST or deployed Next-router end-to-end test. Native GET/history behaviors are tested in Chromium. The production build checks Next compilation and route typing.

### Local validation environment caveat

The original Documents workspace allowed patch edits but build/generated-file writes from Node failed with EBADF/ENOENT. Rather than alter security settings, validation used a secret-free copy at `%TEMP%/student-opportunities-c12-validation` with the same installed dependencies. Runtime and test source hashes were checked against the repository. Existing .env.local was not copied. Actual repository secret/history checks and C12 SQL tests also passed in place. No hosted authentication fixture scripts were run, since this task requires isolated fixtures.

An initial fixture setup issue and a select-label accessibility issue found during testing were corrected before the passing runs. Existing Node MODULE_TYPELESS_PACKAGE_JSON warnings remain; they are unrelated to C12.

## Review boundary

C12 is implemented and locally validated, ready for approval. Hosted migration application and a real hosted smoke check remain deployment follow-up, not claimed complete here. Search has exact token/city/tag/degree semantics rather than typo tolerance or semantic matching; no match score, currency conversion, exact total-result count or concurrent-request pagination snapshot is promised.

The prior roadmap documentation edits were already uncommitted when this task started and are preserved. No commit or push was made. Stop here: do not start C13 or deferred connector work without a subsequent instruction.
