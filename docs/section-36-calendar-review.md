# Calendar Export / Event Calendar Actions Review

23 September 2026. **Implemented — awaiting review.** Baseline: approved/pushed C18 commit `3ad0e3140bb2ab9174e784f54306dee083f4eeac`. Calendar milestone changes remain uncommitted and unstaged pending owner review. C19, notifications, reminders, AI assistant, and organizer submissions have not started. C09–C11 and C17 remain DEFERRED.

---

## 1. Objectives & Executive Summary

The Calendar Export milestone enables students to export published opportunities safely and accurately into their personal calendar systems without requiring Google OAuth or direct write access to external accounts:

1. **RFC 5545 `.ics` Export Route (`/events/[slug]/calendar.ics`)**:
   - Standards-compliant iCalendar format downloadable as an `.ics` attachment.
   - RLS-safe public route querying only published events via anonymous client.
   - Emits 404 for draft, in review, unpublished, archived, non-existent, or undated events.
2. **Google Calendar Prefilled Event Template**:
   - Web intent link to `https://calendar.google.com/calendar/render?action=TEMPLATE` constructed safely using standard `URL` and `URLSearchParams`.
   - Never accesses private user calendars; strictly user-initiated.
3. **Factual Integrity & Zero Fabricated Data**:
   - Date-only events use exclusive DTEND (`+1` day).
   - Datetime events with known `start_at` and unknown `end_at` emit `DTSTART` without `DTEND`/`DURATION` in `.ics`, and safely disable the Google Calendar CTA with the clear neutral notice: *"Event end time is not specified."*.
   - Never assumes start times, never sets arbitrary 1-hour durations, never converts unknown times to midnight.
4. **Deterministic and Host-Independent UID**:
   - Formatted as `event-${event.id}@student-opportunities` using the immutable event UUID.
   - Preserves stability across downloads, deployment previews, hosting providers, and future domain changes.
5. **Saved Page Cards Integration**:
   - Reuses existing `PublicEventCard` fields with zero N+1 database queries.
6. **Zero Schema Migrations**:
   - Exactly zero database migrations introduced (total migration count remains 9).

---

## 2. Technical Implementation Details

### RFC 5545 VCALENDAR / VEVENT Generator (`src/lib/events/calendar.ts`)
- **UTF-8 Octet-Aware Line Folding**: Implemented `foldIcsLine` which measures UTF-8 octet length (using `TextEncoder` and unicode code-point boundary traversal) rather than JavaScript string length. Folds lines exceeding 75 octets with CRLF followed by a single space (`\r\n `), without slicing multi-byte characters (e.g., Devanagari script or emojis).
- **Text Escaping**: Implemented `escapeIcsText` escaping backslashes (`\\`), semicolons (`\;`), commas (`\,`), and newlines (`\n`).
- **Filename Sanitization**: Implemented `sanitizeIcsFilename` stripping hostile characters, path traversal, control codes, and non-alphanumeric/hyphen symbols. Falls back to `event.ics` if the slug is empty or entirely sanitized away.
- **Base Origin Sanitization**: Implemented `sanitizeBaseOrigin` enforcing valid `http:`/`https:` protocols, disallowing non-http schemes (`javascript:`, `file:`, `data:`), and stripping paths, queries, and credentials to prevent injection in canonical URLs.
- **Location Formatting**: Formats locations factually:
  - Online events: `Online`
  - In-person: `Venue, City, State, Country`
  - Hybrid: `Venue, City, State, Country (Hybrid - in-person and online participation)`
- **Event Status Handling**:
  - Cancelled events: Emits `STATUS:CANCELLED` in `.ics`. Disables primary Google Calendar CTA, offering a neutral cancellation notice and downloadable cancellation notice `.ics`.
  - Completed events: Emits `STATUS:CONFIRMED` in `.ics`. Disables primary Google Calendar CTA, presenting the notice *"This event has completed."* and an `.ics` archive download.

### Route Handler (`src/app/events/[slug]/calendar.ics/route.ts`)
- Uses anonymous public client `createClient()` with server-only environment configuration.
- Queries `events` table by slug and `publication_status = 'published'`, including categories, organizers, and active deadlines.
- If the event is missing, not published, or lacks usable calendar dates, returns HTTP 404 with plain-text explanation.
- Returns HTTP 200 with headers:
  - `Content-Type: text/calendar; charset=utf-8`
  - `Content-Disposition: attachment; filename="${filename}"`
  - `Cache-Control: public, max-age=300, stale-while-revalidate=600`
  - `X-Content-Type-Options: nosniff`

### User Interface Components (`src/components/calendar-actions.tsx`)
- **`EventCalendarSection`**:
  - Rendered in Event Detail sidebar (`src/components/public-events.tsx`) inside the registration aside.
  - Presents clear accessible buttons and links (not icon-only).
  - Prominent "Add to Google Calendar" button opening in a new tab (`target="_blank"`, `rel="noopener noreferrer"`, with `.sr-only` description).
  - Clear "Download .ics" button with `download` attribute.
  - Informative disclaimer: *"Export reflects event facts at download time. Calendar events do not automatically sync."*
- **`EventCardCalendarActions`**:
  - Integrated into `EventCard` on the Saved page (`/saved`) when `showCalendarActions={true}`.
  - Derived strictly from already-fetched card DTO facts with zero database queries.

---

## 3. Verification & Validation Summary

### 1. Unit & Compliance Test Suite (`tests/calendar/calendar.test.mjs`)
- **Command**: `npm run test:calendar`
- **Result**: 19 test suites/cases covering 30 requirements — **100% PASS**.
  - Published event exports RFC 5545 ICS: PASS.
  - Draft, review, unpublished, archived, missing events return 404: PASS.
  - Date-only single-day and multi-day exclusive `+1` day DTEND: PASS.
  - Datetime UTC instant formatting: PASS.
  - Datetime event without end time: ICS emits DTSTART without DTEND; Google Calendar CTA disabled with neutral notice: PASS.
  - Canonical timezone preserved; missing timezone not fabricated: PASS.
  - Missing date disables both ICS and Google Calendar exports: PASS.
  - Deterministic UID based on event UUID, independent of APP_URL and deployment hosts: PASS.
  - RFC 5545 text escaping and 75-octet unicode line folding: PASS.
  - Safe filename sanitization with hostile slug fallbacks: PASS.
  - HTTP headers, content disposition, and absence of private data: PASS.
  - Cancelled event emits `STATUS:CANCELLED`: PASS.
  - Completed event disables Google Calendar link while keeping ICS archive: PASS.
  - Google Calendar URL encoding, URLSearchParams safety, and hostile origin rejection: PASS.
  - Zero N+1 queries on Saved cards: PASS.

### 2. Browser UI & Accessibility Test Suite (`scripts/test-calendar-ui.mjs`)
- **Command**: `npm run test:calendar:ui`
- **Result**: **100% PASS** across all four required viewports (320px, 390px, 768px, 1280px).
  - Zero horizontal overflow (`document.documentElement.scrollWidth <= innerWidth`): PASS.
  - Heading hierarchy: `h3` "Add to calendar" semantic markup: PASS.
  - Google Calendar links have `target="_blank"`, `rel="noopener noreferrer"`, and screen reader labels: PASS.
  - ICS download links have explicit `download` attribute: PASS.
  - Start-only datetime notice visible: PASS.
  - Undated event disabled notice visible: PASS.
  - Cancelled and completed event notices and secondary actions visible: PASS.
  - Saved cards integration visible and responsive: PASS.
  - Keyboard focus and Tab navigation: PASS.
  - Visual regression screenshots captured in `scratch/after_calendar/`: PASS.

### 3. Hosted Read-Only Verification (`scripts/verify-calendar-hosted.mjs`)
- **Command**: `npm run test:calendar:hosted`
- **Result**: **100% PASS**.
  - Genuine hosted event inventory confirmed empty (zero event fixtures created): PASS.
  - Exactly 9 existing database migrations confirmed (zero new migrations introduced): PASS.
  - Anonymous probe for non-existent event returns null (route returns 404): PASS.
  - Anonymous client cannot read unpublished events: PASS.
  - Anonymous write to events table strictly rejected by RLS: PASS.
  - Hosted database inventory verified completely unchanged: PASS.

---

## 4. Deliverables & Changed Files

- `src/lib/events/calendar.ts`: Calendar generator, validation, line-folding, and URL builders.
- `src/app/events/[slug]/calendar.ics/route.ts`: RLS-safe public .ics download route.
- `src/components/calendar-actions.tsx`: Detail and card calendar action components.
- `src/components/public-events.tsx`: Added `EventCalendarSection` to Event Detail; added `showCalendarActions` prop to `EventCard`.
- `src/components/saved-events.tsx`: Enabled `showCalendarActions={true}` on Saved page cards.
- `package.json`: Added `test:calendar`, `test:calendar:ui`, and `test:calendar:hosted` scripts, and integrated calendar test into `npm test`.
- `tests/calendar/calendar.test.mjs`: Node test suite covering 30 requirements.
- `scripts/test-calendar-ui.mjs`: Playwright browser UI test suite across 320/390/768/1280px.
- `scripts/verify-calendar-hosted.mjs`: Hosted read-only verification suite.
- `docs/section-36-calendar-review.md`: This review document.
