# C04 real-email verification

## Final C04 sign-off — 16 September 2026

PASS: a fresh disposable account completed signup through the native application form. Both confirmation and recovery emails were actually received in Gmail spam from the configured Resend test sender. The received custom templates led to the application's callback and explicit confirmation page, not Supabase's default verification flow.

PASS: explicit signup confirmation established a session and reached /account; token replay was rejected; logout removed protected access; the verified account logged in normally. The actual recovery email opened explicit authorization and then /reset-password. Password update succeeded, the old password failed and the new password reached /account. The exact temporary account was deleted and absence verified; dependent fixture data cascaded. No unrelated accounts were changed.

PASS: all eight validation commands reran successfully: 42 automated tests, database type check, TypeScript, lint, production build, 14-asset bundle scan, server-only boundary and 40 hosted regression checks with fixture cleanup. Credentials, passwords, tokens and email links are omitted from this report. .env.local remains ignored and untracked.

Final C04 implementation/security/real-email sign-off is granted. No C05 work. This verifies a local production Next.js build against hosted Supabase. Public launch still requires an owned verified sender domain, inbox-placement improvement, deployed HTTPS smoke testing and deployment-edge rate limits/log redaction. Resend's restricted test sender and spam delivery are not public-launch readiness.
