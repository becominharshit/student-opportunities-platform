# Grounded AI Assistant Milestone Review

24 September 2026. **Complete — review approved.** Baseline: clean `main` at `378ba354d19aa201659929a5fa1ee033d5df08b4` (Organizer / Community Event Submissions milestone approved, committed, and pushed). C19 redesign, C20 privacy/security/account deletion, and C21 production deployment/QA have not started. Notifications 1.1 and deferred ingestion work (C09–C11, C17) remain strictly DEFERRED.

---

## 1. Objectives & Executive Summary

The Grounded AI Assistant milestone introduces an authenticated conversational interface at `/assistant` and API endpoint at `/api/assistant` designed to assist students with opportunity discovery, eligibility questions, deadlines, and recommendations while strictly upholding the platform's core truth invariants:

1. **Grounded / Hallucination-Resistant Architecture**:
   - Model prose is strictly supplementary. Authoritative facts (eligibility verdicts, application deadlines, event comparison matrices, recommendation rankings) are extracted directly from tool execution outputs and rendered as authoritative structured platform fact cards.
   - When evidence is missing, the assistant reports the state truthfully as "unknown" or "unspecified in platform data" rather than fabricating answers.
   - Prose contradiction guard: post-processor validates model output against evaluated facts. If an event is evaluated as ineligible or unknown, model prose claiming eligibility is neutralized. Unsupported claims about prizes, fees, deadlines, or recommendation scores are overridden with authoritative platform records.
2. **Ephemeral Chat State**:
   - Zero chat conversation history or prompt logs are persisted to PostgreSQL or external vector databases.
   - Chat state resides strictly in browser memory (ephemeral client-side session state) and is cleared on navigation or via the "Clear conversation" control.
   - Zero vector databases or vector extensions (`pgvector`, Pinecone) were introduced; standard PostgreSQL indexes and existing C12/C14/C15/C16 domain queries serve all retrieval needs.
3. **Data Minimization & Student Privacy**:
   - The assistant never sends student names, email addresses, or institutions to model providers.
   - Profile evaluations for eligibility and recommendations send only minimized academic context: degree, study year, country of study, and technical skills.
4. **Durable PostgreSQL-Backed Rate Limiting & Concurrency Control**:
   - Bypasses unreliable process-local in-memory rate limiting in favor of durable PostgreSQL-backed state in `private.assistant_usage`.
   - **Concurrency-Safe Initialization**: Uses `INSERT ... ON CONFLICT (user_id) DO NOTHING` inside the claim transaction to eliminate first-request race conditions.
   - **Enforced Quotas**:
     - 10 requests per 60-second fixed window (`rate_limit_exceeded_minute`).
     - 50 requests per UTC calendar day (`rate_limit_exceeded_daily`, resets at 00:00 UTC, not rolling 24 hours).
     - Maximum 1 concurrent in-flight request per user via an atomic 30-second lease (`concurrent_request_in_flight`).
     - Automatic crash recovery: leases older than 30 seconds are safely overridden.
     - Atomic `claim_assistant_request()` and `release_assistant_request(p_lease_id)` RPCs.
5. **Link Safety & Phishing Protection**:
   - Markdown links, HTML tags, and raw URLs in model prose are disarmed or neutralized.
   - Event navigation is restricted exclusively to canonical internal routes (`/events/[slug]`) resolved through verified database records.
6. **Zero Paid LLM API Calls in Automated Verification**:
   - All unit tests, UI tests, performance benchmarks, and hosted Supabase checks run offline using deterministic mock adapters (`MockAssistantModel`), incurring \$0 in API usage costs.

---

## 2. Technical Architecture & Database Contracts

### Database Migration (`20260924000300_ai_assistant_limits.sql`)

1. **`private.assistant_usage`**:
   - Quarantined in the `private` PostgreSQL schema.
   - **Primary Key**: `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`.
   - **Rate Windows**: `minute_window_start timestamptz NOT NULL DEFAULT now()`, `minute_request_count integer NOT NULL DEFAULT 0 CHECK (minute_request_count >= 0)`.
   - **Daily Quotas**: `daily_window_start date NOT NULL DEFAULT (timezone('UTC', now()))::date`, `daily_request_count integer NOT NULL DEFAULT 0 CHECK (daily_request_count >= 0)`.
   - **Concurrency Lease**: `current_lease_id uuid`, `lease_expires_at timestamptz`.
   - **Timestamp**: `updated_at timestamptz NOT NULL DEFAULT now()`.
   - **Security**: Direct access strictly revoked from `anon`, `authenticated`, and `public`. Accessible only via `service_role` and `SECURITY DEFINER` functions.
2. **`public.claim_assistant_request()`**:
   - `SECURITY DEFINER` RPC with `search_path = ''`.
   - Enforces authenticated user with confirmed email (`email_confirmed_at IS NOT NULL`).
   - Atomically initializes the user's usage row with `ON CONFLICT (user_id) DO NOTHING`.
   - Locks the user's row with `SELECT ... FOR UPDATE`.
   - Checks in-flight lease (`current_lease_id IS NOT NULL AND lease_expires_at > now()`); returns `{ allowed: false, code: 'concurrent_request_in_flight', retry_after_seconds }` if busy.
   - Resets 60-second window if elapsed; enforces 10 req/min limit.
   - Resets daily window if UTC calendar day changed; enforces 50 req/day quota.
   - Updates row with new lease UUID, 30-second TTL, and incremented counts.
   - Returns `{ allowed: true, lease_id, remaining_minute, remaining_daily }`.
3. **`public.release_assistant_request(p_lease_id uuid)`**:
   - `SECURITY DEFINER` RPC with `search_path = ''`.
   - Enforces authenticated user.
   - Clears `current_lease_id` and `lease_expires_at` only if `current_lease_id = p_lease_id` and `user_id = auth.uid()`.
   - Returns boolean indicating whether a matching lease was cleared.

---

## 3. Server-Side Assistant Engine (`src/lib/assistant/`)

1. **`types.ts`**:
   - Type definitions for messages, tools, tool calls, authoritative fact objects (`eligibility`, `comparison`, `recommendations`, `deadlines`), and the `AssistantModel` contract.
2. **`tools.ts`**:
   - 8 bounded server-side tools with `additionalProperties: false` on all parameter schemas:
     - `search_events`: Bounded search over published opportunities using text/mode/country/category filters.
     - `get_event_details`: Single opportunity lookup by UUID or slug.
     - `compare_events`: Structured side-by-side comparison matrix for 2 or 3 opportunities.
     - `evaluate_event_eligibility`: C14 three-valued AST evaluation against current student profile facts.
     - `get_user_recommendations`: C15 deterministic recommendation retrieval, strictly preserving `score: null` when confidence is incomplete.
     - `get_saved_events`: C16 bookmarked opportunities lookup.
     - `get_upcoming_saved_deadlines`: Deterministic mixed-precision deadline sorting (effective calendar date $\rightarrow$ datetime before date-only $\rightarrow$ UUID tie-break).
     - `get_user_profile_summary`: Minimized student profile context (degree, study year, country, skills, interests; name, email, and institution stripped).
3. **`sanitizer.ts`**:
   - `cleanSafePlainText`: Removes HTML tags, scripts, markdown formatting, disarms dangerous protocols (`javascript:`, `data:`, `vbscript:`), and strips external links.
   - `extractCanonicalEvents`: Collects unique event references produced by database tools.
   - `extractAuthoritativeFacts`: Extracts structured fact objects from tool outputs.
   - `verifyProseFactualSafety`: Contradiction detector ensuring model prose does not contradict evaluated eligibility states.
4. **`orchestrator.ts`**:
   - Multi-turn execution loop bounded to a maximum of 3 model turns, 2 tool execution rounds, and 4 tool calls.
   - Validates untrusted conversation history (rejects invalid roles, caps history at 6 messages).
   - Fast path for non-factual queries (greetings, scope inquiries) with 0 database reads.
5. **`model.ts`, `mock-model.ts`, `gemini-model.ts`, `openai-model.ts`**:
   - Provider factory supporting offline mock, Google Gemini, and OpenAI adapters using native `fetch` with endpoint validation.
6. **`src/app/api/assistant/route.ts`**:
   - Protected API route with 16 KB body limit.
   - Rejects malformed JSON before consuming quota.
   - Enforces rate limits and concurrency locks with guaranteed lease release in a `finally` block.

---

## 4. User Interface (`src/app/assistant/` & `src/components/`)

1. **DiscoveryShell Integration**:
   - Added authenticated "Assistant" navigation link in `src/components/public-events.tsx` with responsive wrap styling.
2. **Assistant Page (`src/app/assistant/page.tsx`)**:
   - Protected server component using `requireIdentity("/assistant")`.
   - Unread notification count indicator integrated into shell.
3. **Structured Fact Cards (`src/components/assistant-facts.tsx`)**:
   - `EligibilityFactCard`: Renders deterministic C14 badge (`Eligible`, `Ineligible`, `Check Criteria`), reasons list, and missing facts notice.
   - `ComparisonMatrixCard`: Renders side-by-side comparison table for 2–3 opportunities.
   - `DeadlinesFactCard`: Renders upcoming deadlines with urgency badges and calendar date/time.
   - `RecommendationsFactCard`: Renders personalized Best Matches and Worth Reviewing with match factors.
4. **Chat Interface (`src/components/assistant-chat.tsx`)**:
   - Ephemeral client-side thread with starter suggestion pills.
   - Safe plain-text prose bubbles.
   - Compact canonical event cards linking to `/events/[slug]` (read-only, no save toggle).
   - Real-time rate limit alerts with retry countdown timer.
   - "Clear conversation" control to reset thread state.

---

## 5. Verification & Test Evidence

### 1. Automated Regression Suite (`npm test`)
- **Command**: `npm test`
- **Result**: **431 of 431 tests passed** (0 failures).
- All 406 existing regression contracts across C01–C18, Calendar Export, Notifications 1.0, and Organizer Submissions passed without regression.
- All 25 new Grounded AI Assistant test cases passed.

### 2. Milestone Unit & Security Tests (`npm run test:assistant`)
- **Command**: `npm run test:assistant`
- **Result**: **25 of 25 tests passed**:
  - `Direct table security`: `private.assistant_usage` is inaccessible to anon and authenticated roles.
  - `First request initialization`: Safe insertion with `ON CONFLICT DO NOTHING`.
  - `Concurrency control`: 1 concurrent request per user; second request while lease held rejected.
  - `Lease release`: `release_assistant_request` immediately frees slot.
  - `Crash recovery`: Expired lease (>30s) automatically overridden.
  - `Rate limit (10 req/60s)`: 11th request in minute rejected with 429 semantics.
  - `Daily quota (50 req/day)`: 51st request on same UTC day rejected.
  - `Unauthenticated claim rejection`: Unauthorized caller rejected with `P0501`.
  - `Sanitizer`: `cleanSafePlainText` removes scripts, tags, links, and disarms protocols.
  - `Authoritative facts`: Tool outputs preserved and extracted without loss.
  - `Contradiction detection`: Prose contradicting evaluation results detected and overridden.
  - `Tool definitions`: All 8 tools enforce `additionalProperties: false`.
  - `MockAssistantModel`: Deterministic tool calls and responses verified.
  - `Fast path`: Greetings return `not_applicable` with 0 tool calls.
  - `Untrusted history validation`: Invalid roles rejected, max 6 messages enforced.
  - `Concurrency race safety`: Simulated simultaneous claims handle unique conflicts cleanly.
  - `Tool parameter bounds`: Valid UUIDs enforced; comparison bounded to 2–3 items.
  - `Mixed-precision deadlines`: Deterministic tie-break sorting verified.
  - `Data minimization`: Profile summary strips name, email, and institution.
  - `C15 recommendation contract`: Preserves `score: null` when confidence incomplete.
  - `Route handler validation`: Rejects malformed payloads before quota claim.

### 3. Query Plan & Performance Verification (`npm run test:assistant:performance`)
- **Command**: `npm run test:assistant:performance`
- **Result**: **PASS**. Evaluated with `EXPLAIN (ANALYZE, BUFFERS)` across 2,000 synthetic assistant usage records and 1,000 synthetic events in local isolated PGlite:
  - `usageLockPlan`: Index Scan using `assistant_usage_pkey` (buffer hits = 2, actual benchmark time 0.102..0.104 ms).
  - `eventSearchPlan`: Index Scan using `events_published_date_idx` (actual benchmark time 0.038..0.091 ms).
  - `eventLookupPlan`: Index Scan using `events_slug_key` (actual benchmark time 0.062..0.063 ms).
  - `deadlinesPlan`: Nested Loop using `event_deadlines_due_idx` and `events_pkey` (actual benchmark time 0.095..0.400 ms).
  - **Database query counts**: Strictly bounded to 1–2 queries per tool execution (no application N+1, no full catalogue loads).
  - *Note*: Benchmark timings reflect local synthetic PGlite test execution, not production network latency.

### 4. Responsive UI Verification across 4 Canonical Viewports (`npm run test:assistant:ui`)
- **Command**: `npm run test:assistant:ui`
- **Result**: **PASS** across all viewports with **0 horizontal overflow**:
  - `320px` (small mobile): Chat container, suggestion pills, message bubbles, and fact cards render cleanly without overflow.
  - `390px` (standard mobile): Full chat flow and comparison tables scale appropriately.
  - `768px` (tablet portrait): Multi-column fact layouts adapt cleanly.
  - `1280px` (desktop): Maximum width bounded (`max-w-4xl`), readable layout.
  - Keyboard accessibility, focus states, and semantic headers verified.

### 5. Hosted Supabase Acceptance & Security Verification (`npm run test:assistant:hosted`)
- **Command**: `npm run test:assistant:hosted`
- **Result**: **PASS**.
  - Verified remote migrations: 12 of 12 applied and up to date (`20260924000300_ai_assistant_limits.sql`).
  - Verified anonymous RLS restrictions and negative RPC access checks (`P0501`).
  - Verified authenticated direct table access denial on `private.assistant_usage`.
  - Verified temporary test accounts A and B: quota claiming, remaining counters, active lease locking, concurrency rejection (`concurrent_request_in_flight`), and atomic lease release.
  - Verified cross-user isolation: User A's claims do not affect User B's quota.
  - Verified zero paid LLM calls and zero event fixtures created.
  - **100% row count conservation**: All monitored tables verified with before-and-after inventory counts; temporary test accounts cleanly deleted.

### 6. Architectural Boundary & Bundle Checks
- `npm run db:types:check`: **PASS** (database types match clean migrations).
- `npm run typecheck`: **PASS** (zero TypeScript compiler errors).
- `npm run lint`: **PASS** (zero ESLint warnings or errors with `--max-warnings=0`).
- `npm run build`: **PASS** (all routes compiled cleanly in Next.js production build).
- `npm run test:bundle`: **PASS** (zero leaked secrets or server references in browser assets).
- `npm run test:boundary`: **PASS** (client/server boundary strictly enforced).
- `git diff --check`: **PASS** (zero whitespace errors or merge conflicts).

---

## 6. Limitations, Known Boundaries & Deferred Work

1. **Ephemeral Chat Sessions**:
   - The platform does not save conversation histories across browser reloads or devices. This is an intentional privacy and simplicity design decision.
2. **Model Prose Non-Authoritative**:
   - Model prose is never considered a legal or binding representation of event rules. The official organizer links and structured platform records remain authoritative.
3. **No Vector Databases / Embeddings**:
   - Information retrieval is handled through structured PostgreSQL indexes and domain services (C12 search, C14 eligibility, C15 recommendations, C16 saves).
4. **Deferred Milestones Preserved**:
   - C09–C11 and C17 external-source live ingestion remain deferred.
   - C19 visual redesign and C20/C21 remain unstarted.
