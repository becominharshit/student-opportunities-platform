import "server-only";
import type { ErrorCode, SafeError } from "./contracts";

const messages: Record<ErrorCode, string> = {
  permission_denied: "Source access is not authorized.", rate_limited: "Source request deferred.",
  authentication_failed: "Source authentication failed.", network_error: "Source transport failed.",
  parse_error: "Source document could not be parsed.", schema_error: "Source contract validation failed.",
  budget_exceeded: "Worker budget or lease unavailable.",
};
export class ConnectorError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  constructor(code: ErrorCode, retryable = false, retryAfterMs?: number) {
    super(messages[code]); this.name = "ConnectorError"; this.code = code; this.retryable = retryable;
    this.retryAfterMs = Number.isFinite(retryAfterMs) && retryAfterMs! >= 0 ? retryAfterMs : undefined;
  }
}
/** Never forward error messages, URLs, headers, bodies, SQL errors, or causes. */
export function redact(error: unknown, fallback: ErrorCode = "network_error"): SafeError {
  const e = error instanceof ConnectorError ? error : new ConnectorError(fallback);
  return { code: e.code, retryable: e.retryable, detail: messages[e.code], ...(e.retryAfterMs === undefined ? {} : { retryAfterMs: e.retryAfterMs }) };
}
