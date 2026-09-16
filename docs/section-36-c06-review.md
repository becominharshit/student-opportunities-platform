# Section 36 — C06 review

Completed 16 September 2026. C06 implementation and the requested validation are complete, ready for review. C05 remains the latest commit (`bddab781ce57db1b3400bf8e8e8b011d5e597336`). No C06 commit or push was made. C07 has not started.

## Scope and current state

Read the supplied master instructions, Section 35 baseline, repository AGENTS/CLAUDE instructions and latest C03/C04/C05 reviews. PROJECT_STATE.md did not exist in the repository or the searched Codex workspace; a current checkpoint file is included with this change. The installed Next.js page/data-fetching/notFound guides were consulted before implementation.

Added /explore and /events/[slug]. The homepage received only a discovery link and a corresponding copy correction. No source ingestion, qualification, search/filter engine, recommendations, student profile, saves, calendar, notifications, AI, organizer submissions or motion system was added.

## Public read architecture and security

Both routes are request-time server components. They use the existing C05 public event service, with a new listPublishedEvents operation and explicit card/detail projections. The service creates an independent anonymous Supabase client with the publishable key, no auth cookies, no persistent session, and no-store fetches. Neither route imports the privileged helper. Existing PostgreSQL RLS remains unchanged; both queries additionally require publication_status=published.

The detail projection contains canonical presentation facts and selected organizer/category/tag/deadline fields. Source attribution comes only from public_event_sources, selecting id, event_id, source_url, last_checked_at and source_name. Raw snapshots, field evidence, date metadata, eligibility-rule JSON, image-rights metadata, search vectors, policy information, diagnostics, admin records and contacts are not selected or rendered. Detail retains C05's final publication/version recheck after the separate source read.

Draft, review, unpublished, archived and missing slugs use the same notFound path and message. No hidden-state explanation is exposed. Database errors use the existing generic error boundary, rather than masquerading as zero inventory. Text is rendered as escaped React text, including descriptions, source labels and timeline entries; no raw HTML rendering.

## Explore and pagination

Explore shows title, organizer, category, mode, supplied summary, dates, primary active registration deadline, location, event/registration state, public trust label and last successful check. It does not display invented totals, trending claims, attendance, popularity or source activity.

Pagination uses the immutable unique event UUID in ascending order. The public page explicitly calls this stable catalogue order: it is not a claim of date order, relevance, freshness or popularity. Each request fetches at most 25 event rows, displays 24, and uses the extra row solely to establish a next page. The next cursor is the last displayed ID; subsequent queries apply id > cursor. No offset or all-events download is used. Existing primary-key indexing supports this baseline without a migration. Future filter/sort contracts can extend the options object and use versioned cursors as necessary in C12.

There are Next opportunities and Back to first page links; browser history also works. Malformed/repeated cursor input displays a recoverable invalid-page message. An empty initial catalogue says "No published opportunities are available yet." This avoids implying every publication is Verified when Community Submitted is also a valid public trust level. An empty continuation page explains that the catalogue may have changed and provides a restart link.

This is a live keyset traversal, not a snapshot. Edits/deletions before the cursor do not shift later pages or duplicate stable rows. New or newly published events before the cursor require returning to the first page; visibility changes can shrink a later page. No inventory consistency guarantee across separate requests is implied.

## Detail and factual presentation

Detail shows the supported identity, summary/description, category, status, registration status, mode, venue/location, endpoint dates, primary deadline, individual/team facts, fee, prizes, eligibility text, process, tags, active timeline, trust, checked time and source attribution. Missing fields have specific unknown labels; absent optional prose is omitted where appropriate. It performs no eligibility inference or recommendation scoring.

- Date-only values are formatted directly from their calendar components and emitted as date-only time attributes. No midnight timestamp is constructed.
- A known instant is rendered only with a supplied timezone, explicitly labeled with its IANA zone. Mixed-precision endpoints retain their own available precision. Missing exact times are stated.
- Last-checked instants are explicitly displayed in UTC; this does not imply UTC is an event's local timezone.
- Unknown booleans do not become false. Partial team bounds remain partial.
- Free is shown only for explicit fee_status=free. Known amounts include their stored currency and known person/team basis. Fee and prize currencies remain independent; no conversion or combining currencies occurs. Unknown amounts are labeled.
- Current trust levels retain Verified, Source Confirmed and Community Submitted wording. Non-current verification displays "Verification needs refresh" instead of reusing a historical trust badge.
- Registration and official links preserve the exact stored validated HTTPS destination, including query parameters. Defensive scheme/credential checks suppress unsafe URLs. Links open externally with noopener/noreferrer and accessible new-tab descriptions. Open registration has a Register on official website CTA; other states use View official registration page, without implying registration is open or occurs here.

## Accessibility and responsive behavior

Retained the restrained existing palette and system typography. Added semantic navigation, one h1, section headings, definition lists, timeline lists, semantic time elements, meaningful link labels, text status indicators, visible keyboard focus and the existing skip link. No animation or color-only status communication was added.

Explore uses one column on narrow screens and two on wider screens. Detail is single-column on mobile and uses an information/registration layout on desktop. The registration block comes before long detail content in DOM/keyboard order and is placed beside it on desktop. Long text wraps; layout elements permit shrinking. Browser tests found no horizontal overflow at 320, 390, 768 and 1280 pixels for Explore, Detail and empty states. Keyboard tests exercised skip-to-content, focused event links, Enter navigation and visible outlines. These are practical basics, not a comprehensive screen-reader or WCAG audit.

## Validation actually run

| Command | Result |
| --- | --- |
| npm install | Passed; pinned @playwright/test 1.63.0 dev dependency; audit reported 0 vulnerabilities |
| npx playwright install chromium | Passed |
| npm test | 81 passed (66 existing + 15 C06) |
| npm run test:events | 24 passed |
| npm run test:public | 15 passed |
| npm run db:types:check | Passed against clean migration replay |
| npm run typecheck | Passed |
| npm run lint | Passed |
| npm run build | Passed; both public routes dynamically rendered |
| npm run test:bundle | Passed; 14 browser assets scanned |
| npm run test:boundary | Passed; actual privileged helper rejected from client code |
| npm run test:auth:hosted | 48 checks passed; exact temporary Auth records and dependent fixtures cleaned |
| npm run test:public:ui | Passed: 12 viewport/page combinations, keyboard navigation/focus and pagination links |
| npm run test:public:hosted | Passed: hosted empty inventory, missing detail HTTP 404, invalid cursor recovery |
| git diff --check | Passed |

C06 database tests replay the real migrations in isolated PGlite PostgreSQL, execute actual public service code through a narrow PostgREST-shaped projection adapter, and enforce the anonymous role/RLS. Coverage includes all visibility states, safe relation/source fields, exact URLs, escaped text, unknowns, dates/timezones, currency, stable pagination, empty inventory and safe database-error mapping. The actual detail route is tested for notFound versus database failure.

Chromium tests render the actual C06 React components against isolated database fixtures and the production Tailwind CSS. A native anchor adapter substitutes Next Link in that isolated component harness; the hosted production route test covers actual Next.js routing. Local screenshots are ignored under work/c06. No synthetic events are placed in hosted production.

## Hosted status and remaining limits

The existing project vzuoscpwmytgibsxugcx is reachable using the public client. At verification time it had no publicly visible published events. The local production Next.js build against hosted Supabase displayed the honest empty state, returned an actual HTTP 404 for a missing slug, and handled malformed cursors. This C06 smoke script performs zero hosted writes. Genuine hosted published-event detail verification remains pending real inventory, as permitted by the task; it is not represented as completed with fake data.

The separate existing hosted authentication regression command creates and removes only its exact temporary Auth/profile/membership fixtures. It does not add event inventory. This is a local production-build integration check, not a deployed HTTPS smoke check or new real-inbox verification.

PGlite plus a narrow adapter is not a full local Supabase/PostgREST stack or a multi-connection load test. Shared route caching was deliberately avoided so later unpublication is honored on subsequent requests. Any already delivered browser content cannot be recalled by unpublishing. Large-catalogue query plans and advanced ordering/filter contracts remain C12 work.

Existing public-launch requirements remain: owned verified SMTP domain, inbox placement, deployed HTTPS verification, edge limits/log redaction, policies, monitoring and genuine permitted source coverage. Existing Node module-type warnings remain harmless. npm also reported an unapproved optional install script for existing unrs-resolver; no broad script approval was granted, and lint/build succeeded.

## Migrations, environment and files

No migration, schema/RLS change, hosted reset or environment-variable change. .env.local remains ignored/untracked; new and modified candidate files were scanned for current private environment values and recognizable secret patterns. No secrets were found. Existing historical revoked credentials are not rewritten by C06.

Changed/added:
- src/lib/events/public.ts: explicit public projections and bounded list service.
- src/lib/events/presentation.ts: precision, money, trust and URL presentation helpers.
- src/components/public-events.tsx: shared shell, cards, Explore and Detail rendering.
- src/app/explore/page.tsx: public list route.
- src/app/events/[slug]/page.tsx and not-found.tsx: public detail and indistinguishable absence.
- src/app/page.tsx: functional Explore link and copy correction only.
- tests/events/c06-harness.mjs and c06.test.mjs: isolated fixtures/service/route/render checks.
- scripts/test-c06-ui.mjs and test-c06-hosted.mjs: Chromium and read-only hosted smoke checks.
- package.json and package-lock.json: pinned browser test tooling and commands.
- README.md, PROJECT_STATE.md and this review: current checkpoint and repeatable verification.

C06 is complete for review, with genuine hosted detail verification explicitly pending inventory. Stop here. Do not commit/push until C06 review is approved, and do not begin C07 automatically.
