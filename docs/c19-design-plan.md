# C19 — Final Product UI / Visual Design / Motion

Status: **Proposed for review. No implementation authorized or performed.**

24 September 2026. Application baseline: `main`, `dcf2def036bf0df279f7f0c4a366c99d940334db`. Evidence: [visual baseline and 64 captures](c19-visual-baseline.md). Existing functional architecture is fixed. Student experience takes priority over admin consistency.

## 1. Art direction: an editorial opportunity index

A calm, precise place to make student decisions: warm neutral paper, ink-like text, deep green actions, strong typographic grouping and crisp rules. The identity comes from composition and useful information, not decoration. Use restrained asymmetry on the homepage and event detail; use predictable alignment in results and forms.

The baseline already has a credible green/neutral foundation. Preserve that recognition while replacing inconsistent shells, small technical copy, repetitive metadata and arbitrary panel treatments. Avoid gradients, glass, glowing AI imagery, rainbow categories, large rounded dashboard tiles, fake metrics and stock-photo filler.

Design principles:

1. **Help students scan, then decide.** Title, date, deadline and action outrank implementation explanations.
2. **Make uncertainty legible.** Unknown, unavailable, closed, unverified and ineligible are different states, with explicit words.
3. **One product, contextual density.** Share tokens and primitives; allow a compact admin table and a readable student card.
4. **Preserve evidence.** Styling never upgrades trust, eligibility, match certainty or availability.
5. **Use whitespace to group.** Reduce the empty gaps and 5,000px mobile-form burden through organization, not by hiding necessary information.
6. **Feedback follows reality.** Pending is pending; success appears only after server confirmation.

## 2. Typography

No new font dependency or external font requests. Start with `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; use `ui-monospace, SFMono-Regular, Consolas, monospace` sparingly for technical metadata. Typography is defined by semantic roles rather than page-specific classes. A custom licensed, self-hosted font is a separate future decision, not required for C19.

| Role | Mobile / desktop size | Weight / line height | Use |
|---|---|---|---|
| Display | 36 / 48px | 650–700 / 1.1 | Home only; 32px at 320px if needed |
| Page title | 28 / 36px | 650–700 / 1.15 | One h1 per page |
| Section | 22 / 24px | 600 / 1.25 | Major groups |
| Card title | 20 / 22px | 600 / 1.3 | Wrap naturally; no essential title truncation |
| Body | 16px | 400 / 1.55 | Instructions and facts |
| Compact body | 14px | 400 / 1.5 | Card supporting text and admin rows |
| Metadata | 13–14px | 400–500 / 1.45 | Date precision, checked time, source notes |
| Label | 14px | 600 / 1.4 | Form labels, action labels |
| Badge | 12–13px | 600 / 1.35 | Short textual status; never long prose |
| Numbers | Inherit context | Tabular figures | Match, completion and counts, never conflated |

Use modest negative tracking on display/page titles only. Uppercase is limited to short eyebrow labels. No student-facing 10–11px factual copy. Input text stays 16px on mobile. Keep prose around 60–70 characters per line; technical field names and milestone IDs are not the visual voice of student pages.

## 3. Color tokens

Light theme only for this milestone; remove inconsistent isolated dark treatments as components migrate. Proposed values below are design candidates, not a claim of measured contrast compliance. Verify every rendered foreground/background pair, including hover and focus, during C19.1.

| Semantic token | Proposed value | Purpose |
|---|---|---|
| background | #FAFAF8 | Page canvas |
| surface / card | #FFFFFF | Forms, cards, dialogs |
| surface-muted / muted | #F0F2EE | Supporting areas |
| foreground / card-foreground | #202521 | Main ink |
| muted-foreground | #535B54 | Secondary text |
| primary | #176044 | Existing brand/action green |
| primary-hover | #104A34 | Hover/pressed emphasis |
| primary-foreground | #FFFFFF | Filled action text |
| primary-subtle | #EAF2ED | Selected navigation/background |
| border | #D4D9D2 | Decorative separation |
| input-border | #7A857C | Essential input boundary |
| ring | #176044 | Focus outline |
| success ink / surface | #235D3A / #EDF6EF | Confirmed successful action |
| warning ink / surface | #80510B / #FFF5DF | Needs attention/review |
| destructive ink / surface | #A12C2C / #FDEEEE | Error or destructive action |
| info ink / surface | #245C78 / #EBF3F8 | Informational state |
| unknown ink / surface | #535B54 / #F0F2EE | Explicit unknown, not failure |

Map these into Tailwind's existing CSS-first theme, including currently missing `card`, `card-foreground`, `input` and `destructive` aliases. Do not change all existing border uses to a stronger input border globally. Categories use neutral text/chips, not individual colors. Every status has a text label; optional icons supplement it. Success green must never imply official verification unless the existing data explicitly says so.

## 4. Spacing, borders and grids

- Base spacing: 4px. Approved steps: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Component padding: 16px mobile, 20–24px wider screens. Field groups: 16–24px. Related text: 4–8px. Major sections: 32px mobile, 48px desktop.
- Radii: 4px compact badges, 6px controls, 8px cards, 12px overlays. Pill shape only for short removable filters or suggestion chips.
- Borders: 1px for controls/cards; occasional 2px leading rule for a selected or important section. No border around every nested paragraph.
- Elevation: flat default; subtle shadow only on overlays and an occasional interactive card hover. No heavy blur/backdrop filters.
- Maximum shell width: 1200px including gutters. Gutters: 16px at 320/390, 24px at 768, 32px at 1280.
- Conceptual grid: four columns mobile, eight tablet, twelve desktop. Event lists remain one column at small widths, two from tablet when useful; avoid three compressed metadata-heavy cards.
- Reading/forms width: 720px; account summary up to 960px. Detail: approximately 2:1 content/action columns at desktop. Auth forms remain narrow, with shared typography and controls.
- Full-height page shell puts the footer after content or at the viewport bottom on short screens, without fixed heights or artificial blank panels.

## 5. Component language and migration contract

Extend the existing CVA Button and `cn` foundation. Extract presentation incrementally rather than replacing domain components.

| Primitive/pattern | Variants and rules |
|---|---|
| Button / ActionLink | Primary, secondary outline, quiet, destructive; actual buttons for actions and anchors for navigation; never nest them. 44px default target, 48px prominent search action. |
| Field | Visible label, optional/required explanation, input/select/textarea, associated hint/error; default, focused, pending, disabled, invalid states. Preserve names, values and validation rules. |
| Checkbox / preference row | Native semantics, branded accent, full label target; preserve nullable/unknown choices. |
| Badge / StatusIndicator | Functional semantic tones plus words; distinguish trust, publication, lifecycle, eligibility and unread state. Do not merge enums. |
| Surface / Card | Flat ruled or bordered surface using common padding/radius; compact and standard density. Domain-specific content stays outside the primitive. |
| PageHeader / SectionHeader | Consistent title, brief description, optional action group; responsive wrapping. |
| EventMetadata | Shared labeled date/deadline/location/mode rendering; reuse current formatters and unknown/date-precision notes. |
| Notice / EmptyState | Quiet info, warning, error; title, short explanation and an existing recovery action. Distinguish empty, filtered-empty, end-of-list and unavailable. |
| Pagination | Existing next/first/previous links and cursors; clearer layout, no new load-more/infinite-scroll semantics. |
| Disclosure | Native details/summary when suitable; existing facts remain visible unless they are genuinely secondary explanations. |
| Drawer / Dialog | Small client-side overlay boundary, preferably native dialog; named heading, Escape, focus containment/restoration, inert background, scroll management. Inline fallback without JS. |
| Tooltip | Only supplementary labels where needed, available on focus and hover; never the sole home for eligibility, deadlines or required instructions. No tooltip dependency by default. |

For every adopted primitive document default/hover/active/focus/disabled/pending/error states, tokens, semantics and intended usages. Prefer named variants to arbitrary styling overrides. Avoid a polymorphic abstraction that weakens native button/link types.

## 6. Global student navigation

Desktop at 1280px: compact wordmark left; Explore, For You, Saved and Assistant as primary destinations; Notifications with existing unread indicator, Submit Opportunity and Account as utilities. If labels no longer fit at text zoom, switch to the compact layout rather than truncate.

At 768px and below: one approximately 60px header with wordmark, labeled Notifications affordance and Menu button. An intentional navigation sheet exposes all seven destinations with text labels and current-page indication. No second permanent row and no icon-only bottom bar. Set `aria-current="page"`; active styling uses text weight and a rule or subtle surface, not color alone. Support reduced motion and focus return to Menu.

Guest navigation emphasizes Explore and Sign in; protected destinations retain their current login behavior. Existing unread-count values remain authoritative. Preserve all current notification reads, enabled preferences and refresh behavior. Missing unread data must not be fabricated as a known zero.

Presentation extraction must not introduce a new server request per nav item. The current guest-looking Event Detail shell and uneven unread-count propagation are **functional-boundary questions**: use existing supplied identity/count data only. If fixing them requires new identity resolution, service reads or API changes, stop that portion and record a separate decision; do not silently include it in C19.

## 7. Route plans

### Home

Replace the holding-page composition with a concise editorial hero: “Find your next student opportunity.” Supporting copy explains discovery, checking requirements and saving a shortlist. Use typography and a thin grid/rule motif, not an event mockup or invented statistic.

Sequence: hero and Explore CTA → search form targeting the existing `/explore?q=` contract → three concise capabilities (discover, understand, shortlist) → personalization explanation with unknown-data caveat → source/trust explanation → closing Explore/profile CTA. Desktop hero uses an 8/4 editorial split; mobile puts search directly below the short introduction.

No new homepage catalogue query in this frozen scope. A genuine-opportunities section is conditional on an already supplied data contract; none currently exists on Home, so omit it and link to Explore. No fake logos, testimonials, counts, live-source claims or decorative fixture cards.

### Explore

Make search the dominant control. Group filters under Participation, Location, Dates/deadlines, Requirements and Other facts; retain every C12 field, accepted value, GET parameter and explanation. Sorting stays clear beside the result summary at desktop.

Desktop: expanded filter region in a deliberate grid, followed by result summary/chips and two-column cards. Mobile/tablet: Filters button opens a full-height panel containing the same form controls; keep a visible Apply action and explicit close action. Closing must not apply filters. Only submitted URL state counts as active; unsent entries stay distinct. Do not duplicate enabled fields across hidden desktop/mobile forms. Retain native inline disclosure when JS is unavailable.

Filter chips show readable labels with a labeled removal action. Keep C12 sort order, warnings, cursor validation, unknown matching, next-page behavior and count wording. “24 on this page” must not become a catalogue-total claim. No automatic filtering or infinite scroll.

### Event cards

One card composition: neutral category/mode eyebrow → linked title → organizer → compact dates/deadline block → location/status → trust and checked-time line → save action. Use a two-column metadata grid where width permits; stack at 320px. Titles wrap, descriptions remain optional, and the entire card is not a clickable wrapper around other controls.

Reuse current fact/date/trust formatters. Unknown remains explicit. Date-only deadlines retain their time-unspecified note. No inferred urgency countdown. Contextual slots add existing match explanations on For You and calendar actions on Saved, without adding fetches or calculated values.

### Event Detail

Title, organizer and trust first. Place primary registration/save actions and critical dates near the top. Desktop action rail may stick within its column with safe focus offsets; mobile actions remain in normal flow to avoid keyboard/viewport obstruction.

Main reading order: critical dates → participation/eligibility → event description → team/fees/prizes → timeline → sources. Present the existing personalized eligibility/match block as a clearly labeled companion section, with verdict and uncertainty visible. Only detailed rule trees and scoring explanations use disclosure. Preserve action wording for open, closed, cancelled and completed events, safe external links, calendar availability and download semantics.

### For You

Short completion banner linking to the existing profile, followed by **Best Matches** and **Worth Reviewing** as separate labeled sections. Best Matches can show only already permitted scores; Worth Reviewing uses neutral/warning language and never a manufactured percentage. Explain coverage separately from matching and profile completion. Retain the bounded-candidate disclosure, ranking, exclusion rules and no-additional-pages behavior. Simplify its placement, not its meaning.

### Saved

Use the common card with a shortlist-oriented metadata layout: deadline, date, status, save control and calendar actions. Preserve most-recently-saved order and existing pagination. No new deadline sort, automatic archiving, urgency calculation or batch action. Empty state supplies one clear Explore action. Unavailable/hidden opportunities retain their existing privacy treatment.

### Assistant

A clean question-and-evidence workspace within the shared shell. Short, readable privacy notice; labeled composer visible early in the initial mobile viewport; compact starter questions above it. Conversation uses subtle role separation, not large colored bubbles or AI imagery.

Within responses, authoritative fact sections receive stronger hierarchy than model prose. Retain eligibility, comparison, deadline and recommendation facts exactly; differentiate them through headings and shared metadata/status styles. Comparison content must retain all fields; use stacked labeled sections on mobile or a clearly labeled, keyboard-scrollable region if a table is already provided. Do not create new comparisons or normalize scores in the UI.

Keep ephemeral history, clear-conversation behavior, canonical internal links, rate-limit messages and loading lifecycle. Label the input, announce new responses politely and avoid repeatedly reading the full transcript. No streaming/typewriter simulation, persistence, new prompts/tools, provider calls during automated visual tests or grounding changes.

### Notifications

Readable rows: textual Unread indicator, existing type label where supplied, event title, time, body and action. Read rows lose emphasis but retain readable text. Align mark-read controls consistently; keep unread badge and mark-all behavior. Do not reinterpret unavailable events or introduce a new type mapping without existing facts. No grouping algorithm, relative-time urgency, new delivery preference or job change.

### Submissions

Keep the existing single submission form and lifecycle. Group Event information, Sources, Dates, Participation, Fees/prizes and Review notes with a compact section index. Add the plain-language cue “Unknown? Leave it blank” only to fields that actually permit omission; retain required fields and constrained selects unchanged.

Improve field/error associations, inline summaries and focus visibility without changing validation, payloads or defaults. Submitted-item cards show existing status labels and explanation prominently. Accepted draft and publicly published remain visibly distinct. Preserve withdrawal confirmation; do not add editing, autosave, a wizard, new success state or automatic publication.

### Account, Profile and Onboarding

Account uses a readable overview grid with existing completion summary, profile facts, preferences and account actions; remove the auth-form-width constraint. Profile/onboarding use clearly bounded sections with a desktop section index and compact mobile jump navigation. Interests and skills use full-row checkbox targets and two columns when text fits.

Completion display is derived only from the existing completed/total values. Each section retains its own save action and confirmation. Keep optional values, skip links and independent persistence. No autosave, mandatory progression, collapsed unsaved sections or “finish profile” gate. Correct stale recommendations copy and corrupted characters as presentation copy corrections, preserving domain explanations.

### Admin consistency

After student surfaces stabilize, apply shared typography, controls, neutral surfaces and semantic statuses to dashboard, event editor and moderation pages. Retain denser tables and audit details. Allow header buttons to wrap as whole controls, not word stacks. Preserve table/mobile-card content, all reason inputs, validation, draft/public distinction and protected actions. No dashboard query, metric, workflow or moderation redesign.

## 8. Motion and feedback

No Motion/Framer Motion package is installed. **Use CSS transitions; no animation dependency is proposed.** Small client islands are justified for navigation/filter overlays only. Never move data services into them.

| Interaction | Treatment | Timing / truth constraint |
|---|---|---|
| Hover/focus/press | Border or surface change; focus immediate | 120ms hover; no delayed focus |
| Panel/disclosure | Small opacity/translation on open where robust | 160–200ms; content remains usable without animation |
| Navigation/filter drawer | At most 12px translation plus opacity | 220ms; no spring/bounce |
| Page/section entrance | Optional single 4px fade for noncritical content | 180ms; never delay first meaningful content or stagger lists |
| Save/unsave | Pending label if existing lifecycle can expose it; confirmed textual pressed state | No optimistic success; no toast/state added across redirects without existing confirmation |
| Filter apply/remove | Result summary/status announcement after URL navigation | No pretend loading delay or client-side reordering |
| Notification read | Subtle emphasis change after confirmed refreshed data | 150ms; do not remove before response |
| Profile/submission save | Existing success/error message in a stable notice area | Preserve server result; no congratulatory success before it |
| Assistant loading/facts | Static readable loading status; one subtle fact appearance | 160ms; no looping decorative pulse or typewriter |
| Calendar | Link press/hover only | Never claim an external calendar entry was saved |

Use a restrained ease-out curve such as cubic-bezier(0.2, 0, 0, 1); opacity/color transitions use ease. Under `prefers-reduced-motion`, remove translations, entrance effects, pulses and smooth scrolling; retain immediate state changes and all textual feedback. No copy/share controls are added because they are not existing product features.

## 9. Responsive and accessibility acceptance

Design and review all stages at **320, 390, 768 and 1280px**. Test 900px baseline height plus shorter mobile viewport/virtual-keyboard scenarios. Do not equate zero horizontal overflow with a usable layout.

- Mobile: single-column cards/forms, concise header, full labels, wrapped action groups, reachable overlay actions and safe-area padding.
- Tablet: compact navigation, two-column cards where content fits, two-column field groups only where labels remain readable.
- Desktop: full navigation, measured reading widths and detail action rail; no giant empty hero/chat region.
- Long titles, unbroken URLs, Unicode, many chips, deep eligibility explanations, large counts and multi-event comparisons must not overflow the page.
- One main landmark and working skip target on every route and failure state; coherent heading levels and DOM reading order.
- WCAG AA targets: normal text 4.5:1, large text 3:1, essential boundaries/focus indicators 3:1. Measure actual pairs; disabled decorative exceptions are not a reason to make important information faint.
- Visible focus on every interactive element; no nested controls. Aim for 44px touch targets including menu, save and mark-read actions.
- Visible labels, associated hints/errors, `aria-invalid` when appropriate; error focus must preserve typed data. Do not replace native form behavior with custom widgets needlessly.
- Dialog keyboard containment, Escape/close, focus restoration, background inertness; no focus trap in ordinary disclosures.
- Status words supplement color; loading/success/error changes have appropriate live announcements. Do not add countdown announcements every second.
- Review keyboard-only use, 200% zoom, reflow at narrow widths and reduced motion. Tooltips never contain necessary instructions.

## 10. Performance and dependencies

Keep Next.js server pages/components and existing service calls. Use the existing React, Tailwind, CVA, clsx and tailwind-merge versions. No upgrades, new icon library, animation library, font package or runtime dependency is required. Use a small shared set of inline SVGs with accessible names/decorative hiding; no icon sprites loaded from third parties. No illustration asset is needed.

Set baseline route bundle sizes before C19.1. Proposed review budget: no more than 15KB additional compressed client JavaScript on a representative student route attributable to C19; any increase above this stops for review. This is a target to measure, not an existing result. Compare repeated same-environment mobile performance runs; investigate more than 10% median LCP regression, target CLS <= 0.1 and test interaction responsiveness on real controls. Lighthouse alone is not a field-performance claim.

Reserve dimensions for indicators, avoid layout-changing hover styles and route-wide hydration, and do not hide critical content until an animation completes. Preserve database query counts; no new N+1 reads, fetching private data for decoration, image-heavy hero or blanket layout animation.

## 11. Staged implementation and review gates

Only begin a stage after plan approval. Stop at each stage for review; keep the application deployable. Do not automatically commit/push without the owner's instruction.

| Stage | Scope | Review evidence and affected files |
|---|---|---|
| C19.1 | Tokens, typography, primitives, student shell/navigation | `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/*`, proposed `src/components/student-shell.tsx`, shell extraction from `public-events.tsx`. Reference component states, four-width navigation, focus/reduced-motion and unchanged guards. Keep legacy exports temporarily to avoid an all-page rewrite. |
| C19.2 | Home, Explore, shared event cards | `src/app/page.tsx`, `src/app/explore/page.tsx`, `explore-search.tsx`, `public-events.tsx`; shared metadata/empty-state components. Compare empty/populated/filtered/invalid-cursor states and unchanged GET requests. Shared card changes require For You/Saved smoke checks immediately. |
| C19.3 | Event Detail, For You, Saved | `src/app/events/[slug]/page.tsx` and not-found view, `for-you/page.tsx`, `saved/page.tsx`; `event-personalization.tsx`, `for-you.tsx`, `saved-events.tsx`, `save-control.tsx`, `calendar-actions.tsx`, detail presentation. Verify unchanged scores, unknown states, saves and calendar links. |
| C19.4 | Assistant, Notifications, Submissions | Corresponding page files plus `assistant-chat.tsx`, `assistant-facts.tsx`, `notifications.tsx`, `submission-form.tsx`, `submission-list.tsx`, `src/app/account/submissions/page.tsx`. Test actual hydrated components, no paid model calls; preserve all API payloads. |
| C19.5 | Account/profile/onboarding, auth visual consistency, then admin | `src/app/account/page.tsx`, profile/onboarding pages, `profile-editor.tsx`, `notification-preferences.tsx`, `auth-page.tsx`; admin page views, `event-editor.tsx`, `admin-submission-view.tsx`. Any JSX-only profile failure view adjustment in `src/lib/profiles/page.tsx` must leave its service/guard flow untouched. Verify independent saves and protected workflows. |
| C19.6 | Cross-route motion, responsive/accessibility/performance completion | Existing presentation files, documentation and UI tests only. Final before/after matrix, bundle comparison, contrast/keyboard/reduced-motion review and regression sign-off. No new functionality. |

Accessibility and responsive behavior are required in every stage; C19.6 is consolidation, not permission to defer them. Shell changes in C19.1 must smoke-test every route, not only the demonstration page.

## 12. Validation strategy

At every meaningful stage run `npm test`, `npm run db:types:check`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:bundle` and `npm run test:boundary`, plus existing UI suites for affected and shared dependent surfaces. Type replay is isolated/local; **never run hosted db push for C19**.

Maintain existing regression suites; run the complete existing local UI matrix at final review: public, search, profiles, recommendations, For You, saves, admin, calendar, notifications, submissions and assistant. Run existing performance checks where a changed surface could affect rendering/query boundaries. Hosted mutation suites are not a routine visual-test shortcut; any needed hosted smoke test requires explicit fixture scope and exact cleanup. Do not send actual emails or paid AI requests for visual verification.

Add C19 checks against actual React components and real local Next routes. Supplement copied-HTML tests rather than treating them as proof. Use isolated labeled fixtures for populated records absent from hosted inventory, and transport mocks only at existing API boundaries for deterministic pending/error responses. Never add production-only fixture routes or bypass auth in application code.

Required state matrix: anonymous/authenticated; empty/filtered-empty/unavailable/not-found; long/missing facts; eligible/ineligible/unknown; Best Matches/Worth Reviewing; saved/unsaved/pending/failure; calendar enabled/disabled; unread/read/hidden event; submitted/under review/accepted draft/published/rejected/withdrawn; profile partial/complete/save error; assistant initial/loading/error/facts/comparison. Cover admin authorized/denied and publication-state actions separately.

Use stable clocks/fonts/fixtures for screenshots. Record production revision, viewport and fixture provenance. Inspect every visual diff before accepting a snapshot; never regenerate snapshots simply to make tests green. Baseline images remain unchanged as historical evidence. Use new stage-specific after-images. A passing screenshot is not a substitute for keyboard, focus, reduced-motion and no-overflow assertions.

## 13. Explicit functional freeze and stop conditions

No schema, migrations, RLS, environment variables, event contracts, search semantics, eligibility predicates, recommendation weights/scores/ranking, notification jobs/preferences behavior, submission lifecycle, auth flow, AI tools/grounding, API payloads or ownership/security boundaries may change. Preserve date precision, nullable/unknown information, source attribution and safe external URLs. Do not upgrade dependencies or activate sources.

Permitted: CSS, presentation markup, semantic accessibility fixes, faithful copy corrections, component extraction and UI-only navigation/filter-panel state. Form names, methods, actions, return destinations, cursors, pending/success truth and server/client boundaries remain fixed.

Stop the affected proposal and document separately if it needs new data, a new endpoint/query, cross-route persisted feedback, live homepage inventory, new unread propagation, authentication repair, sorting, autosave, new editing workflow or model behavior. Do not silently expand C19 to resolve discovered product defects. Continue independent visual work only where the fixed contract is sufficient.

## 14. Completion definition

C19 is ready for final review when all requested student routes share the agreed visual language, admin is consistent without dominating the design, four-width actual-component evidence and interaction states are reviewed, accessibility/performance targets are checked, regression suites pass, and no frozen domain/service/schema changes have entered the diff. Baseline gaps are clearly labeled until tested; genuine hosted data is never fabricated.

C09–C11/C17 and Notifications 1.1 remain deferred. C20 and C21 remain unstarted. This document changes no functionality and authorizes no implementation, commit or push.
