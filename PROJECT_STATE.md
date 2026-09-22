# Project state

Updated 22 September 2026.

## Current release decision — Manual-Content Product Beta

The project owner's 22 September 2026 roadmap change supersedes the original source-first release sequence and external-source launch gates. Current implementation order and milestone status: docs/planning/implementation-roadmap.md. The original product requirements remain authoritative except for this explicit release/scheduling change.

- **Automatic external discovery/sync: DEFERRED, not completed.** No unapproved source is approved by this decision. FOSS United has not responded, as reported by the project owner; its activation conditions remain unresolved.
- **Preserve C07 research and C08/C08.5 connector infrastructure.** Do not delete or redesign the existing connector architecture. Its infrastructure/hosted verification completion is not live-ingestion completion.
- **Defer C09, C10 live-source-dependent cross-source ingestion/deduplication, C11 scheduled external-source syncing, and C17 expansion to 5–8 approved sources.** Resume after the product is complete and deployed, in order C09 → C10 → C11 → C17, with source permission gates still enforced.
- **Content path:** staff create, review and publish canonical events through the existing protected C05 backend; C06 Explore/Event Detail reads those published events. Manual entry does not automatically establish verification or grant source reuse rights.
- **C12 Search + filtering: implementation review approved; C12.5 full hosted sign-off received.** See docs/c125-hosted-verification.md. The single additive C12 migration is applied to the linked project; all six migration versions match. Real anonymous/authenticated RPC and hosted-backed Explore empty-state/form checks passed. All ten requested validation commands passed. No commit/push; stop after C12.5. C13 has not started and must not begin automatically.
- **Current order:** C12 → C13 → C14 → C15 → C16 → C18 → C19 → Google Calendar → universal .ics export → notifications → grounded AI assistant → organizer submissions → C20 → C21.
- The originally V0.2 product features are now required before beta deployment. C20 security/privacy/account deletion/policies and C21 production deployment/QA remain mandatory.
- External-source count, scheduled reliability and automatic-freshness gates are deferred to the later ingestion release. They are not passed, waived for source activation, or represented as beta capabilities. Manual-content provenance, honest verification, access controls and product QA remain required.
- The earlier roadmap update changed planning documents only. C12 added Explore/search and its additive migration; C12.5 applied that reviewed migration and verified hosted behavior without changing C12 behavior. Source settings and connector infrastructure remain unchanged. No synthetic production events were created; the exact temporary ordinary Auth account was deleted and final inventory/profile/admin counts matched the baseline.

## Recorded implementation checkpoints

- Product authority: docs/planning/student_opportunities_master_instructions.md.
- Technical baseline: docs/planning/section-35-planning-package.md; current release roadmap overrides: docs/planning/implementation-roadmap.md.
- C01–C06: complete, approved and committed/pushed to main.
- Latest implementation commit before C07 documentation: a2972aac4151e9f7766218d4597816cdc28ddabe (C06).
- C07: research review approved by the user; first-source activation and release source-count gates remain open.
- C07 committed/pushed: 366367f9e68da636adc5ca6c5f2b467de4751ddf.
- C08: approved, committed/pushed as e609508e24e3040532d30903d99b8a1d16736958.
- C08.5: additive migration applied to the linked hosted project; actual Storage/API privacy and exact cleanup passed. All eight validation commands passed. Hosted sign-off: docs/c085-hosted-verification.md.
- C08.5 committed as f74f736 (hosted runtime and Storage privacy verification).
- Current hosted sign-off: docs/c125-hosted-verification.md. Approved implementation review: docs/section-36-c12-review.md. Previous infrastructure review: docs/section-36-c08-review.md.
- C03 current security result: docs/c03-final-security-verification.md (supersedes older blocked reports).
- C04 current result: docs/section-36-c04-review.md and docs/c04-inbox-smoke-review.md.
- C05 review: docs/section-36-c05-review.md (its uncommitted status is historical; C05 was subsequently committed).

C06 adds public Explore and event details using anonymous RLS reads, stable 24-item keyset pagination and honest unknown/empty states. No C06 migration or environment change. Hosted inventory is currently empty; genuine hosted event-detail verification remains pending. Isolated fixture/browser tests and all requested regression commands passed.

.env.local is ignored/untracked. Never display secrets or commit local configuration. Use SUPABASE_SECRET_KEY only in the existing server-only helper.

No connector, source qualification, filtering, recommendations, profile, calendar, notification, AI or organizer-submission implementation was added in C06. C07 researched 15 distinct candidates; no production connector was added. FOSS United is the conditional first recommendation. See docs/sources/c07/qualification.md and first-connector.md. No fully unconditional source approval is claimed. C08 was explicitly authorized for generic synthetic/local work. No sources activated; C09 has not started. C08.5 hosted verification was approved on 17 September 2026.
