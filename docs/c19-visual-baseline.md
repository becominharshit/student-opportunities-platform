# C19 visual baseline

Captured 24 September 2026 from main at dcf2def036bf0df279f7f0c4a366c99d940334db. This is a record of the existing application, not a redesign proposal or implementation.

## Method and scope

- Fresh production build passed; actual Next.js application ran locally at http://localhost:3000. Chromium captured full-page screenshots with a 900px viewport height, device scale 1, at 390, 768 and 1280px, plus 320px on every requested route.
- 56 live route screenshots, four local event-detail component screenshots and four interaction-state screenshots: **64 PNGs** total in c19-baseline/.
- Protected routes used one owner-authorized temporary confirmed account. Admin membership was granted only for the admin captures. No personal account or private profile data was used.
- Hosted published-event inventory was empty. The real event route therefore shows the not-found state. The separate event-detail-fixture images use the existing actual EventDetailContent component, current production CSS and isolated in-memory test data. They explicitly display a synthetic-data banner. Next Link is adapted to native anchors by the existing test harness; this is not a hydrated hosted event journey. The fixture's literal script-like description is existing security-test text rendered harmlessly as text, not a real event description.
- The synthetic detail does not include a personalized eligibility result. Populated recommendations, saved lists, notification items, submission statuses, admin tables and assistant responses were not fabricated in the live app.
- No source connector, email delivery, paid AI request, event submission, profile save, notification mutation or hosted migration was invoked. Opening filters, hovering and focusing controls did not submit forms.
- No application code, dependencies, design configuration or product behavior changed. Capture helpers and raw measurements are ignored under work/c19/. Build outputs are ignored.

## Screenshot index

Full-page images can look very small in a thumbnail; open the image at its native width to assess text and controls.

| Route/state | Mobile | Tablet | Desktop | Narrow mobile |
|---|---|---|---|---|
| / | [390px](c19-baseline/home-390.png) | [768px](c19-baseline/home-768.png) | [1280px](c19-baseline/home-1280.png) | [320px](c19-baseline/home-320.png) |
| /explore | [390px](c19-baseline/explore-390.png) | [768px](c19-baseline/explore-768.png) | [1280px](c19-baseline/explore-1280.png) | [320px](c19-baseline/explore-320.png) |
| /events/[slug] (live not-found) | [390px](c19-baseline/event-detail-390.png) | [768px](c19-baseline/event-detail-768.png) | [1280px](c19-baseline/event-detail-1280.png) | [320px](c19-baseline/event-detail-320.png) |
| Event detail (local synthetic component) | [390px](c19-baseline/event-detail-fixture-390.png) | [768px](c19-baseline/event-detail-fixture-768.png) | [1280px](c19-baseline/event-detail-fixture-1280.png) | [320px](c19-baseline/event-detail-fixture-320.png) |
| /for-you | [390px](c19-baseline/for-you-390.png) | [768px](c19-baseline/for-you-768.png) | [1280px](c19-baseline/for-you-1280.png) | [320px](c19-baseline/for-you-320.png) |
| /saved | [390px](c19-baseline/saved-390.png) | [768px](c19-baseline/saved-768.png) | [1280px](c19-baseline/saved-1280.png) | [320px](c19-baseline/saved-320.png) |
| /notifications | [390px](c19-baseline/notifications-390.png) | [768px](c19-baseline/notifications-768.png) | [1280px](c19-baseline/notifications-1280.png) | [320px](c19-baseline/notifications-320.png) |
| /assistant | [390px](c19-baseline/assistant-390.png) | [768px](c19-baseline/assistant-768.png) | [1280px](c19-baseline/assistant-1280.png) | [320px](c19-baseline/assistant-320.png) |
| /submit-event | [390px](c19-baseline/submit-event-390.png) | [768px](c19-baseline/submit-event-768.png) | [1280px](c19-baseline/submit-event-1280.png) | [320px](c19-baseline/submit-event-320.png) |
| /account | [390px](c19-baseline/account-390.png) | [768px](c19-baseline/account-768.png) | [1280px](c19-baseline/account-1280.png) | [320px](c19-baseline/account-320.png) |
| /account/profile | [390px](c19-baseline/profile-390.png) | [768px](c19-baseline/profile-768.png) | [1280px](c19-baseline/profile-1280.png) | [320px](c19-baseline/profile-320.png) |
| /account/submissions | [390px](c19-baseline/submissions-390.png) | [768px](c19-baseline/submissions-768.png) | [1280px](c19-baseline/submissions-1280.png) | [320px](c19-baseline/submissions-320.png) |
| /onboarding | [390px](c19-baseline/onboarding-390.png) | [768px](c19-baseline/onboarding-768.png) | [1280px](c19-baseline/onboarding-1280.png) | [320px](c19-baseline/onboarding-320.png) |
| /admin | [390px](c19-baseline/admin-390.png) | [768px](c19-baseline/admin-768.png) | [1280px](c19-baseline/admin-1280.png) | [320px](c19-baseline/admin-320.png) |
| /admin/submissions | [390px](c19-baseline/admin-submissions-390.png) | [768px](c19-baseline/admin-submissions-768.png) | [1280px](c19-baseline/admin-submissions-1280.png) | [320px](c19-baseline/admin-submissions-320.png) |

Additional states:

- [Expanded Explore filters, authenticated, 390px](c19-baseline/explore-filters-390.png)
- [Assistant input focused, 390px](c19-baseline/assistant-focus-390.png)
- [Submission primary button hovered, 1280px](c19-baseline/submit-hover-1280.png)
- [Keyboard skip link focused, 1280px](c19-baseline/skip-focus-1280.png)

## Overall appearance

The application looks like a functional engineering beta: restrained green and off-white styling, straightforward text links, mostly native controls, little ornament and strong factual caveats. It is readable but does not yet feel like one cohesive student product. Sparse empty catalogue screens coexist with very long forms and dense explanatory prose. No invented catalogue content was added to make the baseline look fuller.

### Layout and navigation

Discovery pages share a broad centered container, horizontal header and disclaimer footer. At 1280px the container is 1152px including gutters; account uses a 448px container and profile/onboarding use 768px. The abrupt width changes are visible when moving between routes.

Authenticated discovery navigation is **153px tall at 320/390px**, versus **65px at 768/1280px**. The brand occupies one line, with links wrapping onto two further rows. There is no selected-route highlight. Guest navigation on Explore is 65px at 390px and 105px at 320px. Account/profile use separate navigation patterns; account actions appear near the bottom of a long page. The footer follows content rather than anchoring to the viewport bottom, leaving substantial blank space beneath short pages.

### Typography and spacing

Arial/Helvetica is used throughout. Explore, For You and Saved use 36px headings; newer discovery pages use 30px headings on mobile and 36px at larger widths. Profile/account use 30px. Admin uses heavier weights. Ordinary prose is generally 16px, while forms/helper text range from 12–14px. Assistant disclosure and starter pills are particularly small.

The common discovery main area starts 40px below the header on mobile and 64px on larger screens. Large spaces separate empty states and footers; profile and submission forms accumulate long vertical runs. Consistent individual Tailwind values do not yet produce consistent page rhythm.

### Cards, buttons and inputs

The local detail uses flat ruled sections and a muted registration panel. For You has a square bordered completion notice; Notifications uses a rounded centered empty-state card; Submissions uses a dashed panel. Admin uses white rounded metric tiles and shaded filter panels. These are noticeably different visual languages.

Green filled actions, outline actions and underlined links coexist. Shared buttons are 40px high (36px small), search/save controls commonly target at least 44px, and admin controls are more compact. Native checkboxes remain blue in account preferences despite the green brand. Submission fields and the assistant textarea have visibly darker outlines than Explore/profile controls; source inspection confirms missing semantic input/card/destructive token definitions.

### Badges, tabs and filters

The live empty accounts have no unread or submission-status badges to inspect. Their populated appearance remains an explicit baseline gap. The local detail shows trust status as bold text and a bordered topic chip. Admin metrics use multiple saturated status colors, while queue filters use blue selected pills and gray unselected pills. At 390px queue filters wrap cleanly into two rows. Explore uses a native disclosure rather than tabs: its expanded 16-field filter/sort section is a long single column on mobile.

## Student route observations

| Route | Observed layout, hierarchy and perceived quality |
|---|---|
| / | Narrow centered text block, small brand, large coming-soon heading and three equally styled links. Most of the desktop viewport is blank. The holding-page copy visually contradicts the completed application. |
| /explore | Clear heading and search action; disclosure keeps initial form manageable. Current search, result count and empty message repeat catalogue context across widely separated sections. Expanded filters produce a 2818px full-page capture at 390px. No result cards were present in the live catalogue. |
| /events/[slug] | Live route truthfully shows not-found. In the local actual-component fixture, title/trust/save lead into a registration panel, followed by details, eligibility, timeline, tags and sources. Desktop uses a right registration column; mobile brings that panel before detailed facts. Strong action grouping, but long repeated unknown-fact rows and caveats create a document-like page. |
| /for-you | Completion notice is the strongest block after the title. Long explanatory copy precedes the empty catalogue message. At 390px the page is 1096px tall despite having no recommendations. Profile completion, eligibility and evidence coverage remain separate textual concepts. |
| /saved | Plain empty-state heading with widely separated navigation. Much of the tablet/desktop viewport is unused. Duplicate navigation at header and bottom is prominent in the absence of cards. |
| /notifications | Rounded centered empty-state panel and a clear green Explore action. This feels more intentionally composed than Saved, but uses a different empty-state treatment. Generous vertical gaps surround the panel. |
| /assistant | Heading, technical privacy disclosure, large 380px-minimum conversation panel, starter pills and composer. At 390px the composer begins below the first 900px viewport. Desktop has a wide, mostly blank chat panel; the short Send button does not visually fill the textarea height. No message was sent. |
| /submit-event | Clear labels and fieldsets; very long single-page form. Desktop retains a narrow left-aligned form within a wider shell, leaving substantial space on the right. Mobile controls stack cleanly. Dark input edges and shadows differ from Explore. No validation or submission was triggered. |
| /account | Extremely narrow desktop column, long sequence of unknown profile facts, then notification preferences and account navigation. Preferences/actions are far below the heading. Native blue checkboxes and mixed button/link treatments stand out. |
| /account/profile | Separate small text navigation; heading, prose, completion box and section links precede six independent forms. Interest/skill checkbox lists dominate mobile length. Corrupted study-year characters are visible; stale copy says recommendations are unavailable. |
| /account/submissions | Eyebrow label, large heading, return link and submit action, followed by dashed empty-state panel containing a second submit action. The repeated CTA is conspicuous. Desktop/tablet are sparse. |
| /onboarding | Same long editor as profile with a different heading. Completion is presented as a text list, and section navigation wraps. It reads as a long form rather than a visually staged onboarding experience. Optional/unknown semantics remain explicit. |

## Admin observations — secondary priority

/admin has a heavier blue/gray style, seven colored metric tiles, a filter panel, an empty catalogue message, disabled pagination and an empty audit panel. At 320px header actions remain on one row by wrapping text inside buttons: Create Event breaks across several lines and becomes much taller than Account. Metric tiles stack into two columns. It fits the viewport but is visually cramped.

/admin/submissions has blue filter pills, a dashboard return action and a white empty queue panel. The 390px layout wraps filters successfully and leaves extensive blank space beneath the empty state. No populated moderation records were created or inspected. These screens should not determine the student-facing visual direction.

## Responsive measurements

All **56 live route/viewport combinations** had document scrollWidth equal to viewport width. The four local detail fixture renders also had no horizontal overflow. This is evidence for the captured states only, not proof for long real titles, populated tables, mobile keyboards, enlarged text or future content.

| Page | Height at 390px | Height at 1280px |
|---|---:|---:|
| Explore, collapsed filters | 1074px | 938px |
| For You, empty | 1096px | 900px |
| Assistant, initial | 1202px | 956px |
| Submit event | 2667px | 2265px |
| Account | 2154px | 2138px |
| Profile | 5135px | 4003px |
| Onboarding | 5171px | 4003px |
| Admin | 1395px | 900px |
| Local synthetic event detail | 2954px | 1895px |

At 320px profile and onboarding both reach 5447px. Their main issue is length and orientation, not horizontal overflow. Screens with heights reported as 900px may contain much less content because 900px is the viewport minimum.

## Interaction and accessibility appearance

- Keyboard Tab revealed a visible green-outlined skip link. Its focused box overlaps the brand at the top left; captured explicitly.
- Assistant textarea focus adds a visible green border/ring. It still relies on placeholder text rather than an explicit visible label, confirmed in source.
- Submission button hover was captured without clicking; its treatment is a subtle opacity change. Other button/link hover treatments are inconsistent across components.
- Native disclosure arrow clearly communicates collapsed/expanded Explore filters; the full expanded state is captured.
- Disabled assistant Send and admin pagination are visually muted. No response loading animation, error state, status transition or reduced-motion behavior was exercised.
- No screen-reader, zoom, touch-device, contrast-conformance or full interaction sign-off is claimed. Prior source audit findings such as nested link/button markup and missing admin skip targets remain relevant.

## Inconsistencies recorded for later C19 decisions

1. Holding-page home versus functional discovery application.
2. Three student navigation/layout families plus separate admin styling.
3. Different content widths, heading scales and empty-state treatments.
4. Flat event sections versus rounded, dashed and shaded cards elsewhere.
5. Different control heights, borders, focus treatments and native checkbox color.
6. Dense engineering terminology in student-facing explanations.
7. Very long profile/onboarding/account screens versus sparse desktop empty states.
8. Missing semantic tokens, partial dark-mode classes and no consistent motion policy.

These are baseline observations, not authorization to change contracts, calculations, authentication, workflows or data semantics.

## Cleanup and completion

The exact temporary admin membership and Auth account were deleted. Account absence was checked through Auth; before/after counts matched for events, source_connectors, profiles, admin_memberships, event_submissions and notifications. No hosted event was created. No keys, passwords, tokens, login URLs or account identifiers are included in this report or screenshots.

Production build passed. This task did not rerun the full regression suite because it changes only baseline documentation/images. C19 design and implementation, C20 and C21 have not started. C09–C11/C17 and Notifications 1.1 remain deferred. No commit or push was performed.
