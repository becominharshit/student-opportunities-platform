/**
 * Pure calendar calculations, RFC 5545 .ics generation, and Google Calendar URL construction.
 * Strictly derives all calendar data from canonical published event fields.
 * Never fabricates end dates, durations, midnight timestamps, or timezones.
 */

export interface CalendarEventData {
  id: string;
  slug: string;
  title: string;
  short_description?: string | null;
  full_description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  timezone?: string | null;
  date_precision?: string | null;
  mode?: string | null;
  venue?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  official_url?: string | null;
  registration_url?: string | null;
  status?: string | null;
  updated_at?: string | null;
  last_checked_at?: string | null;
}

export interface CalendarDatesInfo {
  canGenerateIcs: boolean;
  icsUnavailableReason?: string;
  canGenerateGoogleCalendarLink: boolean;
  googleCalendarUnavailableReason?: string;
  kind?: "date_only" | "datetime";
  startDateStr?: string; // YYYYMMDD
  endDateStr?: string;   // YYYYMMDD (exclusive RFC 5545 DTEND)
  startUtc?: string;     // YYYYMMDDTHHMMSSZ
  endUtc?: string;       // YYYYMMDDTHHMMSSZ (only if end_at is canonically known)
  timezone?: string | null;
}

/**
 * Validates a YYYY-MM-DD date string.
 */
function isValidYmd(val: string | null | undefined): val is string {
  return typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val);
}

/**
 * Validates an ISO 8601 instant string.
 */
function isValidInstant(val: string | null | undefined): val is string {
  if (typeof val !== "string" || !val) return false;
  const time = Date.parse(val);
  return Number.isFinite(time);
}

/**
 * Adds an integer number of days to a YYYY-MM-DD date string, returning YYYYMMDD.
 * Uses UTC date calculations to avoid DST shifts.
 */
export function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const ry = date.getUTCFullYear();
  const rm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const rd = String(date.getUTCDate()).padStart(2, "0");
  return `${ry}${rm}${rd}`;
}

/**
 * Formats a valid YYYY-MM-DD string into YYYYMMDD digits.
 */
export function formatYmdDigits(ymd: string): string {
  return ymd.replace(/-/g, "");
}

/**
 * Formats an ISO 8601 instant string into UTC YYYYMMDDTHHMMSSZ.
 */
export function formatUtcInstant(isoString: string): string {
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime())) {
    throw new Error("Invalid instant: " + isoString);
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

/**
 * Derives independent action availability and exact date strings for ICS and Google Calendar.
 */
export function getCalendarDates(event: CalendarEventData): CalendarDatesInfo {
  // Check for cancelled status first
  const isCancelled = event.status === "cancelled";
  const isCompleted = event.status === "completed";

  const hasDateOnly = (event.date_precision === "date_only" || (!event.date_precision && event.start_date && !event.start_at))
    && isValidYmd(event.start_date);
  const hasDatetime = (event.date_precision === "datetime" || (!event.date_precision && event.start_at))
    && isValidInstant(event.start_at);

  if (!hasDateOnly && !hasDatetime) {
    return {
      canGenerateIcs: false,
      icsUnavailableReason: "Event date is not specified.",
      canGenerateGoogleCalendarLink: false,
      googleCalendarUnavailableReason: "Event date is not specified.",
    };
  }

  if (hasDateOnly && event.start_date) {
    const startDateStr = formatYmdDigits(event.start_date);
    // If end_date is provided and >= start_date, exclusive DTEND is end_date + 1 day.
    // If end_date is omitted or before start_date, exclusive DTEND is start_date + 1 day.
    const effectiveEnd = (event.end_date && isValidYmd(event.end_date) && event.end_date >= event.start_date)
      ? event.end_date
      : event.start_date;
    const endDateStr = addDaysToYmd(effectiveEnd, 1);

    if (isCancelled) {
      return {
        canGenerateIcs: true,
        canGenerateGoogleCalendarLink: false,
        googleCalendarUnavailableReason: "This event is cancelled.",
        kind: "date_only",
        startDateStr,
        endDateStr,
      };
    }

    if (isCompleted) {
      return {
        canGenerateIcs: true,
        canGenerateGoogleCalendarLink: false,
        googleCalendarUnavailableReason: "This event has completed.",
        kind: "date_only",
        startDateStr,
        endDateStr,
      };
    }

    return {
      canGenerateIcs: true,
      canGenerateGoogleCalendarLink: true,
      kind: "date_only",
      startDateStr,
      endDateStr,
    };
  }

  // Datetime event
  if (hasDatetime && event.start_at) {
    const startUtc = formatUtcInstant(event.start_at);
    const hasEndAt = isValidInstant(event.end_at);
    const endUtc = hasEndAt && event.end_at ? formatUtcInstant(event.end_at) : undefined;
    const timezone = event.timezone ?? null;

    if (isCancelled) {
      return {
        canGenerateIcs: true,
        canGenerateGoogleCalendarLink: false,
        googleCalendarUnavailableReason: "This event is cancelled.",
        kind: "datetime",
        startUtc,
        endUtc,
        timezone,
      };
    }

    if (isCompleted) {
      return {
        canGenerateIcs: true,
        canGenerateGoogleCalendarLink: false,
        googleCalendarUnavailableReason: "This event has completed.",
        kind: "datetime",
        startUtc,
        endUtc,
        timezone,
      };
    }

    // If end_at is unknown, Google Calendar template cannot be accurately constructed
    // without fabricating duration or end times.
    if (!endUtc) {
      return {
        canGenerateIcs: true,
        canGenerateGoogleCalendarLink: false,
        googleCalendarUnavailableReason: "Event end time is not specified.",
        kind: "datetime",
        startUtc,
        timezone,
      };
    }

    return {
      canGenerateIcs: true,
      canGenerateGoogleCalendarLink: true,
      kind: "datetime",
      startUtc,
      endUtc,
      timezone,
    };
  }

  return {
    canGenerateIcs: false,
    icsUnavailableReason: "Event date is not specified.",
    canGenerateGoogleCalendarLink: false,
    googleCalendarUnavailableReason: "Event date is not specified.",
  };
}

/**
 * Formats canonical event location without inventing details.
 */
export function formatLocation(event: CalendarEventData): string | null {
  const physical = [event.venue, event.city, event.state, event.country]
    .filter(Boolean)
    .map(s => String(s).trim())
    .filter(s => s.length > 0)
    .join(", ");

  if (event.mode === "online") {
    return physical ? `${physical} (Online)` : "Online";
  }

  if (event.mode === "hybrid") {
    return physical ? `${physical} (Hybrid)` : "Hybrid (Online / In-person)";
  }

  return physical || null;
}

/**
 * Escapes characters per RFC 5545 section 3.3.11:
 * Backslash, semicolon, comma, and newlines.
 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds an ICS content line so that each physical line is at most 75 octets (bytes)
 * in accordance with RFC 5545 section 3.1.
 * Continuation lines begin with a single space (1 octet).
 * Multi-byte UTF-8 sequences are never split across line folds.
 */
export function foldIcsLine(line: string, maxOctets = 75): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(line);
  if (encoded.length <= maxOctets) {
    return line;
  }

  // Iterate by Unicode code point / surrogate pair so multi-byte code units are kept together
  const chars = Array.from(line);
  const lines: string[] = [];
  let currentLineChars: string[] = [];
  let currentOctetCount = 0;
  let limit = maxOctets;

  for (const ch of chars) {
    const chOctets = encoder.encode(ch).length;
    if (currentOctetCount + chOctets > limit) {
      lines.push(currentLineChars.join(""));
      currentLineChars = [ch];
      // Continuation line begins with a single space (' '), which takes 1 octet
      currentOctetCount = 1 + chOctets;
      limit = maxOctets;
    } else {
      currentLineChars.push(ch);
      currentOctetCount += chOctets;
    }
  }

  if (currentLineChars.length > 0) {
    lines.push(currentLineChars.join(""));
  }

  return lines.join("\r\n ");
}

/**
 * Validates and extracts a safe origin from a given string.
 * Rejects javascript:, data:, file:, or non-http(s) protocols.
 * Rejects paths, queries, fragments, usernames, and passwords.
 * Rejects localhost in production.
 */
export function sanitizeBaseOrigin(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
      return null;
    }
    if (url.protocol === "https:") {
      return url.origin;
    }
    if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      if (process.env.NODE_ENV === "production") {
        return null;
      }
      return url.origin;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validates and extracts a safe base application origin from APP_URL.
 * Rejects localhost in production; prevents query parameters or fragments.
 */
export function getValidatedAppOrigin(): string | null {
  return sanitizeBaseOrigin(process.env.APP_URL);
}

/**
 * Returns a safe canonical Event Detail URL, strictly using validated origin and sanitized slug.
 */
export function getCanonicalEventUrl(slug: string, baseOrigin?: string | null): string {
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "") || "event";
  const origin = sanitizeBaseOrigin(baseOrigin) ?? getValidatedAppOrigin();
  if (origin) {
    return `${origin}/events/${safeSlug}`;
  }
  return `/events/${safeSlug}`;
}

/**
 * Sanitizes a slug into a safe Content-Disposition filename: `<sanitized>.ics`.
 * Falls back to `event.ics` if the slug contains no valid characters.
 */
export function sanitizeIcsFilename(slug: string): string {
  const cleaned = (slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
  return cleaned ? `${cleaned}.ics` : "event.ics";
}

/**
 * Constructs a safe Google Calendar web creation URL using URLSearchParams.
 * Fixed base: https://calendar.google.com/calendar/render
 * Returns null if dates cannot be accurately constructed or event is cancelled/completed.
 */
export function generateGoogleCalendarUrl(
  event: CalendarEventData,
  baseOrigin?: string | null
): string | null {
  const dates = getCalendarDates(event);
  if (!dates.canGenerateGoogleCalendarLink) {
    return null;
  }

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", event.title.trim());

  if (dates.kind === "date_only" && dates.startDateStr && dates.endDateStr) {
    url.searchParams.set("dates", `${dates.startDateStr}/${dates.endDateStr}`);
  } else if (dates.kind === "datetime" && dates.startUtc && dates.endUtc) {
    url.searchParams.set("dates", `${dates.startUtc}/${dates.endUtc}`);
    if (dates.timezone) {
      url.searchParams.set("ctz", dates.timezone);
    }
  } else {
    return null;
  }

  const canonicalUrl = getCanonicalEventUrl(event.slug, baseOrigin);
  const detailsParts: string[] = [];
  if (event.short_description) {
    detailsParts.push(event.short_description.trim());
  }
  if (canonicalUrl) {
    detailsParts.push(`Event details: ${canonicalUrl}`);
  }
  if (event.registration_url) {
    detailsParts.push(`Registration: ${event.registration_url}`);
  } else if (event.official_url) {
    detailsParts.push(`Official website: ${event.official_url}`);
  }
  detailsParts.push("Registration takes place on the organizer's website. Check official rules before applying.");

  url.searchParams.set("details", detailsParts.join("\n\n"));

  const location = formatLocation(event);
  if (location) {
    url.searchParams.set("location", location);
  }

  return url.toString();
}

/**
 * Generates standards-compliant RFC 5545 text/calendar ICS content.
 * Uses deterministic UID: `event-${event.id}@student-opportunities`
 * CRLF line endings and 75-octet line folding.
 */
export function generateEventIcs(
  event: CalendarEventData,
  baseOrigin?: string | null
): string {
  const dates = getCalendarDates(event);
  if (!dates.canGenerateIcs) {
    throw new Error(dates.icsUnavailableReason || "Event date is not specified.");
  }

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Student Opportunities Platform//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${event.id}@student-opportunities`,
  ];

  // DTSTAMP: Use event last_checked_at or updated_at if valid, otherwise current time in UTC
  const stampSource = event.last_checked_at || event.updated_at || new Date().toISOString();
  const dtstamp = formatUtcInstant(stampSource);
  lines.push(`DTSTAMP:${dtstamp}`);

  if (dates.kind === "date_only" && dates.startDateStr) {
    lines.push(`DTSTART;VALUE=DATE:${dates.startDateStr}`);
    if (dates.endDateStr) {
      lines.push(`DTEND;VALUE=DATE:${dates.endDateStr}`);
    }
  } else if (dates.kind === "datetime" && dates.startUtc) {
    lines.push(`DTSTART:${dates.startUtc}`);
    // If endUtc is canonically known, output DTEND. Never fabricate DTEND or DURATION if unknown.
    if (dates.endUtc) {
      lines.push(`DTEND:${dates.endUtc}`);
    }
  }

  lines.push(`SUMMARY:${escapeIcsText(event.title.trim())}`);

  const canonicalUrl = getCanonicalEventUrl(event.slug, baseOrigin);
  const descParts: string[] = [];
  if (event.short_description) {
    descParts.push(event.short_description.trim());
  }
  if (canonicalUrl) {
    descParts.push(`Event details: ${canonicalUrl}`);
  }
  if (event.registration_url) {
    descParts.push(`Registration: ${event.registration_url}`);
  } else if (event.official_url) {
    descParts.push(`Official website: ${event.official_url}`);
  }
  descParts.push("Registration takes place on the organizer's website. Check official rules before applying.");

  lines.push(`DESCRIPTION:${escapeIcsText(descParts.join("\n\n"))}`);

  const location = formatLocation(event);
  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }

  if (canonicalUrl) {
    lines.push(`URL:${canonicalUrl}`);
  }

  if (event.status === "cancelled") {
    lines.push("STATUS:CANCELLED");
  } else {
    lines.push("STATUS:CONFIRMED");
  }

  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  // Apply RFC 5545 75-octet line folding and join with CRLF
  const foldedLines = lines.map(line => foldIcsLine(line));
  return foldedLines.join("\r\n") + "\r\n";
}
