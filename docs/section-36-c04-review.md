# Section 36 — C04 final review

## Final C04 sign-off — 16 September 2026

PASS: a fresh disposable account completed signup through the native application form. Both confirmation and recovery emails were actually received in Gmail spam from the configured Resend test sender. The received custom templates led to the application's callback and explicit confirmation page, not Supabase's default verification flow.

PASS: explicit signup confirmation established a session and reached /account; token replay was rejected; logout removed protected access; the verified account logged in normally. The actual recovery email opened explicit authorization and then /reset-password. Password update succeeded, the old password failed and the new password reached /account. The exact temporary account was deleted and absence verified; dependent fixture data cascaded. No unrelated accounts were changed.

PASS: all eight validation commands reran successfully: 42 automated tests, database type check, TypeScript, lint, production build, 14-asset bundle scan, server-only boundary and 40 hosted regression checks with fixture cleanup. Credentials, passwords, tokens and email links are omitted from this report. .env.local remains ignored and untracked.

Final C04 implementation/security/real-email sign-off is granted. No C05 work. This verifies a local production Next.js build against hosted Supabase. Public launch still requires an owned verified sender domain, inbox-placement improvement, deployed HTTPS smoke testing and deployment-edge rate limits/log redaction. Resend's restricted test sender and spam delivery are not public-launch readiness.

## Implementation record

## Behavior and configuration

Added login, signup, forgot-password, reset-password, callback/confirmation,
account and admin routes. Next.js Proxy refreshes and propagates cookies; page guards
verify identity server-side. Admin membership is checked through protected RLS records.
Recovery requires a verified recovery token plus a short-lived signed user/session-bound
HttpOnly cookie. A normal login cannot authorize a recovery password change. Profile
bootstrap writes user_id only and leaves unknown facts null.

Added APP_URL and AUTH_COOKIE_SECRET; the latter was generated locally without display.
.env.local remains ignored and untracked. SUPABASE_SECRET_KEY remains server-only.
No database migrations, RLS changes, dependencies, event CRUD or later features added.

Supabase dashboard setup is required before real email use: matching Site URL and
callback allowlist; the supplied confirmation and recovery templates; email confirmation;
production SMTP; matching password policy. Rate limiting at the trusted deployment edge
and auth URL/body redaction in hosting logs are release requirements. The local process
burst guard supplements Supabase limits and is not a distributed rate limiter.

See c04-authentication.md for full architecture, cookie behavior, exact setup and
limitations. Supabase local config/templates are prepared; Docker/Inbucket was unavailable.

## Files changed

- .env.example
- README.md
- docs/c04-authentication.md
- next.config.ts
- package.json
- scripts/check-client-bundle.mjs
- scripts/test-c04-hosted.mjs
- src/app/account/page.tsx
- src/app/admin/page.tsx
- src/app/auth/[action]/route.ts
- src/app/auth/callback/route.ts
- src/app/auth/confirm/page.tsx
- src/app/error.tsx
- src/app/forgot-password/page.tsx
- src/app/login/page.tsx
- src/app/page.tsx
- src/app/reset-password/page.tsx
- src/app/signup/page.tsx
- src/components/auth-page.tsx
- src/lib/auth/config.ts
- src/lib/auth/handlers.ts
- src/lib/auth/identity.ts
- src/lib/auth/policy.ts
- src/lib/auth/recovery.ts
- src/lib/supabase/client.ts
- src/lib/supabase/request.ts
- src/lib/supabase/server.ts
- src/proxy.ts
- supabase/config.toml
- supabase/templates/confirmation.html
- supabase/templates/recovery.html
- tests/auth-handlers.test.mjs
- tests/auth.test.mjs
- tests/security.test.mjs

## Hosted checks

- PASS: production Next.js test server starts
- PASS: anonymous public route /
- PASS: anonymous public route /login
- PASS: anonymous public route /signup
- PASS: anonymous public route /forgot-password
- PASS: anonymous account access denied
- PASS: anonymous admin access denied
- PASS: invalid PKCE callback fails safely
- PASS: invalid recovery token fails safely
- PASS: cross-origin auth POST rejected
- PASS: GET cannot log a user out
- PASS: incorrect password fails without provider detail
- PASS: unverified user cannot log in
- PASS: valid login establishes cookie session
- PASS: server resolves own account and does not expose user B
- PASS: private page is not shared-cacheable
- PASS: editable metadata cannot grant admin route access
- PASS: already authenticated login redirects
- PASS: ordinary login cannot authorize recovery reset
- PASS: second user retains independent session
- PASS: invalid expired session fails closed
- PASS: test admin provisioned through privileged membership only
- PASS: protected member accesses administrator route
- PASS: membership revocation immediately removes route access
- PASS: profile bootstrap preserves unknown student information
- PASS: Proxy refreshes expired cookie session and propagates new cookies
- PASS: signup token cannot be reinterpreted as recovery authorization
- PASS: email link requires explicit confirmation and suppresses referrer
- PASS: real signup verification establishes session with safe redirect
- PASS: verified signup reaches protected destination
- PASS: consumed verification link cannot be replayed
- PASS: verified recovery creates session-bound HttpOnly authorization
- PASS: verified recovery opens reset page
- PASS: user A recovery marker cannot authorize user B password reset
- PASS: recovery updates password and signs out
- PASS: password reset clears authenticated browser access
- PASS: new password works
- PASS: old password no longer works
- PASS: logout completes
- PASS: logout removes protected access
- PASS: exact temporary Auth fixture deletion; profile/membership dependents cascade.

No application credential, password, email token or HTTP response content is included.
