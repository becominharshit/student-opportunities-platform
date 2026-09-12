# Hosted C03 verification — 12 September 2026

## Status
C03 database implementation is committed, pushed, and functionally verified on hosted Supabase.
C03 is NOT fully security-signed-off: an older private key committed to GitHub remains active.
C04 was not started. No database design was modified.

## Git
- Foundation commit: e4a24c5 — feat: add Supabase database foundation and RLS.
- Merge/push: 91aafdd — reconciled remote main without tracking local secrets.
- The remote-only change was commit d485c59 adding .env.local. Its file was excluded
  from the merged tip; the existing ignored local .env.local was preserved.
- The blank .env.example was restored and committed.
- No force push or history rewrite was performed.
- The historical private credential still exists in Git history. Removing the file
  from the current branch does not revoke it.

## Intended hosted project
- Project: student-opportunities-platform
- Reference: vzuoscpwmytgibsxugcx
- Status reported by authenticated Supabase CLI: ACTIVE_HEALTHY, linked=true.
- Current local API URL matches that project.
- Region: ap-northeast-2.
- Hosted PostgreSQL: 17.6; isolated tests use 17.5. No compatibility change required.

## Migration history and application
Migration history was inspected BEFORE any push. All three migrations were already recorded:
- 20260912000100 — c03_schema
- 20260912000200 — c03_security
- 20260912000300 — c03_eligibility_contract

Recorded statement bodies match local SQL after comment/whitespace/separator normalization.
Both dry-run and actual supabase db push --linked returned upToDate=true with zero pending
migrations. No migration was re-applied, reset, repaired, or destructively replaced.

## Hosted catalog verification
- All 17 requested tables exist and have RLS enabled.
- All 36 intended policies exist with the intended roles and predicates.
- public_event_sources contains only id, event_id, source_url, last_checked_at, source_name.
- Initial events, profiles and saves were empty.

## Hosted Auth/PostgREST verification
Temporary Auth users A, B and Admin were created through the Admin API with auto-confirmed
test-only addresses; no invitation or verification mail was sent. They signed in through
real Supabase Auth. Temporary opportunity fixtures were clearly named C03 TEST ONLY.

Verified:
- Anonymous clients read a published fixture and cannot read its unpublished counterpart.
- Profiles, saves, admin records, event sources, source connectors, sync diagnostics,
  event history and duplicate reviews are not publicly readable.
- A cannot read, update or delete B's profile.
- A cannot read, modify or delete B's saved event.
- Users cannot save an unpublished event.
- Editable admin user metadata does not grant privileges.
- Normal users cannot insert admin membership or modify events.
- Protected membership allows staff to read drafts and moderate them.
- Staff membership does not bypass student-profile privacy.
- Revoking membership immediately removes admin visibility.
- Public source view returns exactly its five safe fields.
- B's profile and save remain unchanged after attempted cross-user mutations.

Cleanup used exact test IDs only. Hosted SQL confirmed zero remaining test Auth users,
events, profiles, saves, memberships, test source, test connector or test organizer.
No existing user or event data was deleted. No hosted reset was run.

## Next.js client connectivity and secret boundary
- Actual browser/public helper connected to hosted category data.
- Actual server-only service helper connected to all 17 tables.
- Actual request-context server helper connected from a temporary local Next.js Route Handler.
- The application homepage/routes were not modified to add C04 flows.
- The current private key was not displayed or copied into source/client code.
- Browser asset scan found no private environment value or service-key reference in 11 assets.

## Requested command results
- npm test: 28/28 passed.
- npm run db:types:check: passed.
- npm run typecheck: passed.
- npm run lint: passed.
- npm run build: passed with current .env.local.
- npm run test:bundle: passed.

The automated history check tests the current local key. It does not establish that every
older credential in history is revoked; the separate hosted check below exposed that gap.

## Confirmed security blocker
GitHub commit d485c59 contains an older private Supabase key. It differs from the current
local key, but a read-only request using it to the hosted Auth admin endpoint returned HTTP 200.
The response body was discarded; no user details or credential values were displayed.

The current key being correct is not proof that the older key is revoked. Revoke the exposed
older credential in Supabase and confirm it is rejected, while retaining the current configured
credential. If it is a legacy service-role JWT, follow Supabase's legacy-key revocation/rotation
controls and account for other consumers. No automatic credential revocation was performed.

After revocation, recheck the historical credential and current-client connection. Consider
repository-history cleanup separately; it is not a substitute for revoking the exposed key.

## Conclusion
Hosted C03 functional verification is complete. Full C03 sign-off remains blocked only by
the confirmed active exposed historical credential. No C04 work was performed.

