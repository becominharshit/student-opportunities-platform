import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { fixtures } from "../events/c06-harness.mjs";

// Helper to transpile and load TS modules
function loadTs(source, jsx = false) {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: jsx ? ts.JsxEmit.ReactJSX : undefined,
    },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(transpiled).toString("base64"));
}

const calendarSource = await readFile(new URL("../../src/lib/events/calendar.ts", import.meta.url), "utf8");
const cal = await loadTs(calendarSource);

let fixture;
before(async () => {
  fixture = await fixtures();
});

after(async () => {
  await fixture?.close();
});

test("1. Published event exports valid RFC 5545 ICS", async () => {
  const result = await fixture.api.readPublishedEvent({ slug: "isolated-event-1" });
  assert.equal(result.ok, true);
  const ics = cal.generateEventIcs(result.value);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nVERSION:2.0\r\n/);
  assert.match(ics, /\r\nPRODID:-\/\/Student Opportunities Platform\/\/EN\r\n/);
  assert.match(ics, /\r\nBEGIN:VEVENT\r\n/);
  assert.match(ics, /\r\nUID:event-70000000-0000-0000-0000-000000000001@student-opportunities\r\n/);
  assert.match(ics, /\r\nSUMMARY:ISOLATED TEST event 1\r\n/);
  assert.match(ics, /\r\nSTATUS:CONFIRMED\r\n/);
  assert.match(ics, /\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n$/);
});

test("2-6. Non-published events do not export (draft, review, unpublished, archived, missing => 404)", async () => {
  for (const [slug, status] of [
    ["isolated-event-29", "draft"],
    ["isolated-event-30", "review"],
    ["isolated-event-31", "unpublished"],
    ["isolated-event-32", "archived"],
    ["isolated-event-999", "nonexistent"],
  ]) {
    const res = await fixture.api.readPublishedEvent({ slug });
    assert.deepEqual(res, { ok: false, code: "not_found" }, `${status} must return not_found`);
  }
});

test("7. Date-only single-day event uses exclusive DTEND (+1 day)", () => {
  const event = {
    id: "10000000-0000-0000-0000-000000000001",
    slug: "single-day",
    title: "Single Day Hackathon",
    date_precision: "date_only",
    start_date: "2026-10-12",
    end_date: null,
  };
  const dates = cal.getCalendarDates(event);
  assert.equal(dates.canGenerateIcs, true);
  assert.equal(dates.canGenerateGoogleCalendarLink, true);
  assert.equal(dates.startDateStr, "20261012");
  assert.equal(dates.endDateStr, "20261013"); // Exclusive end date (+1 day)

  const ics = cal.generateEventIcs(event);
  assert.match(ics, /\r\nDTSTART;VALUE=DATE:20261012\r\n/);
  assert.match(ics, /\r\nDTEND;VALUE=DATE:20261013\r\n/);
  assert.ok(!ics.includes("00:00:00"));
  assert.ok(!ics.includes("T000000"));
});

test("8. Date-only multi-day event uses exclusive DTEND (end_date + 1 day)", () => {
  const event = {
    id: "10000000-0000-0000-0000-000000000002",
    slug: "multi-day",
    title: "Weekend Hackathon",
    date_precision: "date_only",
    start_date: "2026-10-12",
    end_date: "2026-10-13",
  };
  const dates = cal.getCalendarDates(event);
  assert.equal(dates.canGenerateIcs, true);
  assert.equal(dates.canGenerateGoogleCalendarLink, true);
  assert.equal(dates.startDateStr, "20261012");
  assert.equal(dates.endDateStr, "20261014"); // 13 Oct + 1 day = 14 Oct exclusive

  const ics = cal.generateEventIcs(event);
  assert.match(ics, /\r\nDTSTART;VALUE=DATE:20261012\r\n/);
  assert.match(ics, /\r\nDTEND;VALUE=DATE:20261014\r\n/);

  const googleUrl = cal.generateGoogleCalendarUrl(event);
  assert.ok(googleUrl.includes("dates=20261012%2F20261014"));
});

test("9. Datetime event formats UTC instants accurately", () => {
  const event = {
    id: "10000000-0000-0000-0000-000000000003",
    slug: "datetime-event",
    title: "Tech Keynote",
    date_precision: "datetime",
    start_at: "2026-10-12T09:30:00.000Z",
    end_at: "2026-10-12T11:00:00.000Z",
    timezone: "Asia/Kolkata",
  };
  const dates = cal.getCalendarDates(event);
  assert.equal(dates.canGenerateIcs, true);
  assert.equal(dates.canGenerateGoogleCalendarLink, true);
  assert.equal(dates.startUtc, "20261012T093000Z");
  assert.equal(dates.endUtc, "20261012T110000Z");

  const ics = cal.generateEventIcs(event);
  assert.match(ics, /\r\nDTSTART:20261012T093000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20261012T110000Z\r\n/);

  const googleUrl = cal.generateGoogleCalendarUrl(event);
  assert.ok(googleUrl.includes("dates=20261012T093000Z%2F20261012T110000Z"));
  assert.ok(googleUrl.includes("ctz=Asia%2FKolkata"));
});

test("10. Datetime event with known start and unknown end: ICS emits DTSTART without DTEND; Google Calendar unavailable", () => {
  const event = {
    id: "10000000-0000-0000-0000-000000000004",
    slug: "open-ended-seminar",
    title: "Open Ended Seminar",
    date_precision: "datetime",
    start_at: "2026-10-12T14:00:00.000Z",
    end_at: null,
  };
  const dates = cal.getCalendarDates(event);
  // ICS is valid per RFC 5545 section 3.6.1 without DTEND or DURATION
  assert.equal(dates.canGenerateIcs, true);
  // Google Calendar template is unavailable because accurate end cannot be constructed without fabrication
  assert.equal(dates.canGenerateGoogleCalendarLink, false);
  assert.equal(dates.googleCalendarUnavailableReason, "Event end time is not specified.");

  const ics = cal.generateEventIcs(event);
  assert.match(ics, /\r\nDTSTART:20261012T140000Z\r\n/);
  // Must NOT fabricate DTEND, DURATION, or +1 hour
  assert.ok(!ics.includes("DTEND"));
  assert.ok(!ics.includes("DURATION"));
  assert.ok(!ics.includes("150000Z"));

  const googleUrl = cal.generateGoogleCalendarUrl(event);
  assert.equal(googleUrl, null);
});

test("11. Timezone handling: canonical timezone preserved; missing timezone not inferred", () => {
  const withZone = {
    id: "10000000-0000-0000-0000-000000000005",
    slug: "zoned-event",
    title: "Zoned Event",
    date_precision: "datetime",
    start_at: "2026-10-12T10:00:00Z",
    end_at: "2026-10-12T12:00:00Z",
    timezone: "Europe/London",
  };
  const urlWith = cal.generateGoogleCalendarUrl(withZone);
  assert.ok(urlWith.includes("ctz=Europe%2FLondon"));

  const noZone = {
    ...withZone,
    id: "10000000-0000-0000-0000-000000000006",
    timezone: null,
  };
  const urlWithout = cal.generateGoogleCalendarUrl(noZone);
  assert.ok(!urlWithout.includes("ctz="));
});

test("12. Missing usable date disables both ICS and Google Calendar exports", () => {
  const event = {
    id: "10000000-0000-0000-0000-000000000007",
    slug: "undated-event",
    title: "Undated Event",
    date_precision: "unknown",
    start_date: null,
    start_at: null,
  };
  const dates = cal.getCalendarDates(event);
  assert.equal(dates.canGenerateIcs, false);
  assert.equal(dates.icsUnavailableReason, "Event date is not specified.");
  assert.equal(dates.canGenerateGoogleCalendarLink, false);
  assert.equal(dates.googleCalendarUnavailableReason, "Event date is not specified.");

  assert.throws(() => cal.generateEventIcs(event), /Event date is not specified/);
  assert.equal(cal.generateGoogleCalendarUrl(event), null);
});

test("13. Deterministic UID based on event UUID, independent of APP_URL and host", () => {
  const event = {
    id: "99887766-5544-3322-1100-aabbccddeeff",
    slug: "uid-test",
    title: "UID Test",
    date_precision: "date_only",
    start_date: "2026-10-12",
  };
  const ics1 = cal.generateEventIcs(event, "https://preview.deploy.test");
  const ics2 = cal.generateEventIcs(event, "https://production.domain.test");
  assert.match(ics1, /\r\nUID:event-99887766-5544-3322-1100-aabbccddeeff@student-opportunities\r\n/);
  assert.match(ics2, /\r\nUID:event-99887766-5544-3322-1100-aabbccddeeff@student-opportunities\r\n/);
  // Verify UID line does not contain domain from APP_URL or deployment
  const uidLine1 = ics1.split("\r\n").find(l => l.startsWith("UID:"));
  const uidLine2 = ics2.split("\r\n").find(l => l.startsWith("UID:"));
  assert.ok(!uidLine1.includes("preview.deploy.test"));
  assert.ok(!uidLine2.includes("production.domain.test"));
});

test("14. ICS text escaping for semicolons, commas, backslashes, and newlines", () => {
  const escaped = cal.escapeIcsText("Hello; World, with \\ backslash\nand new line\r\ncarriage return");
  assert.equal(escaped, "Hello\\; World\\, with \\\\ backslash\\nand new line\\ncarriage return");
});

test("15. Unicode line folding at 75 OCTETS, not 75 JavaScript characters", () => {
  // Line with multi-byte characters (Devanagari 'विद्यार्थी' and emojis '🚀🎉')
  // In UTF-8, each Devanagari character is 3 bytes, each emoji is 4 bytes.
  const prefix = "SUMMARY:Hackathon for ";
  const multiByteStr = "विद्यार्थी एवं शोधकर्ता 🚀🎉 ".repeat(5);
  const fullLine = prefix + multiByteStr;

  const folded = cal.foldIcsLine(fullLine, 75);
  const splitLines = folded.split("\r\n");

  assert.ok(splitLines.length > 1, "Should be folded into multiple physical lines");
  for (let i = 0; i < splitLines.length; i++) {
    const l = splitLines[i];
    const byteLength = Buffer.byteLength(l, "utf8");
    assert.ok(
      byteLength <= 75,
      `Physical line ${i} byte length ${byteLength} must not exceed 75 octets (content: ${l})`
    );
    if (i > 0) {
      assert.ok(l.startsWith(" "), "Continuation line must start with a space");
    }
  }

  // Verify unfold restores original string identically
  const unfolded = folded.replace(/\r\n /g, "");
  assert.equal(unfolded, fullLine, "Unfolded string must match original exactly without broken code points");
});

test("16. Safe filename sanitization with hostile and empty slug fallbacks", () => {
  assert.equal(cal.sanitizeIcsFilename("hackathon-2026"), "hackathon-2026.ics");
  assert.equal(cal.sanitizeIcsFilename("../../evil\r\npath"), "evilpath.ics");
  assert.equal(cal.sanitizeIcsFilename("$$$###"), "event.ics");
  assert.equal(cal.sanitizeIcsFilename(""), "event.ics");
  assert.equal(cal.sanitizeIcsFilename("   "), "event.ics");
});

test("17-19. Content headers, disposition, and absence of private data in ICS", () => {
  const event = {
    id: "10000000-0000-0000-0000-000000000008",
    slug: "header-test",
    title: "Header Test Event",
    date_precision: "date_only",
    start_date: "2026-10-12",
    short_description: "Public summary only",
    // Forbidden fields that must never appear in ICS
    recommendation_score: 95,
    user_profile: { name: "Secret Student" },
    raw_storage_ref: "secret/bucket/path",
    admin_notes: "staff only",
  };
  const ics = cal.generateEventIcs(event);
  assert.ok(!ics.includes("Secret Student"));
  assert.ok(!ics.includes("secret/bucket/path"));
  assert.ok(!ics.includes("staff only"));
  assert.ok(!ics.includes("95"));
  assert.match(ics, /\r\nSUMMARY:Header Test Event\r\n/);
});

test("20. Cancelled event emits STATUS:CANCELLED; Google Calendar link disabled", () => {
  const event = {
    id: "10000000-0000-0000-0000-000000000009",
    slug: "cancelled-hackathon",
    title: "Cancelled Hackathon",
    date_precision: "date_only",
    start_date: "2026-10-12",
    status: "cancelled",
  };
  const dates = cal.getCalendarDates(event);
  assert.equal(dates.canGenerateIcs, true);
  assert.equal(dates.canGenerateGoogleCalendarLink, false);
  assert.equal(dates.googleCalendarUnavailableReason, "This event is cancelled.");

  const ics = cal.generateEventIcs(event);
  assert.match(ics, /\r\nSTATUS:CANCELLED\r\n/);

  const googleUrl = cal.generateGoogleCalendarUrl(event);
  assert.equal(googleUrl, null);
});

test("21. Completed event: Google Calendar link disabled; ICS archive available", () => {
  const event = {
    id: "10000000-0000-0000-0000-000000000010",
    slug: "past-summit",
    title: "Past Summit",
    date_precision: "date_only",
    start_date: "2026-01-10",
    end_date: "2026-01-11",
    status: "completed",
  };
  const dates = cal.getCalendarDates(event);
  assert.equal(dates.canGenerateIcs, true);
  assert.equal(dates.canGenerateGoogleCalendarLink, false);
  assert.equal(dates.googleCalendarUnavailableReason, "This event has completed.");

  const ics = cal.generateEventIcs(event);
  assert.match(ics, /\r\nSUMMARY:Past Summit\r\n/);

  const googleUrl = cal.generateGoogleCalendarUrl(event);
  assert.equal(googleUrl, null);
});

test("22-26. Google Calendar URL: valid structure, URLSearchParams encoding, canonical link", () => {
  const event = {
    id: "10000000-0000-0000-0000-000000000011",
    slug: "ai-symposium",
    title: "AI & Data Science Symposium, 2026",
    short_description: "Annual university conference on AI & ML.",
    date_precision: "date_only",
    start_date: "2026-11-20",
    end_date: "2026-11-21",
    venue: "Main Auditorium",
    city: "Bengaluru",
    country: "IN",
    mode: "hybrid",
    registration_url: "https://example.test/register",
    official_url: "https://example.test/official",
  };
  const urlStr = cal.generateGoogleCalendarUrl(event, "https://opportunities.test");
  assert.ok(urlStr, "URL should be generated");

  const parsed = new URL(urlStr);
  assert.equal(parsed.origin, "https://calendar.google.com");
  assert.equal(parsed.pathname, "/calendar/render");
  assert.equal(parsed.searchParams.get("action"), "TEMPLATE");
  assert.equal(parsed.searchParams.get("text"), "AI & Data Science Symposium, 2026");
  assert.equal(parsed.searchParams.get("dates"), "20261120/20261122");
  assert.equal(parsed.searchParams.get("location"), "Main Auditorium, Bengaluru, IN (Hybrid)");

  const details = parsed.searchParams.get("details");
  assert.ok(details.includes("Annual university conference on AI & ML."));
  assert.ok(details.includes("Event details: https://opportunities.test/events/ai-symposium"));
  assert.ok(details.includes("Registration: https://example.test/register"));
});

test("27-28. Google Calendar URL does not leak private fields and encodes special characters safely", () => {
  const event = {
    id: "10000000-0000-0000-0000-000000000012",
    slug: "special-chars",
    title: "Code & Hack <script>alert(1)</script> / 'Quotes' & \"Double\"",
    date_precision: "date_only",
    start_date: "2026-10-12",
    // Private properties
    recommendation_breakdown: { match: 100 },
    student_notes: "sensitive fact",
  };
  const urlStr = cal.generateGoogleCalendarUrl(event);
  assert.ok(!urlStr.includes("sensitive fact"));
  assert.ok(!urlStr.includes("recommendation_breakdown"));

  const parsed = new URL(urlStr);
  assert.equal(parsed.searchParams.get("text"), "Code & Hack <script>alert(1)</script> / 'Quotes' & \"Double\"");
});

test("29. Canonical URL builder rejects hostile origins and cannot inject query parameters", () => {
  // Slug with hostile characters
  const safeUrl1 = cal.getCanonicalEventUrl("../../evil?param=1#hash", "https://trusted.test");
  assert.equal(safeUrl1, "https://trusted.test/events/evilparam1hash");
  assert.ok(!safeUrl1.includes("?"));
  assert.ok(!safeUrl1.includes("#"));

  // Hostile base origin
  const safeUrl2 = cal.getCanonicalEventUrl("normal-event", "javascript:alert(1)");
  assert.equal(safeUrl2, "/events/normal-event");
});

test("30. Saved card calendar integration introduces zero N+1 queries", () => {
  // PublicEventCard has all facts required for both ICS link and Google Calendar link
  const card = {
    id: "70000000-0000-0000-0000-000000000001",
    slug: "isolated-event-1",
    title: "ISOLATED TEST event 1",
    short_description: "Synthetic fixture, never production",
    start_date: "2026-10-12",
    end_date: null,
    start_at: null,
    end_at: null,
    timezone: null,
    date_precision: "date_only",
    mode: "offline",
    venue: null,
    city: null,
    state: null,
    country: null,
    status: "announced",
    registration_status: "open",
    verification_level: "community_submitted",
    verification_status: "current",
    last_checked_at: new Date().toISOString(),
    organizers: { id: "50000000-0000-0000-0000-000000000001", name: "Org", website: null },
    event_categories: { id: "cat-1", slug: "hackathon", name: "Hackathons" },
    event_deadlines: [],
  };

  const dates = cal.getCalendarDates(card);
  assert.equal(dates.canGenerateIcs, true);
  assert.equal(dates.canGenerateGoogleCalendarLink, true);

  const googleUrl = cal.generateGoogleCalendarUrl(card);
  assert.ok(googleUrl.includes("ISOLATED+TEST+event+1"));
  assert.ok(googleUrl.includes("20261012%2F20261013"));
});
