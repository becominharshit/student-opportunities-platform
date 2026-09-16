import type { Json } from "../supabase/database.types";

export type ErrorCode = "permission_denied" | "rate_limited" | "authentication_failed" | "network_error" | "parse_error" | "schema_error" | "budget_exceeded";
export type SafeError = { code: ErrorCode; retryable: boolean; detail: string; retryAfterMs?: number };
export type Route = { host: string; path: string; queryKeys: string[] };
/** Reviewed administrative input, never inferred from a source response or C07 classification. */
export type FetchPolicy = {
  version: 1; enabled: boolean; permission: "approved"; expiresAt: string;
  evidence: string; termsHash: string; robotsHash: string; userAgent: string;
  routes: Route[]; contentTypes: string[]; timeoutMs: number; maxBytes: number;
  maxRetries: number; maxRedirects: number; maxRequests: number; dailyRequests: number;
  minIntervalMs: number; retentionDays: number;
};
export type FetchResponse = { url: string; status: number; contentType: string; body: Uint8Array; fetchedAt: string };
export interface PolicyBoundFetcher { get(url: string): Promise<FetchResponse> }
export type RawRecord = {
  externalId: string; sourceUrl: string; fetchedAt: string; sourceUpdatedAt?: string;
  contentType: string; contentHash: string; permittedPayloadRef: string;
  parserVersion: string;
};
export type FieldEvidence = {
  field: string; value: Json; locator: string; method: "structured" | "parser" | "ai" | "manual";
  observedAt: string; validation: "unverified" | "checked"; sourceRecordId: string;
};
// C09 will validate/normalize these observations. No publication/trust command is exposed.
export type EventCandidate = { observations: Record<string, { value: Json; explicitClear?: boolean }>; rawDate?: string; rawEligibility?: string };
export type CheckResult = { kind: "record"; record: RawRecord } | { kind: "not_modified"; externalId: string; checkedAt: string } | { kind: "missing"; externalId: string; checkedAt: string; status: 404 | 410 };
export type ConnectorContext = {
  runId: string; now: string; signal: AbortSignal; cursor?: string; maxItems: number;
  fetch: PolicyBoundFetcher;
  retain(externalId: string, response: FetchResponse): Promise<RawRecord>;
};
export interface SourceConnector {
  id: string; version: string; kind: "api" | "feed" | "structured_page" | "permitted_scrape";
  discover(ctx: ConnectorContext): Promise<{ items: RawRecord[]; nextCursor?: string; complete: boolean; errors?: SafeError[] }>;
  refresh(ctx: ConnectorContext, externalId: string): Promise<CheckResult>;
  parse(raw: RawRecord): Promise<{ candidate: EventCandidate; evidence: FieldEvidence[]; warnings: string[]; parserVersion: string }>;
}
export type Lease = { connectorId: string; runId: string; token: string; fence: number; policy: FetchPolicy; cursor?: string };
export interface ConnectorStore {
  claim(id: string, version: string): Promise<Lease>;
  guard(lease: Lease, host?: string): Promise<void>;
  reserve(lease: Lease, host: string): Promise<void>;
  defer(lease: Lease, host: string, milliseconds: number): Promise<void>;
  releaseHost(lease: Lease, host: string): Promise<void>;
  retain(lease: Lease, version: string, externalId: string, response: FetchResponse): Promise<RawRecord>;
  finish(lease: Lease, result: { items: RawRecord[]; cursor?: string; complete: boolean; errors: SafeError[] }): Promise<"succeeded" | "partial" | "failed">;
}
