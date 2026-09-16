# First connector decision and C08/C09 handoff

Reviewed 16 September 2026. Recommendation: **FOSS United, restricted to first-party chapter events**. Status: **CONDITIONALLY APPROVED; activation blocked until conditions below close**. No production connector is implemented or enabled. This does not authorize C08 to begin automatically.

## Why this source

FOSS United combines India relevance, direct organizer provenance, an explicitly documented anonymous ICS feed, record UIDs and event dates. This is stronger than using a large catalogue with unclear rights or undocumented endpoints. Its [feed documentation](https://docs.fossunited.org/rss/), [content terms](https://fossunited.org/terms-of-service), and [public generator implementation](https://github.com/fossunited/fossunited/blob/develop/fossunited/api/chapter.py) provide reviewable evidence.

confs.tech is the fallback: its [MIT-licensed repository](https://github.com/tech-conferences/conference-data/blob/main/LICENSE.md) is easier to reuse, but the sampled JSON has no explicit event ID, attendee registration URL or eligibility. Repository identity needs durable reconciliation. [GitHub Contents API](https://docs.github.com/en/rest/repos/contents) and [limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) apply. Its multiple topics do not count as separate sources.

## Conditions before live activation

1. Source owner/reviewer records the approved scope, policy hashes, exact crawler identity and paths, allowed fields, review expiry, and retention policy. Obtain FOSS United clarification that the proposed independent factual cards and chapter content reuse are covered despite the terms' inline-embedding restriction; do not frame pages or hotlink media. Confirm chapter submissions are within that permission. No correspondence has been sent.
2. Implement and review source attribution, licence link, adaptation notice and applicable ShareAlike handling before publishing licensed excerpts. Existing C06 public source metadata alone does not supply this presentation. A source content licence does not require declaring the entire application open source; scope of adapted content still needs review.
3. Exclude grant records and other third-party events. Require approved first-party provenance as well as an exact fossunited.org /c/ path; a host match alone is insufficient. Exclude logos/images, personal contact data and embedded assets.
4. Validate an event's registration link and required canonical publication fields from authorized organizer evidence. The ICS alone does not satisfy the publication gate. Unknown fields cannot be filled with fabricated values.
5. Revalidate robots/terms before activation, then record scheduled reliability separately. This one-time research fetch does not establish three scheduled cycles or seven-day freshness. Neither the first-source activation gate nor the release gate is closed by this document.

## Exact proposed interface

- Method: GET, no credentials, no request body.
- URL: https://fossunited.org/api/method/fossunited.api.chapter.upcoming_events_ics
- Accept: text/calendar. Proposed production UA: StudentOpportunitiesPlatform/0.1, with a real project contact added before deployment. Research UA was StudentOpportunitiesQualification/0.1.
- Authentication: guest feed, explicitly documented. This authorization does not extend to other Frappe methods.
- Response observed: HTTP 200, text/calendar, 13,476 bytes, 16 September 2026 11:12:42 UTC. Exact SHA-256 and headers: [observations](evidence-observations.json). No HTTP ETag/Last-Modified was observed.
- Pagination: none; complete upcoming snapshot. Parse VEVENTs locally, use source-name plus UID as external identity. Never use the date in the identity. Quarantine missing or conflicting UIDs.
- Discovery/active refresh: daily; six-hour refresh when a known registration deadline is within seven days. The feed advertises hourly refresh, which is not a requirement to poll hourly. Upstream implementation declares 60 requests/hour; observed rate header has a different scale and must not be interpreted as a request allowance.
- Proposed conservative budget: concurrency one; at least 10 seconds between source requests; maximum six requests/run and 24/day including enrichment/retries. These are application budgets, not provider promises. Defer excess work. Honor lower provider limits and Retry-After.
- Later fetcher limits: 20-second timeout, 2 MiB decompressed body ceiling, at most three transient retries inside budget; no retry of access denial/permission failure. Validate content type and calendar shape. Reject off-allowlist redirects and private/local network addresses. Do not execute descriptions or follow embedded URLs automatically.
- Enrichment, if separately approved: only exact reviewed chapter event pages linked in the feed. Read an explicit registration anchor; do not construct a ticket URL from UID, scrape a dashboard, log in or purchase tickets. Additional paths require a recorded permission decision.
- Keep private raw evidence only under the planning package's approved retention/access rules. Proposed initial retention: 30 days, subject to source agreement; retain permitted factual provenance and hashes longer. This proposal is not a new database policy or implemented job.

## Field mapping and quality

| Upstream | Proposed meaning | Restriction |
|---|---|---|
| UID | Source external ID | Observed generator uses database record name; verify stability across changes |
| SUMMARY | Title | Untrusted text; sanitize; no invented title |
| DESCRIPTION | Input to factual summary | Licence/provenance review; sanitize, do not mirror full prose by default |
| CATEGORIES | Category hint | Explicit mapping to approved MVP taxonomy; unsupported type held for review |
| DTSTART / DTEND | Source event start/end | Preserve precision and original value; UTC instants observed, not proof that all future values include real times |
| LAST-MODIFIED | Upstream change hint | Not our checked_at, not definitive chronology; see timezone caveat |
| LOCATION | Venue/location evidence | Can combine address and map URL; do not blindly geocode or follow links |
| ORGANIZER CN | Chapter label | Not verified legal organizer; observed mailto value can be a label rather than an email |
| URL | Official source page candidate | Not automatically registration URL; allowlist and ownership checks |
| Fetch time/hash | Observation provenance | Source check time is our actual successful fetch time |

No dedicated fields were established for registration URL, registration deadline, fee, prize, team size, student eligibility, prerequisites or verification. Preserve null/unknown; never use zero, false, empty arrays or midnight as placeholders. A workshop page can supply a ticket link, but that cannot be generalized to every record. An event's start is not its registration deadline. Restrictive maintainer-only prose must not become “open to all students.”

The inspected upstream code applies its configured system timezone (fallback Asia/Kolkata) to naive start/end values. This is implementation evidence, not proof of deployed settings or organizer accuracy. It labels naive modified values UTC directly; treat LAST-MODIFIED cautiously. Feed removal can mean an event started: chapter records are selected with start >= now, while grant records use end >= now. Neither absence nor an empty snapshot means cancellation. Do not infer registration status from those filters.

The RSS feed is documented but is not the proposed primary interface. A sampled local 17:00 event appears as 17:00 -0000 in RSS pubDate and 11:30Z in ICS. Do not use RSS pubDate as an event timestamp or authoritative updated time. A sampled grant record has identical midnight-derived start/end; excluding grants reduces, but does not eliminate, unknown-time risks.

## Real sample and future fixtures

[Observed sample](observed-sample.json) is a minimal factual projection, not a fabricated event or a full feed fixture. It must never be seeded as production data. The official workshop page independently showed 25 September, 10:00–17:00 and a ticket anchor; the feed contains UTC instants. No purchase or account action was performed.

Prepare these **labelled synthetic** fixture variants in C08/C09; none have been implemented or run here:

| Case | Expected result |
|---|---|
| Real sample projection + original permitted ICS bytes | Stable source UID and provenance; no automatic publication |
| Folded lines, escaped commas/newlines, Unicode, CRLF, reordered fields | Correct ICS parsing, no lossy string splitting |
| Same UID, changed date/title/location; unchanged replay | Versioned update; idempotent no-op on identical normalized content |
| Missing UID, duplicate UID conflicting bodies | Quarantine/review; do not silently overwrite |
| UTC, TZID with DST, date-only, floating time, missing end | Preserve precision; require timezone evidence; do not fabricate midnight/end |
| Equal start/end, end before start, ambiguous LAST-MODIFIED | Flag invalid/ambiguous facts; don't discard other valid events |
| Grant/external-host URL, spoofed chapter, unsupported event type | Exclude or quarantine before canonical publication |
| Event disappears or feed becomes empty | Mark source observation/staleness; never cancel/delete solely for absence |
| No registration URL; ticket link differs from official page | Hold publication until canonical requirements satisfied |
| Missing fee/eligibility; explicit zero fee or restrictive eligibility | Unknown distinct from known free; keep restrictions |
| HTML/script description, malformed organizer mailto, malicious URLs | Sanitize; no script execution or contact-data harvesting |
| Redirect to private IP/unapproved host, compressed oversized feed | Block with redacted classified error |
| 401/403/CAPTCHA, 429 Retry-After, 5xx, timeout | Pause permission failures; bounded compliant retry/defer |
| Changed/expired policy, narrower robots rule, expired permission | Disable collection before network request |
| Mixed valid/malformed VEVENT; truncated or non-calendar response | Isolate item failure where safe; do not interpret error page as empty feed |
| License/attribution missing; raw source data read anonymously | Publication blocked; ingestion diagnostics remain private |

No C08/C09 runtime tests or connector reliability claim is made by this fixture plan.
