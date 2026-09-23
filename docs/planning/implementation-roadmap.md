# Implementation roadmap and milestone status

Updated 22 September 2026. Current release: **MANUAL-CONTENT PRODUCT BETA**.

## Decision and authority

The project owner explicitly directed this roadmap change on 22 September 2026: FOSS United has not responded, and live external-source permission/integration work must not block completion of the product. This decision overrides the original implementation order and source-dependent launch gates in `section-35-planning-package.md` and the master brief for the current beta only. All unaffected product, stack, security, provenance, verification and recommendation requirements remain in force.

**Automatic external discovery and syncing are DEFERRED, not completed.** No source is approved or activated by this change. C07 research and C08/C08.5 infrastructure are retained as implemented; do not delete or redesign the connector architecture, remove its guards, or alter source approval records to enable manual content.

Events are created, reviewed and published through the existing protected C05 admin/event backend. C06 Explore and Event Detail consume these canonical published events. Manual content uses the existing publication and evidence requirements. It does not mean scraped content can be republished without permission, nor that staff entry automatically earns a Verified badge. Unknown facts remain unknown; review timestamps describe actual checks rather than implying automated refresh.

No application code, migration, dependency, source registration, network collector, scheduled job or deployment is changed by this planning task. Future implementation work follows the order below. No delivery date or new completion claim is inferred.

## Changes from the previous roadmap

| Previous sequencing or gate | Current decision |
|---|---|
| Live C09 → C10 → C11 before C12 | Start C12 on existing C05/C06 canonical data; defer live-source work |
| C17 source expansion before C18 | C18 follows C16 and completes manual-content administration; source expansion is not a dependency |
| 5–8 approved sources and scheduled refresh needed for the first release | These remain future ingestion-release gates; the current release is explicitly a manual-content beta |
| Calendar, notifications, AI and submissions after the first release | Implement these originally V0.2 product features after C19 and before C20/C21 |
| C20/C21 after C19 | C20/C21 follow the product feature sequence below |
| Source-first M3/M5 milestones | Separate completed infrastructure from deferred live ingestion; split manual operations from future source coverage |

## Preserved work and current status

| Work | Status | Evidence / qualification |
|---|---|---|
| C01–C04 foundation, database, auth | COMPLETE — recorded sign-off | Existing project state and C03/C04 review documents |
| C05 canonical event/admin backend | COMPLETE — preserved | `docs/section-36-c05-review.md`; protected creation/review/publication remains the beta content path |
| C06 public Explore/Event Detail | COMPLETE — preserved | `docs/section-36-c06-review.md`; recorded hosted inventory was empty and genuine hosted detail verification remains a beta QA item |
| C07 source research | RESEARCH REVIEW APPROVED — preserved | `docs/sources/c07/`; first-source activation and source-count gates remain unresolved/deferred, not completed |
| C08 connector infrastructure | COMPLETE — preserved | Commit `e609508`; `docs/c08-connector-infrastructure.md`; synthetic/local scope does not establish a live connector |
| C08.5 hosted infrastructure verification | COMPLETE — preserved | Commit `f74f736`; `docs/c085-hosted-verification.md`; recorded source/enablement/sync-run counts were zero |

These are recorded prior results, not fresh production verification performed in this planning task. Historical C07 conditional recommendations remain research evidence, not permission to activate a source. The project owner's report that FOSS United has not responded is the current decision input.

## Current implementation order

C12/C12.5 are complete and committed/pushed in `d5b0d0434d57c867ac062dba05a7bad245b4067c`; their migration/hosted sign-off is recorded in `../c125-hosted-verification.md`. C13 is complete, approved and committed/pushed in `3b6e7f62f39936aafa6bc6c8197c5f8431bf5c69`. C14 is complete — review approved; see `../section-36-c14-review.md`. C15 is complete — review approved; see `../section-36-c15-review.md`. C16 is implemented — awaiting review; see `../section-36-c16-review.md`. C18 and subsequent product work are NOT STARTED. C14 is committed/pushed as `e7ddee75d136a34e2fb9f21f119ff59c5cb9737f`. C15 is committed/pushed as `3132e259e4929603cc75dc3c21c532e0c184c872`. C16 must not be committed/pushed before review approval. The deferred source sequence below is unchanged. Codex owns implementation and verification; the project owner supplies provider/deployment configuration where required. These are ordered work items, not concurrent assignments or calendar promises.

| Order | Task | Active dependency and completion scope |
|---|---|---|
| 1 | **C12 — Search + filtering** | Existing C05/C06 canonical published events; remove C11 prerequisite. Complete required filters, text search, supported sorts, URL state and pagination. Preserve honest unknown handling |
| 2 | **C13 — Full student profile** | C12 and existing auth; profile fields, interests, skills and preferences, validation and private ownership |
| 3 | **C14 — Eligibility + recommendations** | C13; source-grounded/record-grounded rules, unknown handling, existing weighted scoring and explanations; manual entry cannot imply eligibility certainty |
| 4 | **C15 — For You + complete event experience** | C14; full event information, relevance explanations, official links and truthful availability/verification |
| 5 | **C16 — Saved events** | C15; persistent, idempotent, private saves and Saved view. Do not implement deferred cross-source merging to satisfy the old merged-event test; retain existing behavior and defer that integration test with C10 |
| 6 | **C18 — Complete admin experience** | C16 plus C05; complete manual event creation/review/publication, editing, verification and history. Preserve existing source/infrastructure visibility, showing deferred/inactive states. Do not enable external refresh or pull C10/C11/C17 forward |
| 7 | **C19 — Final visual design + homepage + motion** | C18; discovery homepage, responsive final design, useful motion, keyboard/focus/contrast/reduced-motion behavior; no automatic-discovery or live-freshness claims |
| 8 | **Google Calendar — originally V0.2** | C19 plus auth/canonical dates; provider consent/configuration, private token handling, export identity and revocation/failure behavior |
| 9 | **Universal .ics export — originally V0.2** | Google Calendar work completed; canonical dates with correct time zones, date precision and stable UIDs; exports do not imply external-source refresh |
| 10 | **Notifications — originally V0.2** | Calendar/export work; in-app/email reminders, relevant new published events and changes to canonical published events; preferences and idempotent delivery. Admin edits/publication supply change signals during beta |
| 11 | **Grounded AI assistant — originally V0.2** | Notifications completed; retrieve permitted canonical events and retained evidence, enforce user-data access, cite official links and distinguish unknowns; no live-source connector dependency or invented facts |
| 12 | **Organizer submissions — originally V0.2** | AI work completed; validate submissions, review possible duplicates against the canonical catalogue, verify and moderate before publication through protected services. Manual review can address suspected duplicates; cross-source ingestion/deduplication stays deferred |
| 13 | **C20 — Security/privacy/account deletion/policies** | Product features above completed; review the complete product, provider tokens, private profiles/chats/notifications, deletion, privacy/terms and retained content rights. No external catalogue approval requirement for unused integrations |
| 14 | **C21 — Production deployment and QA** | C20; deploy and verify the complete manual-content beta, with build/lint/types/tests, real published-content journey, privacy/authorization, recovery and rollback evidence |

The order between the originally V0.2 features is the requested work sequence, not a claim that .ics technically requires Google OAuth. Calendar/email/AI provider configuration remains necessary for those features; the deferral concerns external **event-source** integrations. Security controls remain mandatory during every implementation step; C20 is the final comprehensive review, not the first time security is applied.

## Deferred work — after product completion and deployment

Resume only after C21's beta deployment and QA exit gate, in this exact order:

| Order | Task | Status | Reactivation requirements |
|---|---|---|---|
| 1 | C09 — First live connector | **DEFERRED — not completed** | C07 permission conditions satisfied for the selected source, reviewed attribution/retention/publication evidence, preserved C08/C08.5 infrastructure; no approval inferred from a missing reply |
| 2 | C10 — Live-source-dependent cross-source ingestion/deduplication | **DEFERRED — not completed** | C09; canonical association/merge safety, replay/concurrency, provenance preservation and adjudicated duplicate cases |
| 3 | C11 — Scheduled external-source syncing | **DEFERRED — not completed** | C10; approved source limits/policies, leases/checkpoints, bounded retries, observable sync/freshness and failure handling |
| 4 | C17 — Expansion to 5–8 approved external sources | **DEFERRED — not completed** | C11 and individual approval for every source; distinct-source coverage and recorded scheduled reliability |

Generic connector protections and isolated idempotency/lease tests already completed under C08 remain intact. Deferring C10 does not remove existing database uniqueness or C05 publication validation. No broader deduplication architecture change is authorized here.

## Milestone status

Original milestone IDs remain visible so deferred work cannot be mistaken for completion. The mixed M5 milestone is split explicitly; product-feature milestones are inserted ahead of M6.

| Milestone | Status on 22 September 2026 | Current meaning / exit evidence |
|---|---|---|
| M0 — Planning baseline | COMPLETE; roadmap amended | Original Section 35 baseline plus this explicit owner-directed change |
| M1 — Foundation | COMPLETE — recorded | Existing C01–C04 sign-offs; preserve working auth/database/access controls |
| M2 — Event vertical slice | IMPLEMENTATION COMPLETE; hosted content QA pending | C05/C06 preserved; genuine hosted published-event journey must be verified by C21 |
| M3 — First ingestion slice | **DEFERRED; not complete** | C07 research/C08 infrastructure/C08.5 verification complete within scope; live C09/C10 still deferred |
| M4 — Discovery and relevance | IN PROGRESS; C12 approved with C12.5 hosted sign-off | C12 migration applied and hosted empty-inventory/API/UI checks passed; C13–C15 complete and review-approved; C16 implemented awaiting review. Stop before C18 |
| M5a — Manual-content operations and presentation | NOT STARTED | C18 → C19; usable protected admin and finished public experience |
| M5b — External-source coverage and operations | **DEFERRED; not complete** | C11/C17 after deployment; 5–8 approved sources and operational evidence still required later |
| Product features originally V0.2 | NOT STARTED; required before M6 | Google Calendar → .ics → notifications → grounded AI → organizer submissions |
| M6 — Manual-content beta release readiness | NOT STARTED | C20 → C21; complete product/security/policies, production deployment and QA under beta criteria below |

M5 as originally defined is **not complete**: its source-coverage component is deferred even after M5a ships. Deploying the beta will not mark M3, M5b, C09, C10, C11 or C17 complete.

## Beta release acceptance and deferred gates

Required for the beta:

- Staff can create, review, correct, publish and unpublish canonical events with protected authorization, evidence, official links, audit history and honest verification. Nonpublished events remain inaccessible publicly.
- Public Explore/Event Detail, search/filtering, profile, eligibility/recommendations, For You and saves work with those canonical events. Empty and unknown states remain explicit.
- Google Calendar, .ics, notifications, grounded AI and moderated organizer submissions work and pass feature-specific checks. Notifications reflect stored/admin-reviewed changes; AI answers are grounded in available records and evidence.
- Published content is legitimate for the intended use, with correct attribution and manually reviewed facts where required. No source is bulk-collected or activated as a shortcut to populate the beta; synthetic fixtures are not presented as genuine opportunities.
- C20 privacy, security, deletion and policies and C21 deployed QA/recovery checks pass, including the previously pending genuine hosted event-detail journey. Existing baseline quality gates remain applicable.
- Public copy identifies a manual-content beta and does not claim automatic external discovery, automatic source refresh, exhaustive opportunity coverage, or 5–8 operational sources. Last-checked times and verification describe actual evidence.

Deferred to the later ingestion release, **not passed**: first live source qualification/activation, cross-source ingestion/deduplication acceptance, scheduled external refresh, three successful source cycles, seven-day automatic freshness observations, and the 5–8-source target. No release blocker is carried forward merely because an unused candidate has not granted ingestion permission. If the beta uses a source's content manually, its applicable content rights still matter.

## Planning validation and next action

**C12 implementation is approved and C12.5 hosted verification is complete.** The single reviewed migration was applied; all local/remote versions match. Empty-inventory RPC and hosted-backed Explore checks passed. No synthetic event inventory, source activation, public deployment, commit or push occurred. Stop after C12.5; C13 must not start automatically.
