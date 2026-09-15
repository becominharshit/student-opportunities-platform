# C03 final security verification — 15 September 2026 (Asia/Calcutta)

**Full C03 security sign-off is granted.** All three historical credential checks
now reject access, both current keys work, and the actual server-only helper works.
The full existing validation suite passed on 15 September 2026.
Sign-off covers the C03 foundation and the credential verification below.

## Read-only credential checks
Project: vzuoscpwmytgibsxugcx.
Latest recorded check: 2026-09-15T09:08:51.491Z (15 September locally).

| Check | HTTP status | Result |
|---|---|---|
| Historical credential, Auth admin endpoint | 401 | Rejected; PASS |
| Historical credential, Data API | 401 | Rejected; PASS |
| Historical bearer with current publishable API key, Auth admin endpoint | 403 | Rejected; PASS |
| Current publishable key, public category Data API | 200 | PASS |
| Current secret key, Auth admin endpoint | 200 | PASS |
| Updated actual server-only helper, private-table HEAD request | 200 | PASS |

The previously accepted historical bearer is now rejected. The verification
command exited successfully. No credential values or response contents were logged.

All response bodies were discarded without displaying their contents.
No hosted data or credential settings were changed during this verification.

## Environment migration completed
The current private key is a new sb_secret_ key. Renamed the local configuration
from SUPABASE_SERVICE_ROLE_KEY to SUPABASE_SECRET_KEY, preserving its value.
There is no legacy fallback in application code.

Updated:
- .env.example and ignored .env.local
- src/lib/supabase/service.ts
- tests/security.test.mjs
- scripts/check-client-bundle.mjs
- README.md and docs/c03-database.md
- scripts/verify-c03-credentials.mjs (new read-only verification command)

The server client remains guarded by import "server-only", rejects a non-secret
key configuration, and disables session persistence/refresh/URL session detection.
Source and browser-bundle guards check both variable names to catch regressions.
The legacy name remains only in historical-credential checks and negative safeguards.
Unchanged product/planning source documents and historical reports remain archival.

## Validation rerun on 15 September 2026
- npm test: 28 passed.
- npm run db:types:check: passed.
- npm run typecheck: passed.
- npm run lint: passed.
- npm run build: passed.
- npm run test:bundle: passed; 11 browser assets checked.
- npm run test:boundary: passed; Next.js rejected privileged client-side imports.
- Updated actual service helper connected successfully using SUPABASE_SECRET_KEY.
- git diff --check: passed.
- .env.local remains ignored and untracked; current private key was not exposed.

Repeat the read-only hosted credential check from the repository:
~~~sh
node scripts/verify-c03-credentials.mjs
~~~
It reports status codes only and exits nonzero unless the old key is rejected
(including its use as a bearer) while current keys continue to work.

## Sign-off and remaining limitations
The historical credential is rejected on all three requested paths. The remaining
credential blocker is resolved by these observed results following the user-reported
legacy signing-key revocation. C03 receives full security sign-off.

The historical credential remains in Git history but is rejected in all tested modes.
Current secrets remain ignored and untracked. Docker remains unavailable; clean
migration replay and RLS tests use isolated PGlite, supplemented by the previously
completed hosted integration verification. This turn did not repeat that full hosted
fixture suite or alter hosted data, migrations, or credential settings.

No application code or C04 work was added. The earlier environment-variable migration
and the updated security documentation remain local and uncommitted.
