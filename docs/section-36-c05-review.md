# Section 36 — C05 review

Completed 16 September 2026. C05 implementation and the requested validation are complete, ready for review. No commit or push was made. C06 has not started.

## Architecture and authorization

Server-only `src/lib/events/service.ts` owns administrator authorization, input validation, event reads/lists and mutation error mapping. `mutateEvent` is the shared entry point; named create/update/publish/unpublish/archive operations delegate to it. Every invocation calls Supabase `getUser`, requires verified identity and reads protected `admin_memberships`. The database command independently rechecks `auth.uid()` and membership. Application operations use the requesting user's publishable-key/JWT context; no event service imports the privileged service client.

`public.mutate_event(command jsonb)` is a security-invoker transaction with an empty search path and an allowlisted command/field contract. Existing C03 RLS, constraints, immutable slug/version triggers and append-only history remain intact. Anonymous execution is revoked. Child updates or audit failures roll back the whole command. No new table or index is necessary: existing event/version, relation, audit and primary-deadline indexes support these operations.

The POST form endpoint additionally checks the canonical Origin and cross-site header, bounds the streamed body at 128 KiB, and accepts only URL-encoded forms. It preserves response auth cookies. Errors have safe application categories and HTTP statuses, including 409 for conflicts; the HTML error page explains how to recover form entries and reconcile against the latest version. Raw PostgreSQL messages, SQL and submitted payloads are not rendered or logged. Unexpected database errors log only a fixed category.

## Validation and CRUD

`validation.ts` performs runtime allowlisting and validates title/slug/text bounds, organizer/category IDs, HTTPS URLs without credentials, constrained states, date precision, explicit timestamp offsets, timezone/local-date agreement, date order, geography, nullable booleans, team bounds, decimal amount/currency combinations, metadata objects, nonempty filter arrays, tags and deadlines. Category IDs must resolve to one of the five MVP slugs. Database constraints remain the final authority.

Unknown fields remain null or the existing explicit unknown/pending enum state. No unknown boolean becomes false, unknown money becomes zero, or date-only fact becomes midnight. Blank optional form values become null. No URL fetching, source collection, geocoding or eligibility evaluation occurs.

Create produces a private draft with database-managed version 1. Update requires id and expected_version. The transaction locks the parent and performs `WHERE id = requested_id AND version = expected_version`; stale/zero-row updates return version_conflict. The database increments the version. The slug remains immutable. There is no hard-delete UI: archive preserves event/history relationships.

## Publication and audit

Workflow: draft -> review -> published -> unpublished or archived. Unpublished can return to review. Archive is terminal in this foundation. Content edits use the same transaction; state actions cannot sneak in simultaneous content changes.

Publishing requires review state and current verification, rejects pending duplicate reviews and explicit critical source conflicts, and executes all C03 publication guards before returning. Title/summary/organizer/category/official and registration destinations, trust, a successful source check, and matching checked source evidence are mandatory. Existing published content edits still obey C03 publication integrity. The editor never creates source observations or fabricates evidence; future approved ingestion/evidence workflows supply them.

Every successful command creates one event_changes record for the resulting version, with authenticated actor, action/reason, changed-field before/after values, timestamp and source evidence snapshot. Child tag/deadline changes appear in the same history. No password/token/API credential or student profile is included by the command. Existing append-only restrictions and FK-driven actor anonymization are preserved.

## Relationships, deadlines and eligibility

Organizer/category relations use existing foreign keys. Domain tags must match the interests vocabulary; skill tags must match the skills ID/slug pair. Category remains restricted to the five MVP categories. Vocabulary creation and source administration are not implemented here.

Tags/deadlines are optional explicit replacement collections. Omitting a collection leaves it unchanged; an empty collection explicitly removes associations, never means unrestricted eligibility. Deadline edits preserve stable IDs and creation times, reject IDs from other events, and require same-event source references. Kinds registration/submission/stage, precision, local date, known instant, timezone, active and primary state are supported. Existing database uniqueness enforces one active primary registration deadline. Child-only edits advance the parent version and record history.

Eligibility accepts null or the C03 version 1 AST: all/any, evidenced field-compatible predicates and explicit unresolved restrictions, with size/depth bounds. No scoring or eligibility evaluation was added.

## Interface and public service

/admin lists events with 25-row pagination, state and version. /admin/events/new creates drafts; /admin/events/[id] edits canonical fields, reviews existing evidence, performs state actions and displays history. Every page and action checks authorization. Unknown values are explicitly described. Archived records remain reviewable. Text is escaped, not interpreted as HTML.

The minimal editor uses ordinary fields/selects for canonical data and validated JSON textareas for the existing eligibility/metadata/tag/deadline structures. It exposes controlled vocabulary references on the edit page. These are functional administrative controls, not the final visual or collection-editing experience. Organizer/vocabulary selectors load up to 500 entries; large-vocabulary administration remains later work.

`readPublishedEvent({id}|{slug})` creates an independent anonymous client, explicitly filters published status, retrieves canonical data/organizer/category/tags/deadlines and only the existing five safe public source fields. It derives the primary registration deadline and rechecks publication/version after attribution retrieval. It does not expose drafts even when called from an admin context. No Explore/search/detail UI was added.

## Migration and environment

Added and applied `20260916000100_c05_event_commands.sql` to the intended hosted project vzuoscpwmytgibsxugcx. Before application, migration history matched the three C03 migrations. Dry run showed only the C05 function migration. After application, local and remote histories matched all four migrations. No reset, seed, table redesign or RLS weakening occurred.

The type generator now introspects public RPC argument/return types; regenerated database.types.ts includes mutate_event. No new packages or environment variables. .env.local remains ignored/untracked; privileged secrets remain server-only.

## Validation actually run

| Command | Result |
| --- | --- |
| npm test | 66 passed: existing 42 C03/C04/security tests plus 24 C05 tests |
| npm run test:events | 24 passed |
| npm run db:types:check | Passed after clean migration replay |
| npm run typecheck | Passed |
| npm run lint | Passed |
| npm run build | Passed |
| npm run test:bundle | Passed, 14 browser assets |
| npm run test:boundary | Passed; actual privileged helper rejected in client import |
| npm run test:auth:hosted | 48 checks passed, exact temporary Auth/profile/membership fixtures removed |
| git diff --check | Passed |

C05 tests cover ordinary/anonymous denial, private drafts, valid/invalid publication, unpublish/archive, stale versions, competing expected-version edits, invalid URLs/dates/amounts/team/category/relations, deadline ownership/precision/uniqueness, controlled tags, eligibility, transaction rollback, audit contents/immutability, membership revocation, safe error mapping and the actual public reader through an anonymous PostgreSQL RLS adapter.

Hosted verification checks actual HTTP mutation authorization/CSRF, the admin form, the installed RPC's not-found response using an authenticated admin context, and all previous authentication flows. No synthetic event, organizer, evidence or connector was created in hosted production. Event lifecycle fixtures run in isolated PGlite PostgreSQL. The initial hosted probe invalidated its other test session through global signout; it was corrected to local signout and the full suite passed on rerun.

## Limits and review boundary

- PGlite tests use real PostgreSQL constraints/RLS but do not constitute a separate-connection hosted load/race test; the competing-edit check uses its serialized connection. Parent row locking plus conditional version updates implement the concurrency guarantee.
- Public reader tests use a narrow PostgREST-shaped adapter over real isolated RLS. Hosted C05 verification deliberately avoids production event writes and does not claim a full published-event browser journey there.
- Sources and vocabulary must be provisioned truthfully through existing trusted administration until their later-stage workflows exist. Evidence accuracy cannot be proven solely by a database constraint.
- C03's existing privileged direct-table grants are unchanged; callers outside these application services must use audited transactional writes. C05 application mutations all pass through the atomic command.
- Admin collection editing remains JSON-based. Final UI polish, source administration and large-vocabulary controls are deferred.
- Existing public-launch requirements remain: owned verified SMTP domain/inbox placement, HTTPS deployment smoke checks, edge rate limits and log redaction. Existing harmless Node module-type warning remains.

No C06, connector, recommendation, calendar, notification, AI or organizer-submission work was started. Review the uncommitted changes before authorizing a commit/push.

## Files changed

- package.json: C05 test command and suite inclusion.
- scripts/generate-db-types.mjs and src/lib/supabase/database.types.ts: RPC types.
- scripts/test-c04-hosted.mjs: retained auth checks plus C05 hosted boundary/probe coverage.
- src/lib/events/validation.ts, service.ts, public.ts: runtime contract, services, anonymous read model.
- src/components/event-editor.tsx: minimal canonical form.
- src/app/admin/page.tsx and src/app/admin/events/{new,[id],mutate}: list/edit/create/state/error flows.
- supabase/migrations/20260916000100_c05_event_commands.sql: atomic event command.
- tests/events/c05.test.mjs: isolated database/application tests.
- docs/section-36-c05-review.md and README.md: review and current boundary.
