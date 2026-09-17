# C08 generic connector infrastructure

C08 implements server-only capabilities and local synthetic verification. It does not implement FOSS United, an event parser/normalizer, a scheduled job, source activation, or event publication. The production source registry is empty. All C07 candidates remain disabled. The user's C08 authorization permits this generic work despite the unresolved first-live-source gate.

## Architecture

- `contracts.ts`: SourceConnector discover/refresh/parse, RawRecord, FieldEvidence, EventCandidate, ConnectorContext, PolicyBoundFetcher and ConnectorStore. Parse/refresh are extension contracts; no real implementation is supplied at C08. Optional observations do not become canonical defaults.
- `policy.ts`: validates reviewed input and exact endpoint routes. Store configuration under `source_connectors.policy_metadata.fetchPolicy`: enabled, approved, unexpired, evidence, terms/robots hashes, user agent, routes, content types and bounded numeric limits. C07 CONDITIONAL is not accepted.
- `transport.ts`: Node HTTPS GET with vetted IPv4 pinned through lookup. Host/SNI and normal certificate verification still use the reviewed hostname. A fresh non-pooling Agent has no environment proxy settings; no cookies, Authorization or caller-provided headers.
- `fetcher.ts`: checks policy and current database permission before DNS, and rechecks reservation ownership before transport. Enforces size, redirects, deadlines, retries and shared budgets. Access failures are latched; a connector cannot swallow them and report success.
- `store.ts`: uses the existing server-only Supabase service helper for atomic worker operations and private evidence upload. No public route or client-component entry point.
- `runner.ts`: one bounded discovery page, at most 100 retained items. Only responses received through its fetch capability may be retained. Records outcomes/checkpoints; parsing, normalization, duplicate resolution, verification and publication remain later stages.

Source connectors are trusted, reviewed application modules, not sandboxed third-party JavaScript. Remote bytes never execute. Future connector reviews must prohibit direct network access outside the fetch capability. TypeScript interfaces are not a security sandbox.

## Fetch security

Only HTTPS on the default port, exact host/path allowlists and explicit query keys are accepted. No wildcards, suffix matches, credentials, duplicate query keys, fragments, IP literals, trailing-dot hostnames, encoded path separators or traversal. Each redirect is resolved, revalidated, re-budgeted and independently DNS-checked; maximum three. No control bypass or alternate identity is attempted.

Only public IPv4 transport is supported. IPv6-only targets fail closed; private, loopback, link-local, shared-address, documentation, benchmarking, multicast and reserved IPv4 ranges are rejected. All selected IPv4 DNS results must pass. The actual connection cannot resolve the hostname again to a different address. The host reservation is validated/renewed immediately before transport. IPv6 expansion needs a reviewed classifier and fixtures.

A wall-clock deadline covers DNS, connection, headers and body (ceiling 20 seconds). Parent abort closes transport. Late DNS completion cannot start a request after timeout. Headers are capped at 16 KiB. Bodies stream into a bounded buffer (ceiling 2 MiB); declared lengths are checked for size and consistency. Content types require an explicit MIME allowlist. Requests specify identity encoding; compressed responses are rejected, preventing decompression bombs without an unbounded decompressor. Authentication/permission errors are inspected before retaining any body.

404/410 indicate a missing source only, never cancellation. Unsolicited 304 and partial-content responses are rejected because C08 has no prior validated content/conditional-request implementation. Conditional refresh is a later extension, not an invented freshness result.

## Rate limits, retries and leases

Policy ceilings: 100 requests/run, 1,000/day, three retries, three redirects, 20-second attempts, 2 MiB bodies and 30-day raw retention. Approved source policies can specify smaller limits; these ceilings are not provider entitlements. Daily windows use UTC.

Every attempt, redirect and retry consumes a database reservation. `connector_host_budgets` serializes each host across connectors/runs, limits requests, enforces spacing and persists Retry-After. The stricter observed daily limit and interval remain in force until administrative review; workers cannot raise an existing host budget using a looser policy. Reservations survive process replacement and have bounded expiry for crash recovery.

Transient failures retry at most three times with exponential backoff/jitter. Retry-After seconds and HTTP dates are honored and persisted. Waits beyond 30 seconds are deferred, never shortened. 401/403 and policy failures do not retry. Unrepresentably large deferrals fail closed. Three failed runs pause a source; authentication/permission failure pauses when the run closes and blocks subsequent requests in that fetcher immediately.

A source lease lasts five minutes with an incrementing fencing token. Claim locks the source; replacement marks the expired run cancelled. Guarded operations validate source, run, token, fence and expiry. Stale workers cannot commit evidence metadata or checkpoints. No heartbeat/scheduler/renewal loop is supplied: one bounded page must finish within the lease; C11 owns recurring execution.

## Storage and replay

The additive migration creates `connector_evidence` and `connector_host_budgets`, augments `sync_runs` with parser/lease/policy/request metadata, and adds the service-role-only `connector_runtime` RPC. The two tables are justified by immutable raw replay identity and cross-connector host budgets. `event_sources` remains untouched until later validated ingestion.

The `connector-raw` Storage bucket is private, capped at 2 MiB with application/octet-stream delivery. Restrictive RLS excludes anon/authenticated users even when another bucket has a broad permissive policy. No browser admin bypass, public URL or signed URL is exposed. Metadata tables have RLS and no anon/authenticated grants or policies. Credentials remain in the existing server-only helper.

Evidence includes source/external ID, source URL, SHA-256, parser version, MIME, byte count, fetched/expiry times, run ID and opaque storage path. Object names use UUIDs, not URLs or credentials. Uniqueness on connector + external ID + content hash + parser version makes raw replay idempotent; changed payloads/parser versions create distinct evidence. Replay does not extend expiry. Raw bytes never establish a validated canonical observation or verification badge.

Upload precedes fenced metadata registration. On failure/duplicate registration the newly uploaded object is removed. Storage and PostgreSQL cannot share a transaction: a crash or failed cleanup can leave a private orphan. Before live activation, configure retention/orphan reconciliation and backup deletion (C11/launch operations). Expired evidence cannot be reused. C08 records retention and cleanup obligations but starts no purge schedule and does not claim expired bytes have been deleted.

Completion and checkpoint updates share one SQL transaction. Partial/failed pages preserve the prior checkpoint and successful-sync time; valid raw evidence survives for replay. Complete successful discovery advances only the connector's successful-sync time, never an event's last_checked_at. Canonical events, event_sources, event_changes and public source projections are not written.

## Errors

Fixed codes: `permission_denied`, `rate_limited`, `authentication_failed`, `network_error`, `parse_error`, `schema_error`, `budget_exceeded`. Lease/resource/size exhaustion uses budget_exceeded; invalid type/encoding/shape uses schema_error; timeouts are retryable network_error. Errors expose a fixed message, retryability and an optional safe wait duration.

Logs exclude provider errors, SQL, raw bodies, URLs/queries, headers and arbitrary exception messages. SQL retains allowlisted codes only. Diagnostic lists/page sizes are capped at 100; overflow is not persisted by this bounded runner. Collectors must report bad items as page errors instead of silently skipping them. Richer error archival and operational UI remain later work.

## Testing and deployment boundary

The synthetic harness transpiles actual modules, strips server-only markers for Node tests, injects fake DNS/transport, and runs real SQL in PGlite. The actual HTTPS adapter is tested through a mocked Node request for address pinning, SNI, TLS and proxy/header options. Production private-address guards have no test exception.

Storage HTTP is mocked; bucket metadata and restrictive policies are tested in an isolated minimal Storage schema. This is not real Storage HTTP integration or a multi-connection Supabase load test. Actual Next builds verify client imports of service helper and connector fetcher are rejected. Source tests are entirely synthetic/local. Hosted test scripts are deliberately not run under this local-only C08 scope.

Run `npm test`, `npm run db:types:check`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:bundle`, `npm run test:boundary`, and `npm run test:public:ui`. `npm run test:connectors` runs C08 alone. Existing event/public/database aliases are included in npm test.

No packages or environment variables were added. The original C08 tests make no production database changes. Subsequently, C08.5 applied the additive migration to the intended hosted project and verified actual Storage HTTP/privacy with exact temporary-fixture cleanup. See [C08.5 hosted verification](c085-hosted-verification.md). No live source was contacted or activated.

References: [Node HTTPS](https://nodejs.org/docs/latest-v24.x/api/https.html), [Node DNS](https://nodejs.org/docs/latest-v24.x/api/dns.html), [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control). Installed Next.js server/client-boundary documentation was read before implementation.
