# C19 Pass A review

24 September 2026. Status: **implemented, uncommitted, awaiting owner review**. Pass B has not started.

## Documentation checkpoint

The existing design plan, visual baseline and 64 referenced PNG assets (4.03 MiB total) were inspected and committed without application changes. Commit `61d234adcc14b2556460fce313674a7c71397cff` (`docs(c19): add visual baseline and design plan`) is pushed to `origin/main`; remote HEAD was verified. The tree was clean at that checkpoint. The plan's original proposal status describes that historical document; the owner's subsequent instruction authorized Pass A.

## Changes

- Semantic color tokens, typography roles, responsive gutters, controls, cards and shared state styling in `src/app/globals.css`; system fonts and existing dependencies only.
- Shared student shell and desktop/mobile navigation in `src/components/public-events.tsx`. One small client component, `src/components/ui/responsive-disclosure.tsx`, supplies native modal mobile menus/filters, Escape, focus containment/return, scroll restoration and a native disclosure fallback.
- Home (`src/app/page.tsx`): editorial introduction, working Explore search and existing product links. No invented events, counts, testimonials or catalogue query.
- Explore (`src/components/explore-search.tsx`): grouped filter presentation, chips, result hierarchy and reusable event cards. Existing GET field names, defaults, parsing, sorting and pagination remain intact.
- Event Card / Event Detail (`src/components/public-events.tsx`): stronger title/deadline hierarchy and a participation rail. Registration is ahead of secondary facts on mobile; duplicate date/location displays were removed. Unknown facts and existing trust, eligibility, save and calendar behavior remain explicit.
- Shared loading skeleton, error/not-found presentation, button sizing and skip-link polish in the relevant `src/app` routes and `src/components/ui` files.
- Minimal hover and sheet transitions with reduced-motion support. No animation dependency.
- Existing C06/C12 fixture loaders and C12/C14/C16 browser selectors were adapted to the new shared disclosure markup. Added `scripts/test-c19-pass-a-ui.mjs` for actual Next.js interaction checks and isolated populated layout fixtures.

## Validation

| Check | Result |
|---|---|
| `npm test` | Passed: 431 tests, zero failures |
| `npm run db:types:check` | Passed; generated types match clean local migration replay |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm run build` | Passed |
| `npm run test:bundle` | Passed; 24 browser assets, no private environment values/service-key references |
| `npm run test:boundary` | Passed; five server-only import boundaries rejected by Next.js |
| `npm run test:public:ui` | Passed |
| `npm run test:search:ui` | Passed |
| `npm run test:recommendations:ui` | Passed |
| `npm run test:for-you:ui` | Passed |
| `npm run test:saves:ui` | Passed |
| `node scripts/test-c19-pass-a-ui.mjs` | Passed; actual mobile navigation/filter interactions and isolated populated layouts |
| `git diff --check` | Passed |

Programmatic overflow checks passed at **320, 390, 768 and 1280px** for Home, live Explore, expanded filters, not-found, populated Explore/Detail fixtures, and shared loading/error states. Keyboard checks cover skip link, visible focus, modal Tab containment, Escape/focus return, navigation close/scroll restoration, and filter submission. Closing filters does not apply them; reopening preserves unsent choices. All existing GET controls remain present. Reduced motion disables the sheet animation. No browser page errors were reported.

Logs and machine-readable results are under ignored `work/c19/`. These are targeted layout/interaction and regression checks, not a claim of exhaustive assistive-technology or production performance certification.

## Six representative captures

| Page | 390px | 1280px |
|---|---|---|
| Home | [Mobile](c19-pass-a/home-390.png) | [Desktop](c19-pass-a/home-1280.png) |
| Explore | [Mobile](c19-pass-a/explore-390.png) | [Desktop](c19-pass-a/explore-1280.png) |
| Event Detail | [Mobile](c19-pass-a/detail-390.png) | [Desktop](c19-pass-a/detail-1280.png) |

Home captures use the running Next.js production build. Populated Explore/Detail captures use actual server-rendered components and production CSS with isolated local synthetic database fixtures, visibly labeled as such. The existing escaped script string in the Detail security fixture is deliberately rendered as harmless text. These captures do not represent genuine hosted events. The hydrated menu/filter checks run separately against the actual Next.js application. No hosted account, event or other fixture was created for this pass.

## Functional freeze and remaining review

No changes to `src/lib`, Supabase migrations/schema/RLS, generated database types, dependency manifests or environment configuration. No backend services, API contracts, authentication, recommendation/eligibility formulas, search semantics, notification behavior, submission workflow or AI grounding changes. No hosted migration or source activation. Existing shell authentication/unread inputs remain unchanged.

`.env.local` remains ignored and untracked. Changed text was checked against configured private environment values and common credential patterns; no matches were found. Only documentation/assets were included in the pushed checkpoint. Pass A application, test and review changes remain uncommitted.

Shared typography, tokens and shell styling naturally affect other routes; For You, personalization and save surfaces received regression checks, but their full visual redesign belongs to later passes. No new package, remote font or image request was introduced; no before/after performance score is claimed. Owner visual review is the next step. C09-C11/C17 and Notifications 1.1 remain deferred; Pass B, C20 and C21 have not started.

## Visual refinement — owner feedback

One focused presentation pass completed after technical approval; still uncommitted. Home's composition, palette, typography and mobile structure are preserved, with a slightly tighter desktop header and clearer navigation grouping/active state. Explore now groups search and filters into one neutral toolbar and presents compact Results/query state. Cards use a distinct neutral deadline group, paired date/location facts, quieter visible provenance, and a canonical **View event** link ahead of the secondary save action. Mobile card padding and spacing are reduced without removing facts. Event Detail's desktop participation rail aligns with the hero; mobile keeps it near the top. Paired body facts and fewer dividers reduce repetition.

The responsive disclosure implementation, search values, routes, save/calendar operations and all backend behavior are unchanged. This refinement touched only three presentation files (`globals.css`, `public-events.tsx`, `explore-search.tsx`), the targeted visual test, existing six captures and this note.

Revalidation passed: targeted C19 UI checks, public UI, search UI, typecheck, lint and `git diff --check`. A fresh production build also passed to supply current CSS/Next.js output for the browser tests. No horizontal overflow at 320/390/768/1280px. Added assertions verify that every View event action matches its title's canonical URL and the desktop participation panel aligns with the hero. The same six 390/1280px captures above were overwritten and visually reviewed; synthetic fixture labeling remains explicit. Earlier broad-suite results in this report are from the initial Pass A run; they were not rerun for this styling/markup-only refinement. Updated logs are ignored under `work/c19/refinement-*`.

No commit or push was performed. Pass B has not started.
