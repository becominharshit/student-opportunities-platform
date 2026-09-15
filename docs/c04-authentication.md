# C04 authentication review

C04 implementation only, based on committed C03 `9f86278488d286c3a37627486efe48bce279316f`.
No C05 event CRUD, ingestion, recommendation, calendar, notification, AI or profile editor work is included.

## Architecture and routes

The existing Supabase SSR/client foundation is preserved. Browser and user-context
operations use the publishable key. No application auth flow imports the privileged
service client. The service client is used only by the explicit hosted test runner
to create and remove its exact temporary fixtures and provision its test administrator.

| Route | Behavior |
|---|---|
| `/login` | Email/password form; verified logged-in users continue to a safe destination |
| `/signup` | Email/password/confirmation form; pending verification is not claimed as success |
| `/forgot-password` | Generic recovery-email request response |
| `/reset-password` | Requires verified identity and valid recovery authorization |
| `/auth/callback` | Exchanges PKCE codes; email-hash links continue to explicit confirmation |
| `/auth/confirm` | Displays an explicit confirmation step without consuming the email link |
| `/auth/[action]` | Same-origin, bounded form POSTs for login/signup/logout/forgot-password/reset-password/verify |
| `/account` | Server-protected account destination, verified email only; no C13 editor |
| `/admin` | Server-protected membership demonstration; no event administration |

`src/proxy.ts` uses Next.js 16 Proxy to refresh sessions for auth/protected pages.
It passes every changed cookie chunk into the downstream request and the browser
response, preserving Supabase cache headers. Auth mutation handlers own their own
cookie writes. The C03 Server Component client remains read-only after refresh;
it does not silently discard cookie-writing errors. Every protected page independently
calls `getUser`; Proxy or cookie contents alone never authorize access.

All private/auth responses are `private, no-store`; auth pages send only the origin as referrer (strict-origin), never a token-bearing
path/query, and prevent framing. Supabase session cookies use SameSite=Lax, host-only scope, path `/`,
and Secure for an HTTPS APP_URL. They remain JavaScript-readable for compatibility
with the existing Supabase browser client. The additional recovery cookie is HttpOnly.
Native form POST/303 navigation ensures login/logout do not reuse stale client route state.

## Signup, verification, recovery and logout

Signup invokes Supabase Auth with a canonical callback URL. If no session is returned,
the page tells the user to check email without claiming verification. Duplicate/signup
errors use the same neutral state. Login errors do not expose provider details; the
message suggests checking credentials and email verification. Supabase remains the
identity/password store.

The supplied email templates link to `/auth/callback?token_hash=...&type=signup`
or `type=recovery`. Callback forwards to a no-cache confirmation page. Only the
explicit same-origin POST consumes the one-time token via `verifyOtp`; link previews
and email scanners cannot consume it merely by GET. A valid signup token creates
a session and reaches `/account`. PKCE code callbacks also support signup in the
browser holding the verifier; missing/expired/verifier-mismatched codes fail safely.

Recovery email requests deliberately return the same generic response for existing
and nonexistent accounts. After Supabase verifies a recovery token, the server issues
a 15-minute HMAC-signed HttpOnly marker bound to the verified user and session ID.
Both the reset page and the update handler verify it. An ordinary login, modified
query parameter, client role, or another user's recovery marker cannot grant reset
authority. The new password and confirmation are validated before `updateUser`.
Successful reset clears recovery state and signs out globally; the user then logs
in with the new password. Logout normally signs out locally and clears the local
session; provider failure is reported rather than falsely claiming success.

**The recovery template is required.** A generic PKCE login/code callback is not
treated as proof of recovery. This intentionally avoids trusting the SDK's recovery
hint in a client-editable verifier cookie. Use the supplied recovery token-hash
template, not Supabase's default ConfirmationURL template for password recovery.

Signed access tokens already copied outside the browser may remain usable until
their expiry after signout; refresh-token revocation is not instantaneous access-JWT
revocation. Keep Supabase token expiry and rotation settings appropriate to production.

## Profiles and administrator authorization

No schema change is required. After verified login/confirmation, an idempotent
user-context insert creates `profiles(user_id)` if absent. All student facts remain
null. Existing rows are not overwritten. This supports C03's profile-owned relations
without inventing name, institution, country or preferences.

`requireAdministrator` first resolves verified identity, then queries the current
user's `admin_memberships` row under RLS and requires role `admin`. Membership is
rechecked on every request. No metadata/email/profile-based role or self-service
membership mutation exists. C03 RLS and migrations are unchanged. Future C05 actions
must call server authorization independently; this page guard is not a substitute.

## Environment and required dashboard setup

Existing Supabase variables are unchanged. Added:

- `APP_URL`: canonical origin, for example `http://localhost:3000` locally; HTTPS in production.
  The server never derives callback destinations from a user-supplied Host header.
- `AUTH_COOKIE_SECRET`: independent random 32-byte base64url secret, server-only.
  Store the same value across application instances. Rotating it invalidates pending
  recovery authorizations; it does not change Supabase signing keys.

Both were added to ignored local `.env.local` without displaying the signing key.
`.env.example` contains only the origin example and a blank secret field.

Before real email-based use, configure the hosted project:

1. Enable email/password signup and email confirmation. Set a minimum password length
   of 12 to match the form; retain refresh-token rotation.
2. Set Auth Site URL to APP_URL. Allow the exact callback URLs for `/auth/callback`,
   `/auth/callback?next=%2Faccount` and `/auth/callback?next=%2Fadmin` on approved origins.
   Do not add arbitrary production wildcard domains.
3. Copy `supabase/templates/confirmation.html` into Confirm signup and
   `supabase/templates/recovery.html` into Reset password. SiteURL must point to this
   application. These files and matching local config are supplied, but local config
   changes do not apply hosted dashboard settings.
4. Configure production SMTP and an approved sender. Supabase's default email service
   is restricted and not a production delivery solution. Verify both delivered email
   journeys in a real test inbox before opening signup publicly.
5. Apply auth rate limits at the deployment edge, keyed on the trusted client IP, and
   retain Supabase Auth limits. The included 20-attempt/minute per-action process guard
   is supplemental, not a shared distributed limiter. The proxy/hosting layer must
   overwrite forwarded IP headers. No new rate-limit service subscription is introduced.
6. Disable query-string/body logging for `/auth/*` in hosting, reverse proxies and
   monitoring. Next development incoming-request logging is disabled in this repo.
   Do not collect password fields, cookie headers or authentication links in analytics.

Local Supabase config now enables email confirmation, length 12 and the supplied
templates. Docker is unavailable here; full local Auth/Inbucket delivery was not run.

## Validation and evidence

`npm test` includes 42 passing tests: the unchanged C03 database/RLS access matrix,
credential/bundle source boundaries, redirect/input policy, recovery signature/expiry/
user/session binding, real handler behavior with a stubbed Supabase dependency,
same-origin/body limits, generic errors and burst limiting.

The explicit `npm run test:auth:hosted` runs a production Next.js server against
project `vzuoscpwmytgibsxugcx`. It uses clearly named temporary example.invalid accounts
and real Supabase-generated email-link tokens without dispatching email. It tests
public/protected/admin access, login failure/unverified accounts, metadata escalation,
two independent users, membership revocation, null profile bootstrap, refresh-cookie
propagation, signup confirmation/replay, recovery/reset/new versus old passwords and
logout. It removes only the exact Auth IDs it created, cascading dependent fixture rows.
No response body, password, credential, email token or app-server log is printed.

Build, lint, database type check, TypeScript, browser bundle scan and server-only
boundary test are recorded in the accompanying C04 review report. Hosted tests are
explicit and are not run by default with `npm test`.

## Scope and remaining release gates

## Final C04 sign-off — 16 September 2026

PASS: a fresh disposable account completed signup through the native application form. Both confirmation and recovery emails were actually received in Gmail spam from the configured Resend test sender. The received custom templates led to the application's callback and explicit confirmation page, not Supabase's default verification flow.

PASS: explicit signup confirmation established a session and reached /account; token replay was rejected; logout removed protected access; the verified account logged in normally. The actual recovery email opened explicit authorization and then /reset-password. Password update succeeded, the old password failed and the new password reached /account. The exact temporary account was deleted and absence verified; dependent fixture data cascaded. No unrelated accounts were changed.

PASS: all eight validation commands reran successfully: 42 automated tests, database type check, TypeScript, lint, production build, 14-asset bundle scan, server-only boundary and 40 hosted regression checks with fixture cleanup. Credentials, passwords, tokens and email links are omitted from this report. .env.local remains ignored and untracked.

Final C04 implementation/security/real-email sign-off is granted. No C05 work. This verifies a local production Next.js build against hosted Supabase. Public launch still requires an owned verified sender domain, inbox-placement improvement, deployed HTTPS smoke testing and deployment-edge rate limits/log redaction. Resend's restricted test sender and spam delivery are not public-launch readiness.

No dependencies, database migrations, or RLS policies were added.

References checked during implementation:
[Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).
