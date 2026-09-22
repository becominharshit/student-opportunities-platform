# C13 — Student Profile + Onboarding review

22 September 2026. **C13 is complete, hosted-verified and review-approved.** Work is in `C:/dev/student-opportunities`, based on main `d5b0d0434d57c867ac062dba05a7bad245b4067c`. The original Documents checkout was preserved. The implementation was left uncommitted for review; the user has now approved the C13 commit/push. C09–C11/C17 remain deferred; C14 recommendations and C19 polish were not started.

## Architecture and routes

- `/account`: authenticated saved-profile summary and links to editing, onboarding and Explore. No email address or user UUID is rendered.
- `/account/profile`: private profile editor.
- `/onboarding`: optional multi-section version of the same editor, with section navigation, review and a skip-to-Explore link.
- `POST /account/profile/save`: bounded, same-origin mutation endpoint. Verifies the confirmed user server-side, validates the section and invokes the authenticated Supabase RPC. It never accepts ownership from the form or uses a service client.

`readOwnProfile` uses the existing user-context Supabase helper, explicit field projections and own-user filters. The server-only service module returns profile fields and vocabulary choices without an Auth ID/email. The browser receives only this student's data and public controlled-choice IDs. IDs are form values, not displayed labels. There is no public profile route and no profile data added to public event queries.

The editor preserves entered values on errors and displays fixed safe messages. Successful saves refresh server-rendered data and completion state. Each section is a separate transaction; saving education does not clear an independently saved interest selection. Forms send POST bodies rather than profile values in URL queries. JavaScript provides inline confirmations; without it, native POST returns safe JSON, and the page explains the JavaScript requirement for the inline form experience.

Auth redirect destinations now explicitly include only the implemented profile/onboarding routes alongside existing destinations. Proxy coverage includes onboarding, retaining private/no-store headers, frame protection and session refresh. Every page and mutation also checks authorization independently. Private pages have noindex metadata. Error responses preserve refreshed cookie chunks separately.

## Schema review and additive migration

All requested data fits existing C03 structures. **No tables or profile columns were added.** Existing RLS policies and table grants were preserved.

`supabase/migrations/20260922000200_c13_profiles.sql` adds:

1. Twelve controlled interests and twelve skills, with deterministic UUIDs and unique slugs. Existing slug records are preserved by conflict handling.
2. `private.c13_profile_valid(profiles)`, plus `c13_profile_values`, a defensive CHECK for text/year/team/link bounds. The constraint is NOT VALID to preserve unknown legacy rows without rewriting them; new/updated rows are checked. Hosted inventory contained zero profiles before migration.
3. `public.save_profile_section(section text, values_json jsonb) returns boolean`, SECURITY INVOKER with an empty search path. Execute is granted only to authenticated, with PUBLIC/anon/service-role execution revoked. Existing RLS remains effective.

The RPC accepts six allowlisted sections, rejects unknown keys (including user_id), validates JSON types, obtains identity from `auth.uid()`, and locks the existing profile row. Selection replacement, FK checks and profile timestamp updates are atomic. Unknown vocabulary IDs fail without losing prior selections. Duplicate relationships remain protected by primary keys. Successful concurrent section updates serialize on the profile row; same-section edits use last successful save, not a new optimistic-version system.

C04 still owns profile initialization: its identity-only, ignore-duplicate bootstrap remains unchanged. The C13 RPC does not silently create or replace missing profiles. Read/bootstrap failures show a safe retry/sign-in state.

No new environment variable, dependency, background job or source registration was introduced. Types were regenerated from clean migration replay. No unrelated migration was modified.

## Profile fields and validation

| Section | Fields and behavior |
|---|---|
| About you | Name ≤100, city ≤100, two-letter country code normalized to uppercase; blanks become null |
| Education | Institution ≤200, degree/course ≤100, integer study year 1–20 or null |
| Interests | Multiple controlled IDs; unknown IDs rejected; removing all leaves no relationship rows |
| Skills | Multiple controlled IDs with the same privacy and FK rules |
| Preferences | Existing category slugs, online/offline/hybrid, nullable travel boolean, explicit any-category boolean, optional team bounds 1–100 including the student |
| Optional links | Up to five HTTP/HTTPS URLs, each ≤2048 characters; one per line; removable to null |

Category selections and explicit any-category cannot conflict. Empty preference selections normalize to null, not an implicit “any.” Explicit false remains distinct from unknown. Blank numeric values remain null, never zero. Partial team bounds remain unknown on the missing side, not unlimited. Degree descriptions such as B.Tech are preserved; year must be an explicit integer. No qualification equivalence, nationality, age, skills, interests or eligibility is inferred.

Runtime checks reject malformed/credential-bearing URLs, javascript/data/file schemes, whitespace/control characters, backslashes and invalid ports. Database checks additionally reject unsafe schemes/authorities and bound stored links. Links are displayed as private text and are never fetched. No SSRF capability is added.

POST requests must have the configured Origin and form content type, cannot be cross-site, and are bounded to 16 KiB. SQL JSON input and selection counts are also bounded. Raw PostgreSQL/provider errors are never rendered. Ordinary users cannot create global vocabulary entries.

## Vocabulary

Interests: Artificial Intelligence / ML, Web Development, App Development, Cybersecurity, Robotics, Data Science, Open Source, Cloud, Blockchain, Entrepreneurship, Product, Design.

Skills: Python, JavaScript, TypeScript, Java, C, C++, React, Next.js, SQL, Machine Learning, Git, UI/UX.

These are reference labels, not invented user facts. Existing C03/C05/C12 fixtures were adjusted to reuse reference vocabulary and to assert relationship counts against the actual vocabulary size; their privacy assertions remain intact.

## Onboarding, completeness and accessibility

All six sections are optional and independently saveable. Existing partial values populate the same editor. Review leads to the saved account summary. Users can skip remaining sections without blocking Explore. Text explicitly says recommendations are future functionality and preferences are not eligibility.

Completion is deterministic, calculated from saved data across five groups:

- Basic: name, city and country present.
- Education: institution, degree and study year present.
- Interests: at least one selected ID.
- Skills: at least one selected ID.
- Preferences: explicit any-category or selected categories, selected mode, specified travel choice and both team bounds.

The indicator says “Profile: N/5 sections complete,” names incomplete groups and excludes optional links. It is not a recommendation score. No profile-completion flag or fabricated default is stored.

The existing visual tokens are reused. Forms have explicit labels, grouped choices, section headings/navigation, minimum 44px controls, keyboard focus and live saved/error status. Real component browser checks passed at 320, 390, 768 and 1280 pixels without horizontal overflow. The initial browser check found an ambiguous select label; explicit label association fixed it. This is functional/accessibility work, not final design polish.

## Local validation

All requested commands ran from the fresh writable checkout:

| Check | Result |
|---|---|
| npm test | PASS — 235 tests: existing 189 plus 46 C13 |
| npm run test:profiles | PASS — 46/46 |
| npm run test:search | PASS — 32/32 |
| npm run db:types:check | PASS — clean replay/type equality |
| npm run typecheck | PASS |
| npm run lint | PASS — zero warnings |
| npm run build | PASS — protected routes and POST endpoint compiled |
| npm run test:bundle | PASS — 15 browser assets, no private values/service-key references |
| npm run test:boundary | PASS — actual service client and connector fetcher remain server-only |
| npm run test:public:ui | PASS — existing public layouts, keyboard and pagination |
| npm run test:search:ui | PASS — existing filters, URL/history, keyboard and recovery |
| npm run test:profiles:ui | PASS — onboarding/editor at four widths, labels, keyboard/focus and optional sections |

Profile unit tests execute real migrated SQL under anon/authenticated roles, and actual mutation handlers with an isolated Supabase adapter. Coverage includes own/cross-user reads/writes, bootstrap preservation, nullable fields, add/remove/duplicate/FK relationships, validation, partial saves, deterministic completion, safe errors and refreshed cookies. Existing public tests plus import/projection checks ensure private profile data is not introduced into Explore or Event Detail.

The local UI harness renders the actual component with production CSS; it tests controls/layout/keyboard, not hydrated network submission. The hosted browser verification below exercises the real hydrated Next.js form and authenticated mutation endpoint. Existing Node module-type warnings are nonblocking.

## Hosted verification

Project: `vzuoscpwmytgibsxugcx`. History inspection found six matching migrations and only C13 pending. Dry run listed only `20260922000200_c13_profiles.sql`, with no separate seeds/roles. Apply succeeded; a second history inspection showed all seven versions matching. No reset, unrelated migration, source fetch or production event insertion occurred.

Before migration, profiles/interests/skills were empty. The migration added only the concise reference vocabulary, function and constraint described above.

`node scripts/verify-c13-hosted.mjs` passed **45 hosted assertions plus cleanup**:

- Two temporary ordinary Auth sessions; service key used only to create/delete exact fixtures and inspect baseline counts.
- Anonymous onboarding redirects to login; real C04 browser login bootstraps a private profile and returns to onboarding.
- Actual hydrated form saves a partial name and interests/skills, then reloads with persisted values.
- Own reads/updates use publishable-key authenticated sessions; no service role participates in profile editing.
- User A cannot read/update B's profile or read/update/delete/insert B's interests/skills. B's values remain unchanged.
- Anonymous profile/relationship reads and mutation are denied; injected owner keys are rejected.
- Explicit false and null preference values work; safe links are accepted, unsafe links rejected, links and selections can be removed.
- Private account summary shows saved information; public Explore does not. The browser made no profile-link or external-source requests.
- Repeated C04 bootstrap preserves saved profile information.

Hosted event inventory is empty: populated public event-detail privacy remains covered by isolated tests and unchanged public projections, not falsely claimed as a populated hosted journey. No real student account was modified.

### Exact cleanup

Run `1faceea9-e734-4874-aa20-809a663d1371` created only these temporary Auth users:

- `e91d7a3d-13b6-4b91-ac08-6a28d98855bd`
- `bbecd87c-5298-49dc-b546-774acb4ab862`

Both were deleted by exact ID; subsequent Auth lookups returned 404. Their profile, user_interests, user_skills and admin-membership rows were verified absent. All baseline counts returned to zero for events, connectors, sync runs, profiles, user interests/skills and admin memberships. Reference vocabulary remains intentionally installed. Local result identifiers/check names are in ignored `work/c13/hosted-results.json`; no credentials/passwords/tokens were printed or written to the report.

## Files changed

- Routes: `src/app/account/page.tsx`, `src/app/account/profile/page.tsx`, `src/app/account/profile/save/route.ts`, `src/app/onboarding/page.tsx`.
- Profile modules: `src/lib/profiles/validation.ts`, `service.ts`, `handler.ts`, `page.tsx`; `src/components/profile-editor.tsx`.
- Auth integration: `src/lib/auth/policy.ts`, `src/proxy.ts`.
- Schema/types: the one C13 migration and `src/lib/supabase/database.types.ts`.
- Tests: `tests/profiles/c13.test.mjs`, `handler.test.mjs`; existing C03/C05/C12 vocabulary fixtures; `scripts/test-c13-ui.mjs`, `scripts/verify-c13-hosted.mjs`; package test commands.
- Documentation: README, PROJECT_STATE and this review. The pre-existing status correction now accurately identifies the C12/C12.5 remote commit.

## Remaining limits and review decision

C13 is complete and its review is approved. Existing source-permission/launch gates remain unchanged. Profile ownership and privacy are enforced; optional data is not coerced into eligibility facts. Country uses the existing two-letter code contract, not a location/nationality verification service. Degree aliases are preserved, not equated. Save conflicts within one section use last successful write. There is no autosave: users save each section explicitly. Legacy rows that violate new bounds are preserved until a later edit, which must satisfy validation; no such hosted rows existed during migration.

No C14 matching, notifications, AI, connector activation or final design polish was added. No new secret/environment contract is required. `.env.local` and generated fixtures remain ignored/untracked. C13 commit/push is approved. Stop after this milestone; C14 has not started.
