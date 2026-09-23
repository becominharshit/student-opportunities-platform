---
name: student-opportunities-platform
description: >-
  Core engineering rules, architecture preservation, data integrity, security,
  and verification standards for the Student Opportunities Platform. Use when
  implementing or auditing any milestone, database migration, API, UI, or test.
---

# Student Opportunities Platform Engineering Skill

This skill defines the permanent engineering guidelines, invariants, verification standards, and milestone delivery procedures for the Student Opportunities Platform.

## Priority Order

When making engineering decisions or trade-offs, adhere strictly to this priority hierarchy:

1. **Correctness**
2. **Security / Privacy**
3. **Data Integrity**
4. **Performance**
5. **Accessibility**
6. **UI Consistency**
7. **Maintainability**

---

## Permanent Repository Rules

### 1. Existing Application Baseline
- This is an existing production-oriented application, not a greenfield project.
- **Never** rebuild or rewrite features or the project from scratch.
- Build upon existing conventions, utilities, and schema structures.

### 2. Architectural Preservation
Preserve the existing technology stack and architectural layers:
- **Framework**: Next.js (App Router, Turbopack, React Server Components)
- **Language**: TypeScript (strict type checking, no `any` escapism)
- **Database & Auth**: Supabase PostgreSQL, Supabase Auth (`@supabase/ssr`)
- **Security**: PostgreSQL Row Level Security (RLS) policies on all tables
- **Components**: Existing design system, shared primitives (`Button`, `DiscoveryShell`, `EventCard`), and Tailwind tokens
- **Core Architecture**: Existing domain architecture in `src/lib/` (`auth`, `connectors`, `events`, `profiles`, `recommendations`, `for-you`, `saves`, `supabase`)

### 3. Milestone Discipline
- Work strictly **one milestone at a time**.
- Never start the next milestone automatically or combine milestones without explicit owner instruction.
- Follow the sequence outlined in `PROJECT_STATE.md` and `docs/planning/implementation-roadmap.md`.

### 4. Deferred Milestones
- **C09, C10, C11, and C17 remain DEFERRED.**
- Do not implement live external-source sync, cross-source deduplication, scheduled external sync, or source expansion until authorized after beta deployment.
- Existing C07 research and C08/C08.5 connector infrastructure must remain preserved and unmodified.

### 5. UI Stability Before C19
- **Do not redesign functional pages before C19.**
- Milestone additions to pages (such as `/explore`, `/events/[slug]`, `/for-you`, `/account`, `/saved`) must integrate into existing layouts and styling rather than introducing new visual redesigns.

### 6. Responsive Breakpoint Guarantees
Preserve responsive layout, readability, and interaction across all four canonical breakpoints:
- **320px** (small mobile)
- **390px** (standard mobile)
- **768px** (tablet / portrait)
- **1280px** (desktop)

### 7. UI Verification Checklist
Before and after any UI changes, verify:
- **No horizontal overflow** at all tested breakpoints (320px, 390px, 768px, 1280px)
- **Keyboard navigation**: full tab order and keyboard-operable controls
- **Visible focus states**: clearly discernible outline / focus ring
- **Semantic headings**: proper heading hierarchy (`h1` -> `h2` -> `h3`, no skipped levels)
- **Labels**: explicit form labels, `aria-label` / `aria-labelledby`, and screen-reader announcements
- **Layout consistency**: mobile and desktop layouts adhere to existing design hierarchy

### 8. Forbidden Styling Patterns
Do not introduce:
- Generic "AI SaaS" dashboard aesthetics
- Excessive multi-stop gradients
- Glassmorphism (blurs, translucent frosted panels)
- Glowing background blobs or ambient neon glows
- Unnecessary CSS/JS animations, bouncy transitions, or motion libraries

### 9. Database & Query Performance Rules
- **No unbounded database reads**: every query must be bounded with explicit `LIMIT` or keyset conditions.
- **No catalogue loading**: never load entire event catalogues into application memory.
- **Avoid N+1 queries**: batch lookups into single bounded queries (e.g., bulk reads for card arrays).
- **Prefer bulk reads**: fetch related resources in a single query or composite RPC.
- **Prefer keyset pagination**: use deterministic `(timestamp, id)` or cursor-based pagination; avoid SQL offset pagination.
- **Explicit projections**: query only the columns needed by the consumer.
- **Inspect query plans**: run `EXPLAIN (ANALYZE, BUFFERS)` for critical data access paths to guarantee index usage and prevent full-table sequential scans or sorts.

### 10. Database Migration Rules
- **Additive migrations only** unless an explicit breaking schema change is approved by the project owner.
- Always dry-run migrations against clean local / isolated databases before applying them to hosted Supabase.
- **Never reset the hosted database** or re-run destructive commands (`db push`, `db reset --linked`).
- **Never reapply an already-applied migration.**
- **Never weaken RLS**: table grants, security-invoker boundaries, and ownership checks must remain strictly enforced.

### 11. Data Truth Invariants
**Unknown must remain unknown.** Do not fabricate facts or guess missing values.
Never convert:
- `null` -> `false`
- `null` -> `0`
- Missing eligibility data -> `eligible`
- Missing date/time -> fabricated timestamp or "midnight"
- Missing fee -> `free`
- Missing maximum team size -> `unlimited`

If evidence or facts are absent, represent them truthfully as unknown or unspecified in both backend evaluations and UI presentations.

### 12. Privacy Architecture
- User identity must **always be derived server-side** from confirmed session tokens (`auth.uid()`).
- **Never trust a browser-supplied `user_id`** from form bodies, query parameters, or client headers.
- Ordinary user actions and queries must use the authenticated client and adhere to PostgreSQL RLS.
- Privileged service-role credentials (`SUPABASE_SECRET_KEY`) must remain strictly server-only within dedicated administrative scripts or setup helpers; never use service clients in user-facing endpoints.

### 13. Information Disclosure Protections
Never expose through APIs, public projections, or client code:
- Private student profile information
- Raw source evidence or AST rule trees
- Connector diagnostics, fetch logs, or internal errors
- Supabase service credentials or database connection strings
- Administrator records or cross-user activities

### 14. Secrets and Credentials Protection
Never commit or stage:
- `.env.local` or environment files containing live credentials
- Passwords, bearer tokens, or session tokens
- Service keys (`sb_secret_...`) or API secret keys
- Test fixture output in `work/*` or hosted run logs

### 15. Test Integrity and Regression Contracts
- Existing tests are regression contracts.
- **Never delete or weaken existing tests** just to make a milestone pass.
- If an existing test breaks due to intentional functionality expansion, update the test harness honestly to reflect the new contract while preserving all prior invariants.

### 16. Minimum Validation Suite
After any code modification or milestone completion, execute the core validation suite:
```sh
npm test
npm run db:types:check
npm run typecheck
npm run lint
npm run build
npm run test:bundle
npm run test:boundary
```

### 17. Milestone-Specific Verification
In addition to the core suite, run all relevant milestone-specific validation commands:
- **Search (C12)**: `npm run test:search`, `npm run test:search:ui`
- **Profiles (C13)**: `npm run test:profiles`, `npm run test:profiles:ui`
- **Recommendations (C14)**: `npm run test:recommendations`, `npm run test:recommendations:ui`
- **For You (C15)**: `npm run test:for-you`, `npm run test:for-you:performance`, `npm run test:for-you:ui`
- **Saved Events (C16)**: `npm run test:saves`, `npm run test:saves:performance`, `npm run test:saves:ui`

### 18. UI Verification Protocol
- For UI work, perform browser verification across viewports using automated Playwright suites (`npm run test:*:ui`).
- Capture screenshots, review walkthroughs, and verify that layouts render cleanly without regressions.

### 19. Anti-Fabrication Rule
Do not fabricate:
- Events or organizers
- Eligibility assertions or admission probabilities
- Deadlines or registration statuses
- Popularity metrics, trending badges, or social-proof claims
- Bookmark / save counts or user engagement statistics
- Prizes, rewards, or fees
- Recommendation matches without qualifying evidence
- Verification statuses or freshness claims

### 20. Staging and Review Boundary
- **Before owner review**: leave all milestone implementation files uncommitted and unpushed unless the project owner explicitly directs otherwise.
- Never commit partial or unverified milestone work.

### 21. Milestone Review Document
After completing each milestone, create a comprehensive review document in `docs/section-36-<milestone>-review.md` documenting:
- Architectural decisions and schema changes
- Query plans, indexing rationale, and performance measurements
- Validation evidence (unit, UI, boundary, bundle, and hosted verification)
- Exact cleanup protocols for any temporary verification fixtures
- Limitations, known boundaries, and remaining deferred work
