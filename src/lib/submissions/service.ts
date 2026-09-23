import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types";
import type {
  UserSubmissionItem,
  AdminSubmissionListItem,
  AdminSubmissionDetail,
  SubmissionModerationEvent,
  DuplicateCandidate,
} from "./types";
import { validateSubmissionPayload } from "./validation";

export type SubmissionErrorCode =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "not_found"
  | "version_conflict"
  | "invalid_transition"
  | "rate_limit_exceeded"
  | "duplicate_submission"
  | "already_accepted"
  | "database_failure";

export type SubmissionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: SubmissionErrorCode; message: string; issues?: Array<{ field: string; message: string }> };

export const SUBMISSION_MESSAGES: Record<SubmissionErrorCode, string> = {
  unauthorized: "Please sign in with a confirmed email address to continue.",
  forbidden: "Administrator privileges are required for this action.",
  validation: "Please check the provided submission values.",
  not_found: "Submission not found.",
  version_conflict: "This submission was modified by another action. Please reload and retry.",
  invalid_transition: "This action is not permitted for the current submission status.",
  rate_limit_exceeded: "You have reached the maximum of 5 submissions in a 24-hour period. Please try again later.",
  duplicate_submission: "You have already submitted an opportunity with this title within the last 24 hours.",
  already_accepted: "This submission has already been accepted and linked to a canonical event draft.",
  database_failure: "An unexpected database error occurred. Please try again later.",
};

function mapPostgresError(error: { code?: string; message?: string }): {
  code: SubmissionErrorCode;
  message: string;
} {
  const pgCode = error.code ?? "";
  if (pgCode === "P0501" || pgCode === "42501") {
    return { code: "unauthorized", message: SUBMISSION_MESSAGES.unauthorized };
  }
  if (pgCode === "P0503") {
    return { code: "forbidden", message: SUBMISSION_MESSAGES.forbidden };
  }
  if (pgCode === "P0504") {
    return { code: "not_found", message: SUBMISSION_MESSAGES.not_found };
  }
  if (pgCode === "P0509") {
    return { code: "version_conflict", message: SUBMISSION_MESSAGES.version_conflict };
  }
  if (pgCode === "P0528") {
    return { code: "duplicate_submission", message: SUBMISSION_MESSAGES.duplicate_submission };
  }
  if (pgCode === "P0529") {
    return { code: "rate_limit_exceeded", message: SUBMISSION_MESSAGES.rate_limit_exceeded };
  }
  if (pgCode === "P0522" || pgCode === "23514" || pgCode === "23502" || pgCode === "23503" || pgCode === "22P02") {
    if (error.message?.includes("already_accepted")) {
      return { code: "already_accepted", message: SUBMISSION_MESSAGES.already_accepted };
    }
    if (error.message?.includes("invalid_transition")) {
      return { code: "invalid_transition", message: SUBMISSION_MESSAGES.invalid_transition };
    }
    return { code: "validation", message: SUBMISSION_MESSAGES.validation };
  }
  return { code: "database_failure", message: SUBMISSION_MESSAGES.database_failure };
}

// ==========================================
// SUBMITTER OPERATIONS
// ==========================================

export async function submitOpportunity(
  client: SupabaseClient<Database>,
  rawInput: unknown
): Promise<SubmissionResult<UserSubmissionItem>> {
  const validated = validateSubmissionPayload(rawInput);
  if (!validated.ok || !validated.payload) {
    return {
      ok: false,
      code: "validation",
      message: SUBMISSION_MESSAGES.validation,
      issues: validated.issues,
    };
  }

  const { data, error } = await client.rpc("submit_event_opportunity", {
    p_payload: validated.payload as unknown as Json,
  });

  if (error || !data) {
    const mapped = mapPostgresError(error ?? {});
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  const row = data as unknown as Record<string, unknown>;
  return {
    ok: true,
    value: mapRowToUserSubmissionItem(row),
  };
}

export async function editSubmission(
  client: SupabaseClient<Database>,
  id: string,
  expectedVersion: number,
  rawPatch: unknown
): Promise<SubmissionResult<UserSubmissionItem>> {
  const validated = validateSubmissionPayload(rawPatch);
  if (!validated.ok || !validated.payload) {
    return {
      ok: false,
      code: "validation",
      message: SUBMISSION_MESSAGES.validation,
      issues: validated.issues,
    };
  }

  const { data, error } = await client.rpc("edit_event_submission", {
    p_command: {
      id,
      expected_version: expectedVersion,
      patch: validated.payload as unknown as Json,
    } as unknown as Json,
  });

  if (error || !data) {
    const mapped = mapPostgresError(error ?? {});
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  const row = data as unknown as Record<string, unknown>;
  return {
    ok: true,
    value: mapRowToUserSubmissionItem(row),
  };
}

export async function withdrawSubmission(
  client: SupabaseClient<Database>,
  id: string,
  expectedVersion: number,
  publicNotes?: string
): Promise<SubmissionResult<UserSubmissionItem>> {
  const { data, error } = await client.rpc("withdraw_event_submission", {
    p_command: {
      id,
      expected_version: expectedVersion,
      public_notes: publicNotes ?? null,
    } as unknown as Json,
  });

  if (error || !data) {
    const mapped = mapPostgresError(error ?? {});
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  const row = data as unknown as Record<string, unknown>;
  return {
    ok: true,
    value: mapRowToUserSubmissionItem(row),
  };
}

export async function listUserSubmissions(
  client: SupabaseClient<Database>,
  options?: {
    limit?: number;
    cursorCreatedAt?: string;
    cursorId?: string;
  }
): Promise<{ items: UserSubmissionItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options?.limit ?? 24, 1), 50);

  const { data, error } = await client.rpc("list_user_submissions", {
    p_limit: limit,
    p_cursor_created_at: (options?.cursorCreatedAt ?? null) as unknown as string,
    p_cursor_id: (options?.cursorId ?? null) as unknown as string,
  });

  if (error || !Array.isArray(data)) {
    return { items: [], nextCursor: null };
  }

  const rawRows = data as Array<Record<string, unknown>>;
  const hasMore = rawRows.length > limit;
  const pageRows = rawRows.slice(0, limit);

  const items = pageRows.map(mapRowToUserSubmissionItem);

  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = Buffer.from(
      JSON.stringify({
        createdAt: last.created_at,
        id: last.id,
      })
    ).toString("base64url");
  }

  return { items, nextCursor };
}

function mapRowToUserSubmissionItem(row: Record<string, unknown>): UserSubmissionItem {
  return {
    id: String(row.id),
    status: row.status as UserSubmissionItem["status"],
    submitterRelationship: row.submitter_relationship as UserSubmissionItem["submitterRelationship"],
    title: String(row.title ?? ""),
    organizerName: String(row.organizer_name ?? ""),
    categorySlug: String(row.category_slug ?? ""),
    mode: row.mode as UserSubmissionItem["mode"],
    officialUrl: (row.official_url as string) || null,
    registrationUrl: (row.registration_url as string) || null,
    startDate: (row.start_date as string) || null,
    endDate: (row.end_date as string) || null,
    deadlinePrecision: (row.registration_deadline_precision as UserSubmissionItem["deadlinePrecision"]) || "unknown",
    deadlineLocalDate: (row.registration_deadline_local_date as string) || null,
    deadlineDueAt: (row.registration_deadline_due_at as string) || null,
    deadlineTimezone: (row.registration_deadline_timezone as string) || null,
    venue: (row.venue as string) || null,
    city: (row.city as string) || null,
    state: (row.state as string) || null,
    country: (row.country as string) || null,
    description: (row.description as string) || null,
    eligibilitySummary: (row.eligibility_summary as string) || null,
    minTeamSize: typeof row.min_team_size === "number" ? row.min_team_size : null,
    maxTeamSize: typeof row.max_team_size === "number" ? row.max_team_size : null,
    feeStatus: (row.fee_status as UserSubmissionItem["feeStatus"]) || "unknown",
    feeAmount: typeof row.fee_amount === "number" ? row.fee_amount : null,
    currency: (row.currency as string) || null,
    prizeDescription: (row.prize_description as string) || null,
    submitterNotes: (row.submitter_notes as string) || null,
    rejectionReasonCode: (row.rejection_reason_code as UserSubmissionItem["rejectionReasonCode"]) || null,
    rejectionReasonDetails: (row.rejection_reason_details as string) || null,
    publishedEventSlug: (row.published_event_slug as string) || null,
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

// ==========================================
// ADMINISTRATOR OPERATIONS
// ==========================================

export async function listAdminSubmissions(
  client: SupabaseClient<Database>,
  options?: {
    status?: string;
    limit?: number;
    cursorCreatedAt?: string;
    cursorId?: string;
  }
): Promise<{ items: AdminSubmissionListItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);

  const { data, error } = await client.rpc("list_admin_submissions", {
    p_status: (options?.status ?? null) as unknown as string,
    p_limit: limit,
    p_cursor_created_at: (options?.cursorCreatedAt ?? null) as unknown as string,
    p_cursor_id: (options?.cursorId ?? null) as unknown as string,
  });

  if (error || !Array.isArray(data)) {
    return { items: [], nextCursor: null };
  }

  const rawRows = data as Array<Record<string, unknown>>;
  const hasMore = rawRows.length > limit;
  const pageRows = rawRows.slice(0, limit);

  const items = pageRows.map((r) => ({
    id: String(r.id),
    status: r.status as AdminSubmissionListItem["status"],
    title: String(r.title ?? ""),
    organizer_name: String(r.organizer_name ?? ""),
    category_slug: String(r.category_slug ?? ""),
    mode: r.mode as AdminSubmissionListItem["mode"],
    submitter_relationship: r.submitter_relationship as AdminSubmissionListItem["submitter_relationship"],
    submitter_user_id: (r.submitter_user_id as string) || null,
    submitter_email: (r.submitter_email as string) || null,
    canonical_event_id: (r.canonical_event_id as string) || null,
    version: Number(r.version ?? 1),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  }));

  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = Buffer.from(
      JSON.stringify({
        createdAt: last.created_at,
        id: last.id,
      })
    ).toString("base64url");
  }

  return { items, nextCursor };
}

export async function getAdminSubmission(
  client: SupabaseClient<Database>,
  submissionId: string
): Promise<AdminSubmissionDetail | null> {
  const { data, error } = await client.rpc("get_admin_submission", {
    p_submission_id: submissionId,
  });

  if (error || !data) {
    return null;
  }

  let parsed = data;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  return parsed as unknown as AdminSubmissionDetail;
}

export async function getAdminSubmissionHistory(
  client: SupabaseClient<Database>,
  submissionId: string
): Promise<SubmissionModerationEvent[]> {
  const { data, error } = await client.rpc("get_admin_submission_history", {
    p_submission_id: submissionId,
  });

  if (error || !data) {
    return [];
  }

  let parsed = data;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed as unknown as SubmissionModerationEvent[];
}

export async function startReviewSubmission(
  client: SupabaseClient<Database>,
  id: string,
  expectedVersion: number,
  internalNotes?: string
): Promise<SubmissionResult<{ id: string; status: string }>> {
  const { data, error } = await client.rpc("start_review_event_submission", {
    p_command: {
      id,
      expected_version: expectedVersion,
      internal_notes: internalNotes ?? null,
    } as unknown as Json,
  });

  if (error || !data) {
    const mapped = mapPostgresError(error ?? {});
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  const row = data as Record<string, unknown>;
  return {
    ok: true,
    value: { id: String(row.id), status: String(row.status) },
  };
}

export async function rejectSubmission(
  client: SupabaseClient<Database>,
  id: string,
  expectedVersion: number,
  reasonCode: string,
  reasonDetails?: string,
  internalNotes?: string
): Promise<SubmissionResult<{ id: string; status: string }>> {
  const { data, error } = await client.rpc("reject_event_submission", {
    p_command: {
      id,
      expected_version: expectedVersion,
      rejection_reason_code: reasonCode,
      rejection_reason_details: reasonDetails ?? null,
      internal_notes: internalNotes ?? null,
    } as unknown as Json,
  });

  if (error || !data) {
    const mapped = mapPostgresError(error ?? {});
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  const row = data as Record<string, unknown>;
  return {
    ok: true,
    value: { id: String(row.id), status: String(row.status) },
  };
}

export async function acceptSubmission(
  client: SupabaseClient<Database>,
  submissionId: string,
  expectedVersion: number,
  eventCommand: Record<string, unknown>,
  internalNotes?: string,
  publicNotes?: string
): Promise<SubmissionResult<{ submissionId: string; canonicalEventId: string; status: string }>> {
  const { data, error } = await client.rpc("accept_event_submission", {
    p_command: {
      submission_id: submissionId,
      expected_version: expectedVersion,
      event_command: eventCommand as unknown as Json,
      internal_notes: internalNotes ?? null,
      public_notes: publicNotes ?? null,
    } as unknown as Json,
  });

  if (error || !data) {
    const mapped = mapPostgresError(error ?? {});
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  const res = data as Record<string, unknown>;
  return {
    ok: true,
    value: {
      submissionId: String(res.submission_id),
      canonicalEventId: String(res.canonical_event_id),
      status: String(res.status),
    },
  };
}

export async function findDuplicateCandidates(
  client: SupabaseClient<Database>,
  officialUrl: string | null,
  registrationUrl: string | null,
  title: string
): Promise<DuplicateCandidate[]> {
  const candidatesMap = new Map<string, DuplicateCandidate>();

  const normalizedTitle = title.trim().toLowerCase();

  // 1. Check title match
  if (normalizedTitle.length >= 3) {
    const { data: titleMatches } = await client
      .from("events")
      .select("id, title, slug, publication_status, official_url, registration_url")
      .ilike("title", normalizedTitle)
      .limit(5);

    if (titleMatches) {
      for (const ev of titleMatches) {
        candidatesMap.set(ev.id, {
          id: ev.id,
          title: ev.title,
          slug: ev.slug,
          publication_status: ev.publication_status,
          official_url: ev.official_url,
          registration_url: ev.registration_url,
          match_reasons: ["Exact or matching title"],
        });
      }
    }
  }

  // 2. Check official_url match
  if (officialUrl) {
    const cleanUrl = officialUrl.trim();
    const { data: urlMatches } = await client
      .from("events")
      .select("id, title, slug, publication_status, official_url, registration_url")
      .or(`official_url.eq.${cleanUrl},registration_url.eq.${cleanUrl}`)
      .limit(5);

    if (urlMatches) {
      for (const ev of urlMatches) {
        const existing = candidatesMap.get(ev.id);
        if (existing) {
          existing.match_reasons.push("Matching official/registration link");
        } else {
          candidatesMap.set(ev.id, {
            id: ev.id,
            title: ev.title,
            slug: ev.slug,
            publication_status: ev.publication_status,
            official_url: ev.official_url,
            registration_url: ev.registration_url,
            match_reasons: ["Matching official/registration link"],
          });
        }
      }
    }
  }

  // 3. Check registration_url match
  if (registrationUrl && registrationUrl !== officialUrl) {
    const cleanReg = registrationUrl.trim();
    const { data: regMatches } = await client
      .from("events")
      .select("id, title, slug, publication_status, official_url, registration_url")
      .or(`official_url.eq.${cleanReg},registration_url.eq.${cleanReg}`)
      .limit(5);

    if (regMatches) {
      for (const ev of regMatches) {
        const existing = candidatesMap.get(ev.id);
        if (existing) {
          if (!existing.match_reasons.includes("Matching official/registration link")) {
            existing.match_reasons.push("Matching registration link");
          }
        } else {
          candidatesMap.set(ev.id, {
            id: ev.id,
            title: ev.title,
            slug: ev.slug,
            publication_status: ev.publication_status,
            official_url: ev.official_url,
            registration_url: ev.registration_url,
            match_reasons: ["Matching registration link"],
          });
        }
      }
    }
  }

  return Array.from(candidatesMap.values());
}
