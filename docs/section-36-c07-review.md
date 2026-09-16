# Section 36 — C07 review

16 September 2026. Baseline: main, C06 commit a2972aac4151e9f7766218d4597816cdc28ddabe. Master instructions, Section 35 package, repository instructions, project state and current C03–C06 reviews informed this assessment.

## Result

Research deliverables are complete for 15 distinct candidates. **C07 first-source qualification remains conditional; live activation is not signed off.** There are zero unconditional APPROVED sources, five CONDITIONALLY APPROVED, five PERMISSION REQUIRED, four UNRESOLVED and one NOT APPROVED for the assessed method. The V0.1 goal of 5–8 approved sources is not met. Conditional candidates must not be counted as enabled integrations.

Recommend FOSS United's documented ICS feed for first implementation after scope clarification and attribution/publication conditions close. It offers India-focused organizer events and upstream UIDs. Exclude third-party grant events, media and unsupported categories. A feed URL or reuse licence alone cannot establish a verified registration link, precise unknown time or student eligibility.

## Deliverables

- [Qualification table](sources/c07/qualification.md)
- [Structured register: all research criteria, policies, limits, IDs, dates, contacts and expiry](sources/c07/source-register.json)
- [First-connector decision, exact interface, fields and future fixture plan](sources/c07/first-connector.md)
- [Remaining permission requests](sources/c07/permission-requests.md)
- [HTTP status/timestamp/hash evidence](sources/c07/evidence-observations.json)
- [Minimal real factual sample with attribution](sources/c07/observed-sample.json)

PROJECT_STATE.md now records C06's approved commit and C07's actual status. No application code, package, database, environment variable, migration or production source record was changed. No permission requests were sent. No production connector or C08 work was started. The user approved the C07 research review and authorized committing and pushing this documentation. Source activation conditions remain unchanged.

## Important limitations

Some providers' policies/interfaces were inaccessible or insufficiently explicit. Those sources remain disabled; no internal API or bypass is proposed. Robots rules are additional constraints, never a republication licence. Google approval is limited to a specifically licensed Search Central page, not its general events catalogue. Open datasets also have identity, attribution and publication-field gaps.

Evidence is a dated snapshot, not a guarantee of legality, uptime or current event accuracy. Policies expire for this review on 16 October 2026 or sooner upon change. Recheck exact paths/UA before activation; resolve missing policy fingerprints and technical samples per source. Source-specific conditions and the release shortfall remain explicit instead of inventing approvals.

## Validation

Passed: npm test (81/81), npm run db:types:check, npm run typecheck, npm run lint, npm run build, npm run test:bundle (14 browser assets). Register validation: 15 unique disabled candidates, JSON parsing, local documentation links, secret-pattern scan and git diff --check passed. .env.local remains ignored/untracked. Existing tests emit a Node module-type warning; no dependency/config change was made. No connector fixtures or hosted ingestion tests exist at C07; their cases are specified for later stages.
