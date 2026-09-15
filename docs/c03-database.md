# C03 database foundation

Current status: hosted integration has been verified. See
[latest credential verification](c03-final-security-verification.md) for the
completed security sign-off and the migration to `SUPABASE_SECRET_KEY`.
The local-only limitations recorded below describe the initial C03 checkpoint.

C03 only. The C01/C02 base is committed as df7aa57. No C04 auth UI, auth routes,
session-refresh proxy, ingestion, calendar, AI or event CRUD endpoints are added.
The homepage still makes no database requests.

## Files and migrations

- supabase/migrations/20260912000100_c03_schema.sql: 17 tables, indexes,
  foundational checks, category vocabulary and immediate deny-by-default RLS.
- supabase/migrations/20260912000200_c03_security.sql: grants, 36 RLS policies,
  safe source view, publication/evidence guards, version/merge/audit triggers.
- supabase/migrations/20260912000300_c03_eligibility_contract.sql: bounded,
  versioned eligibility JSON structure. No eligibility scoring/evaluation.
- supabase/config.toml: local PostgreSQL 17, public API schema only, explicit
  grants, 100-row API cap, no event/test seed files. No hosted project linked.
- src/lib/supabase/: separate client.ts, server.ts, service.ts, public-env.ts,
  and generated database.types.ts.
- tests/database/: real SQL migrations and role tests in isolated PostgreSQL.
- tests/security.test.mjs: source import boundaries, key classification and
  local secret/Git history checks, including newly added files.
- scripts/: database type generation/checking, negative Next.js build boundary
  test, and post-build browser asset secret scan.
- package.json/lockfile, .gitignore, eslint.config.mjs, .env.example and README:
  dependencies, scripts, scratch exclusions and setup documentation.

Tables: profiles, interests, skills, user_interests, user_skills, organizers,
event_categories, event_tags, events, event_deadlines, event_sources,
event_changes, source_connectors, sync_runs, saved_events, admin_memberships,
duplicate_reviews. Identity references Supabase auth.users; there is no duplicate
identity/password table.

Only the five agreed event categories are inserted by migrations. All events,
users and source records in the test suite are explicitly synthetic test fixtures
in disposable test databases; none are inserted into hosted Supabase.

## Access model

All 17 tables enable RLS. Anonymous and authenticated grants are revoked before
specific grants and policies are applied. The migrations do not weaken unrelated
tables or expose the private function schema through the API.

| Data | Anonymous | Ordinary authenticated user | Protected admin member |
|---|---|---|---|
| Events | Published only | Published only | Moderate all |
| Organizers | Linked to published events | Same | Manage all |
| Categories, interests, skills | Read vocabulary | Read vocabulary | Manage vocabulary |
| Tags/deadlines | Published parent only | Same | Manage all |
| Profile, interests/skills associations | No access | Own rows only | Own rows only |
| Saves | No access | Own rows; insert only published events; remove/reinsert associations | Same ownership restriction |
| Membership | No access | No rows; no writes | Read only; no writes |
| Source records/connectors, sync diagnostics, duplicate reviews | No access | No rows/mutations | Manage |
| Event history | No access | No rows | Read/append only |
| Public source view | Safe fields for published parents | Same | Same public projection |

private.is_admin() checks auth.uid() against admin_memberships using a fixed,
empty search_path. Editable user metadata is never consulted. Only a trusted
service-role operation or database administrator can provision/revoke membership.
Even administrators do not receive unrestricted access to student profiles/saves.

The service role bypasses RLS as designed but remains subject to constraints
and triggers. Do not use it for requests that should run in a student's context.

public_event_sources is deliberately a security-barrier, owner-executed view:
base source tables are private, so a security-invoker view would not provide
anonymous attribution. It selects only id, event_id, source_url, last_checked_at,
and source_name, filters published parents, and cannot be modified by API roles.
Never add raw snapshots, evidence JSON, policy records, contacts or errors to it.
Other application tables use direct RLS, not definer views.

## Invariants and indexes

The database has 51 indexes including primary/unique indexes. They cover stable
slugs, source identity (connector_id, external_id), ordered duplicate pairs,
idempotent saves, association keys, one active primary registration deadline,
published dates/location, category/organizer/source lookups, source scheduling,
sync history, and a GIN title/summary search vector. C12 will extend search to
organizer and tags; no search API is claimed at C03.

Checks enforce allowed states, positive team/year bounds, nonnegative known
amounts with currency, country/currency code format, geographic ranges, HTTPS URL
shape, nonempty arrays, and consistent date precision. An unknown field remains
null or an explicit unknown state. Empty arrays never mean unrestricted.
Date-only facts do not acquire midnight instants; known instants require an IANA
zone and matching local dates. PostgreSQL cannot determine whether a source
actually supplied midnight; evidence validation is still required in C05/C09.
URL constraints are syntax checks, not C08 SSRF protection or source approval.

Events keep separate lifecycle, registration, publication, verification status
and historical trust level. Publishing requires required event fields, a checked
source observation matching official/registration URLs, and checked evidence
entries for both URLs. Deferred guards also reject removing/reassigning the last
supporting evidence while the event stays published. Parent-row locks serialize
source changes with publication edits. Human/source corroboration cannot be
proved by a check constraint; authorized C05/C09 services must produce truthful
evidence before writing those records.

Event version starts at 1 and advances on update. Updates must use
WHERE id = expected_id AND version = expected_version and check affected rows.
The database manages the next version. Slug/id are immutable. Merge graph edits
use a lock and recursive cycle check; duplicate review stores reversal evidence.
Append-only history preserves field diffs and evidence snapshots. FK-driven
actor anonymization is the only permitted history update.

Eligibility JSON shape is {version: 1, expression: ...}. Expressions allow
all/any with nonempty rules, evidenced predicates over the planning-package
fields, and an explicit unresolved node with a reason for unsupported rules.
Predicates allow eq/in/gte/lte/unrestricted with field-compatible values.
An unresolved node is a representation of unknown facts, not a new eligibility
result or a claim of unrestricted participation. Payload/depth are bounded.
Application evaluation/scoring stays in C14.

## Environment and clients

The existing .env.local was inspected by variable name/presence only; secrets
were not displayed. It is ignored, untracked, and checked against Git history.

- NEXT_PUBLIC_SUPABASE_URL: project API URL.
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable key or legacy anon JWT.
- SUPABASE_SECRET_KEY: privileged key, read only in service.ts.

No new secret variable is needed for tests, migration replay or the holding page.
HTTP API keys are not PostgreSQL migration credentials. Hosted deployment will
need a separately selected project and authenticated CLI/database access; do not
paste secrets into shell commands, SQL migrations or reports.

The browser helper imports only public configuration. Both server modules import
server-only. The service client disables session persistence, URL detection and
automatic refresh. Clients are lazy; no privileged client is created by a Client
Component.

The server helper is per request and uses the user's cookies/public key. C04 must
provide a response cookie/header writer when refreshing or changing sessions and
verify identity with getClaims/getUser. It deliberately throws if cookie writes
are attempted without that writer; it does not silently lose auth updates.
C03 does not implement a complete authenticated request lifecycle.

## Repeatable validation

Use Node 24 and npm 11.17.0.

~~~sh
npm ci
npm test
npm run db:types:check
npm run test:boundary
npm run typecheck
npm run lint
npm run build
npm run test:bundle
~~~

npm test replays all three migrations into two clean in-memory PostgreSQL 17.5
instances (PGlite 0.3.16), creates explicit test-only roles/auth.uid()/auth.users
contracts, and executes SQL as anon, two users, admin and service_role. This is
actual PostgreSQL RLS/constraints, not mocked query responses. Fixtures roll back,
and the databases are discarded. No network or hosted key is needed.

The harness does not test Supabase Auth JWT verification, PostgREST behavior,
Storage, multi-connection races or managed extensions. Those claims require the
full Supabase stack. The negative build test proves Next rejects the actual
service helper when imported into a Client Component; the asset scan separately
checks successful production output for private environment values.

Generate types after changing migrations using npm run db:types. The generator
introspects the replayed schema; types cover row/insert/update/FK relationships.
SQL checks remain the authority for constrained text values. Generated types
do not replace runtime validation or RLS.

## Full Supabase follow-up

Docker/Podman is absent on this host. supabase status was attempted and failed
for that exact reason. No hosted SQL was executed or reset.

When Docker is available, use the project's pinned CLI:

~~~sh
npm run db:start
npm run db:reset:local
~~~

The reset script is explicitly local and destructive only to that local project.
Never substitute a hosted database URL or --linked flag into a reset command.
Replay and check policies over PostgREST on the isolated Supabase stack before
hosted rollout. Select/inspect the target and migration history before applying
the three additive migrations to a hosted environment.

C03 implementation and isolated PostgreSQL/security verification are complete.
Full Supabase integration verification remains an explicit pre-rollout gate;
no Auth/PostgREST/hosted pass is claimed. Stop at this review boundary.
