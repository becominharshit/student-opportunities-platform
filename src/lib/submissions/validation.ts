import { categories } from "../events/validation";
import type {
  SubmissionPayload,
  SubmitterRelationship,
  EventMode,
  DeadlinePrecision,
  FeeStatus,
} from "./types";

export const ALLOWED_SUBMISSION_KEYS = new Set([
  "title",
  "organizer_name",
  "category_slug",
  "mode",
  "submitter_relationship",
  "official_url",
  "registration_url",
  "start_date",
  "end_date",
  "registration_deadline_precision",
  "registration_deadline_local_date",
  "registration_deadline_due_at",
  "registration_deadline_timezone",
  "venue",
  "city",
  "state",
  "country",
  "description",
  "eligibility_summary",
  "min_team_size",
  "max_team_size",
  "fee_status",
  "fee_amount",
  "currency",
  "prize_description",
  "submitter_notes",
]);

export const SUBMITTER_RELATIONSHIPS = [
  "organizer",
  "participant",
  "community_member",
  "other",
] as const;

export const EVENT_MODES = ["online", "offline", "hybrid"] as const;

export const DEADLINE_PRECISIONS = ["unknown", "date_only", "datetime"] as const;

export const FEE_STATUSES = ["unknown", "free", "paid", "varies"] as const;

export const REJECTION_REASONS = [
  "duplicate",
  "source_invalid",
  "insufficient_information",
  "not_relevant",
  "expired_event",
  "cannot_verify",
  "spam_abuse",
  "other",
] as const;

export interface ValidationIssue {
  field: string;
  message: string;
}

export function validSubmissionUrl(v: unknown): boolean {
  if (typeof v !== "string" || v.trim().length === 0) return true;
  const trimmed = v.trim();
  if (trimmed.length > 2048) return false;
  // Disallow control characters
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return false;

  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    // Reject embedded credentials
    if (u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    if (!host) return false;

    // Reject loopback, localhost, and RFC 1918 private IPv4 ranges
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("127.") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function isValidDateFormat(v: unknown): boolean {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = Date.parse(v);
  if (!Number.isFinite(parsed)) return false;
  return new Date(v).toISOString().slice(0, 10) === v;
}

export function isValidInstantFormat(v: unknown): boolean {
  if (typeof v !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)) return false;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed);
}

export function isValidTimezone(v: unknown): boolean {
  if (typeof v !== "string" || !v || /^[+-]/.test(v)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: v }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateSubmissionPayload(input: unknown): {
  ok: boolean;
  payload?: SubmissionPayload;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, issues: [{ field: "root", message: "Payload must be an object" }] };
  }

  const rawInput = input as Record<string, unknown>;
  const raw: Record<string, unknown> = {};
  const CAMEL_TO_SNAKE: Record<string, string> = {
    organizerName: "organizer_name",
    categorySlug: "category_slug",
    submitterRelationship: "submitter_relationship",
    officialUrl: "official_url",
    registrationUrl: "registration_url",
    startDate: "start_date",
    endDate: "end_date",
    registrationDeadlinePrecision: "registration_deadline_precision",
    deadlinePrecision: "registration_deadline_precision",
    registrationDeadlineLocalDate: "registration_deadline_local_date",
    deadlineLocalDate: "registration_deadline_local_date",
    registrationDeadlineDueAt: "registration_deadline_due_at",
    deadlineDueAt: "registration_deadline_due_at",
    registrationDeadlineTimezone: "registration_deadline_timezone",
    deadlineTimezone: "registration_deadline_timezone",
    eligibilitySummary: "eligibility_summary",
    minTeamSize: "min_team_size",
    maxTeamSize: "max_team_size",
    feeStatus: "fee_status",
    feeAmount: "fee_amount",
    prizeDescription: "prize_description",
    submitterNotes: "submitter_notes",
  };

  for (const [k, v] of Object.entries(rawInput)) {
    const targetKey = CAMEL_TO_SNAKE[k] || k;
    raw[targetKey] = v;
  }

  // Check for unknown keys
  for (const k of Object.keys(raw)) {
    if (!ALLOWED_SUBMISSION_KEYS.has(k)) {
      issues.push({ field: k, message: `Unrecognized field: ${k}` });
    }
  }

  // Required: title
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length < 3 || title.length > 200) {
    issues.push({ field: "title", message: "Event title must be between 3 and 200 characters" });
  }

  // Required: organizer_name
  const organizerName = typeof raw.organizer_name === "string" ? raw.organizer_name.trim() : "";
  if (organizerName.length < 2 || organizerName.length > 150) {
    issues.push({ field: "organizer_name", message: "Organizer name must be between 2 and 150 characters" });
  }

  // Required: category_slug
  const categorySlug = typeof raw.category_slug === "string" ? raw.category_slug.trim() : "";
  if (!categories.includes(categorySlug as (typeof categories)[number])) {
    issues.push({ field: "category_slug", message: "Invalid category selection" });
  }

  // Required: mode
  const mode = typeof raw.mode === "string" ? raw.mode.trim() : "";
  if (!EVENT_MODES.includes(mode as EventMode)) {
    issues.push({ field: "mode", message: "Mode must be online, offline, or hybrid" });
  }

  // Required: submitter_relationship
  const relationship = typeof raw.submitter_relationship === "string" ? raw.submitter_relationship.trim() : "";
  if (!SUBMITTER_RELATIONSHIPS.includes(relationship as SubmitterRelationship)) {
    issues.push({ field: "submitter_relationship", message: "Invalid submitter relationship" });
  }

  // URLs
  const officialUrl = typeof raw.official_url === "string" && raw.official_url.trim() ? raw.official_url.trim() : null;
  const registrationUrl = typeof raw.registration_url === "string" && raw.registration_url.trim() ? raw.registration_url.trim() : null;

  if (!officialUrl && !registrationUrl) {
    issues.push({ field: "official_url", message: "At least one source link (official website or registration page) is required" });
  }

  if (officialUrl && !validSubmissionUrl(officialUrl)) {
    issues.push({ field: "official_url", message: "Official URL must be a valid public HTTP or HTTPS web address without credentials" });
  }

  if (registrationUrl && !validSubmissionUrl(registrationUrl)) {
    issues.push({ field: "registration_url", message: "Registration URL must be a valid public HTTP or HTTPS web address without credentials" });
  }

  // Dates
  const startDate = typeof raw.start_date === "string" && raw.start_date.trim() ? raw.start_date.trim() : null;
  const endDate = typeof raw.end_date === "string" && raw.end_date.trim() ? raw.end_date.trim() : null;

  if (startDate && !isValidDateFormat(startDate)) {
    issues.push({ field: "start_date", message: "Start date must be in YYYY-MM-DD format" });
  }
  if (endDate && !isValidDateFormat(endDate)) {
    issues.push({ field: "end_date", message: "End date must be in YYYY-MM-DD format" });
  }
  if (startDate && endDate && isValidDateFormat(startDate) && isValidDateFormat(endDate)) {
    if (startDate > endDate) {
      issues.push({ field: "end_date", message: "End date cannot precede start date" });
    }
  }

  // Deadline precision
  const deadlinePrecision: DeadlinePrecision = DEADLINE_PRECISIONS.includes(raw.registration_deadline_precision as DeadlinePrecision)
    ? (raw.registration_deadline_precision as DeadlinePrecision)
    : "unknown";

  const deadlineLocalDate = typeof raw.registration_deadline_local_date === "string" && raw.registration_deadline_local_date.trim()
    ? raw.registration_deadline_local_date.trim()
    : null;

  const deadlineDueAt = typeof raw.registration_deadline_due_at === "string" && raw.registration_deadline_due_at.trim()
    ? raw.registration_deadline_due_at.trim()
    : null;

  const deadlineTimezone = typeof raw.registration_deadline_timezone === "string" && raw.registration_deadline_timezone.trim()
    ? raw.registration_deadline_timezone.trim()
    : null;

  if (deadlinePrecision === "date_only") {
    if (!deadlineLocalDate || !isValidDateFormat(deadlineLocalDate)) {
      issues.push({ field: "registration_deadline_local_date", message: "Date-only deadline requires a valid date (YYYY-MM-DD)" });
    }
    if (deadlineDueAt) {
      issues.push({ field: "registration_deadline_due_at", message: "Date-only deadline must not specify due timestamp" });
    }
  } else if (deadlinePrecision === "datetime") {
    if (!deadlineDueAt || !isValidInstantFormat(deadlineDueAt)) {
      issues.push({ field: "registration_deadline_due_at", message: "Datetime deadline requires a valid ISO timestamp" });
    }
    if (deadlineTimezone && !isValidTimezone(deadlineTimezone)) {
      issues.push({ field: "registration_deadline_timezone", message: "Unrecognized timezone identifier" });
    }
  } else {
    // unknown
    if (deadlineLocalDate || deadlineDueAt) {
      issues.push({ field: "registration_deadline_precision", message: "Unknown deadline precision must have null dates" });
    }
  }

  // Location fields
  const country = typeof raw.country === "string" && raw.country.trim() ? raw.country.trim().toUpperCase() : null;
  if (country && !/^[A-Z]{2}$/.test(country)) {
    issues.push({ field: "country", message: "Country code must be a 2-letter ISO code (e.g. IN, US)" });
  }

  const venue = typeof raw.venue === "string" && raw.venue.trim() ? raw.venue.trim() : null;
  const city = typeof raw.city === "string" && raw.city.trim() ? raw.city.trim() : null;
  const state = typeof raw.state === "string" && raw.state.trim() ? raw.state.trim() : null;

  // Text length bounds
  const description = typeof raw.description === "string" && raw.description.trim() ? raw.description.trim() : null;
  if (description && description.length > 5000) {
    issues.push({ field: "description", message: "Description must not exceed 5000 characters" });
  }

  const eligibilitySummary = typeof raw.eligibility_summary === "string" && raw.eligibility_summary.trim() ? raw.eligibility_summary.trim() : null;
  if (eligibilitySummary && eligibilitySummary.length > 3000) {
    issues.push({ field: "eligibility_summary", message: "Eligibility summary must not exceed 3000 characters" });
  }

  // Team sizes
  const minTeamSize = raw.min_team_size !== undefined && raw.min_team_size !== null && raw.min_team_size !== ""
    ? Number(raw.min_team_size)
    : null;
  const maxTeamSize = raw.max_team_size !== undefined && raw.max_team_size !== null && raw.max_team_size !== ""
    ? Number(raw.max_team_size)
    : null;

  if (minTeamSize !== null && (!Number.isInteger(minTeamSize) || minTeamSize < 1)) {
    issues.push({ field: "min_team_size", message: "Minimum team size must be a positive whole number" });
  }
  if (maxTeamSize !== null && (!Number.isInteger(maxTeamSize) || maxTeamSize < 1)) {
    issues.push({ field: "max_team_size", message: "Maximum team size must be a positive whole number" });
  }
  if (minTeamSize !== null && maxTeamSize !== null && minTeamSize > maxTeamSize) {
    issues.push({ field: "max_team_size", message: "Maximum team size cannot be smaller than minimum team size" });
  }

  // Fee & Currency
  const feeStatus: FeeStatus = FEE_STATUSES.includes(raw.fee_status as FeeStatus)
    ? (raw.fee_status as FeeStatus)
    : "unknown";

  const feeAmount = raw.fee_amount !== undefined && raw.fee_amount !== null && raw.fee_amount !== ""
    ? Number(raw.fee_amount)
    : null;

  if (feeAmount !== null && (!Number.isFinite(feeAmount) || feeAmount < 0)) {
    issues.push({ field: "fee_amount", message: "Fee amount must be a non-negative number" });
  }

  const currency = typeof raw.currency === "string" && raw.currency.trim() ? raw.currency.trim().toUpperCase() : null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    issues.push({ field: "currency", message: "Currency must be a 3-letter ISO code (e.g. INR, USD)" });
  }
  if (feeAmount !== null && feeAmount > 0 && !currency) {
    issues.push({ field: "currency", message: "Currency is required when a fee amount is specified" });
  }

  const prizeDescription = typeof raw.prize_description === "string" && raw.prize_description.trim() ? raw.prize_description.trim() : null;
  if (prizeDescription && prizeDescription.length > 1000) {
    issues.push({ field: "prize_description", message: "Prize description must not exceed 1000 characters" });
  }

  const submitterNotes = typeof raw.submitter_notes === "string" && raw.submitter_notes.trim() ? raw.submitter_notes.trim() : null;
  if (submitterNotes && submitterNotes.length > 2000) {
    issues.push({ field: "submitter_notes", message: "Submitter notes must not exceed 2000 characters" });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    issues: [],
    payload: {
      title,
      organizer_name: organizerName,
      category_slug: categorySlug,
      mode: mode as EventMode,
      submitter_relationship: relationship as SubmitterRelationship,
      official_url: officialUrl,
      registration_url: registrationUrl,
      start_date: startDate,
      end_date: endDate,
      registration_deadline_precision: deadlinePrecision,
      registration_deadline_local_date: deadlineLocalDate,
      registration_deadline_due_at: deadlineDueAt,
      registration_deadline_timezone: deadlineTimezone,
      venue,
      city,
      state,
      country,
      description,
      eligibility_summary: eligibilitySummary,
      min_team_size: minTeamSize,
      max_team_size: maxTeamSize,
      fee_status: feeStatus,
      fee_amount: feeAmount,
      currency,
      prize_description: prizeDescription,
      submitter_notes: submitterNotes,
    },
  };
}
