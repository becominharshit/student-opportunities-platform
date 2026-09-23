# C14 eligibility and deterministic recommendations review

22 September 2026. **Complete — review approved on 23 September 2026; commit/push authorized.** C13 baseline: `3b6e7f62f39936aafa6bc6c8197c5f8431bf5c69`. C15 is not started. C09–C11/C17 remain DEFERRED.

## Architecture and scope

`src/lib/recommendations/` separates bounded deterministic eligibility, normalized facts, scoring, fixed explanations, types and authenticated database reads. Runtime modules are server-only. Results are computed for one published event/version and the current student; nothing is persisted. No migration, generated-type change, dependency, environment variable, external API, source activation or hosted database push was needed. C03 AST and C13 profile contracts are unchanged. C12 search relevance, public projections and pagination are unchanged; there is no full-catalogue personalized sort or For You page.

`service.ts` resolves Auth identity internally, then reads only the current user's relevant profile fields/interests/skills through the ordinary authenticated Supabase client and existing RLS. It has no `user_id` argument and no service-role client. It reads one published event with an expected optimistic version and checks publication/version again after the related reads. Missing/private/changed events return no personalized result; profile/query errors fail safely. No name, email, portfolio, user ID, raw eligibility evidence or private ingestion data is returned in the recommendation result. Event Detail remains public; the personalized section is server-rendered, and `/events/:path*` now uses existing session refresh/private no-store response headers. Anonymous visitors get only a neutral sign-in prompt. Partial profiles do not trigger onboarding redirects.

## Eligibility semantics

Three states: eligible, ineligible, unknown. ALL fails if any child fails, passes only when all pass, otherwise unknown. ANY passes if any alternative passes, fails only when all fail, otherwise unknown. Every branch is evaluated and retained in a bounded explanation tree; a failed alternative does not disqualify an otherwise passing ANY group. Empty, malformed, cyclic, unsupported or oversized rules fail to unknown.

The existing version-1 AST supports ALL, ANY, unresolved, and predicates for `student_status`, `degree`, `study_year`, `institution`, `participation_country`, `team_size`; operators `eq`, `in`, `gte`, `lte`, `unrestricted`, restricted by the C03 validator. Numeric comparisons apply only to year/team size. Preserve depth 12 (including the validator's extra IN-value recursion), 16KiB byte bound; add a 1,024-node evaluation ceiling. No freeform prose or denormalized eligible-year fallback is parsed.

Degree/institution/text comparisons are exact after outer trimming and case normalization, with no degree equivalence, fuzzy mappings or prestige inference. Country is participation location only, never nationality/residency/citizenship. City, skill and domain eligibility predicates do not exist in the current AST: unsupported rules stay unknown. Structured student-status and actual-team-size predicates can be evaluated by the pure function, but C13 does not store these actual facts; the application passes null. Education and preferred team size do not establish them. An explicit unrestricted predicate passes without a student fact. False is distinct from missing.

Evidence is usable only with `verification_status=current` and a valid explicit-offset `last_checked_at`. Other statuses/missing timestamps withhold eligibility and component evidence. This uses existing stored verification, without inventing a freshness TTL or claiming a new external check. Official rules remain authoritative. There is no inference of age, gender, citizenship, competency or experience.

## Scoring and coverage

| Component | Weight | Deterministic treatment |
|---|---:|---|
| Eligibility | 25 | Eligible=1; ineligible=0; unknown=null |
| Interests | 25 | Fraction of distinct, explicitly mapped event domains in student's selected interests |
| Skills | 15 | Fraction of distinct controlled event skill IDs selected by student |
| Location/mode | 10 | Known preferred participation route=1; available but nonpreferred mode=0.5; explicit incompatible location/travel=0; insufficient facts=null |
| Academic year | 10 | Relevant passing structured year rule/unrestricted=1; failing=0; absent/conditional/unknown=null |
| Category | 10 | Explicit any-category or matching selected category=1; explicit mismatch=0; missing=null |
| Team preference | 5 | Known preferred-size overlap/allowed solo=1; explicit disjoint options=0; incomplete required bounds/options=null |

Weights total 100. The current C14 request explicitly gives the **full 25-point eligibility component** to an eligible result; this takes precedence over the older Section 35 description of a non-year eligibility component. Year also retains its separately requested 10-point weight. This is deliberate, rather than silently replacing either requested weight.

Let K be the sum of known component weights, and E the sum of weight × value for those components. Coverage=K/100. Score=round(100×E/K), **only** when eligibility is eligible, coverage is at least 75%, and the event is not explicitly cancelled/completed/registration-closed. Otherwise headline score=null. Unknown components contribute neither earned nor known weight; an explicit mismatch contributes known weight with zero earnings. Coverage levels: high ≥75%, medium ≥50%, low <50%. Coverage is the proportion of usable weighted evidence, not AI confidence, admission probability or organizer approval. A high score with missing evidence does not imply those missing components matched.

Ineligible is a hard recommendation gate without hiding factual event information. Unknown never earns eligible credit and never produces a headline recommendation score, even if other components have 75% coverage. Low coverage displays an insufficient-information message. Explicit closed/cancelled/completed availability is a separate recommendation gate. Unknown availability is not turned into an open-status claim.

Interest mappings are identity-only for C13 controlled slugs: ai-ml, web-development, app-development, cybersecurity, robotics, data-science, open-source, cloud, blockchain, entrepreneurship, product, design. Any unmapped event domain makes this component unknown. Empty student/event lists remain unknown rather than implying no requirements or any preference. Skills compare IDs, not competency. No fee, prize, exchange-rate or cross-currency input enters scoring.

For mode/location, hybrid offers online/offline routes and chooses a known best route, withholding a score if an unknown route could affect that choice. Online requires no city/travel fact. Offline needs known event city/country and either matching profile location or explicit willingness to travel; missing relevant profile/travel facts stay unknown. Travel willingness is a preference, not proof of travel eligibility or distance. Team preference requires both stored preference bounds and known event options; a missing maximum is not unlimited, and preference does not establish actual team size.

Academic-year scoring projects the AST conservatively. ALL combines relevant year conditions. ANY awards year credit only when each currently satisfied alternative carries a passing year condition; a passing alternative without a year rule is not proof that all years are accepted. No passing alternative or conditional/missing evidence remains unknown.

## Explanations and Event Detail

Each explanation includes stable code, tree path, state, optional field and fixed text; raw evidence/unresolved prose is never copied into output. ALL/ANY groups explicitly describe alternatives. The service result includes component weights, normalized values, earned points, evidence coverage and exclusion codes. UI shows eligibility, an optional gated match score, coverage explanation, expandable textual Pass/Fail/Unknown reasons and component explanations, official-rules caveat, and a profile link. Meaning does not depend on color. This is restrained C14 integration, not C19 visual polish.

## Files changed

- New `src/lib/recommendations/{types,explanations,eligibility,facts,scoring,service}.ts` and `src/components/event-personalization.tsx`.
- Event Detail route, existing public detail component's optional slot, and proxy event matcher.
- New `tests/recommendations/{harness,service-harness,c14.test,service.test}.mjs`; existing C06 route harness updated for the new server section.
- New `scripts/test-c14-ui.mjs`, `scripts/verify-c14-hosted.mjs`; extended actual Next negative-import boundary test; package validation scripts.
- README, PROJECT_STATE, roadmap status correction and this review. No lockfile or database changes.

## Validation

Local verification: `npm test` passed **308/308**; `test:recommendations` comprises **73** tests (64 pure, 9 service/isolated SQL); `test:profiles` **46**, `test:search` **32**. Database type replay/check, TypeScript, lint, production build, browser-bundle secret scan and three actual Next client/server negative-import builds passed. C06 public, C12 search, C13 profile and C14 recommendation UI suites passed at 320/390/768/1280px with keyboard/focus and overflow checks.

C14 covers complete ALL/ANY tables, nested and depth/size bounds, explicit false, exact degree, structured year/country, unsupported predicates, missing actual status/team, unresolved/stale evidence, weights/formula/threshold, unknown versus mismatch, interest/skill overlap, location/travel/hybrid, category/team, partial profile, availability gates, deterministic bounds, malformed input and no money inputs. Service tests use the actual service and isolated PostgreSQL RLS to verify identity, cross-user isolation, publication/version recheck, error safety and minimal output. UI tests render actual server components with real deterministic results and production CSS; they do not claim an end-to-end hosted published-event Auth journey.

## Hosted verification and cleanup

The permitted **hosted profile/RLS-only path** is used: publishing synthetic events would require source/publication/audit side effects, so no hosted event or source is created or changed. Full event evaluation uses isolated PostgreSQL fixtures. The verifier creates exactly two temporary ordinary Auth accounts with non-delivery `.invalid` addresses, records their exact IDs in ignored `work/c14/hosted-results.json`, saves private profile/interests/skills through ordinary clients, checks anonymous/cross-user boundaries and blocked identity/admin injection, and runs the actual recommendation service with hosted RLS queries for a nonexistent event. Its test identity adapter uses hosted `auth.getUser()` identities; production cookie/session behavior is not replaced in application code.

Hosted verification passed on 22 September 2026: 36 named checks plus exact cleanup. Before/after counts were all zero for events, source_connectors, sync_runs, profiles, user_interests, user_skills and admin_memberships. Both exact temporary accounts and dependent profile/interest/skill/admin rows were confirmed absent. Passwords, API secrets, tokens and email links are never logged. The privileged key is confined to verification setup/cleanup and inventory reads, not ordinary recommendation evaluation. Cleanup deletes only the exact recorded Auth IDs and verifies their dependent rows are absent and inventory counts return to baseline. No migration is applied and no external source is contacted.

## Limitations and review boundary

C13 lacks actual student-status/team-size facts; those requirements remain unknown. No automatic freshness scheduler exists (C11 deferred). Exact text/domain mappings intentionally leave unsupported meanings unknown. Normalization bounds pathological rows and fails safely rather than inventing facts. Hosted inventory may be empty; a real hosted published-event personalized journey remains a future beta QA check, not a claim made here. C14 does not add AI, persisted rankings, scalable catalogue recommendation retrieval or the C15 For You page.

C14 implementation and the permitted hosted verification are complete. Owner review was approved on 23 September 2026, with commit/push authorized. C15 has not started.


## Final command results

| Command | Result |
|---|---|
| `npm test` | PASS, 308 tests |
| `npm run test:profiles` | PASS, 46 tests |
| `npm run test:search` | PASS, 32 tests |
| `npm run test:recommendations` | PASS, 73 tests |
| `npm run db:types:check` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (two unused test imports removed before final run) |
| `npm run build` | PASS |
| `npm run test:bundle` | PASS, 15 browser assets |
| `npm run test:boundary` | PASS, three rejected unsafe client imports |
| `npm run test:public:ui` | PASS |
| `npm run test:search:ui` | PASS |
| `npm run test:profiles:ui` | PASS |
| `npm run test:recommendations:ui` | PASS |
| `npm run test:recommendations:hosted` | PASS, 36 checks plus exact cleanup |
| `git diff --check` | PASS |

Final scan of 23 changed/new files found no configured environment secret values or
credential signatures. `.env.local` and hosted fixture results remain ignored and
untracked. These validation results precede the approved C14 milestone commit; no functionality changes were made during commit preparation.
