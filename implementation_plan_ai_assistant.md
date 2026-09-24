# Implementation Plan: Grounded AI Assistant

**Status**: APPROVED — Executing Implementation  
**Baseline**: Clean `main` at `378ba354d19aa201659929a5fa1ee033d5df08b4` (Organizer Submissions milestone completed, audited, committed, and pushed).  
**Deferred Milestones**: C09, C10, C11, C17, Notifications 1.1 recommendation alerts remain strictly DEFERRED.  
**Unstarted Milestones**: C19 final design/motion, C20 privacy/security/account deletion, C21 deployment/final QA.

---

## 1. Executive Summary & Core Grounding Principle

The **Grounded AI Assistant** introduces an authenticated conversational assistant (`/assistant`) designed to help students discover, understand, and navigate student technology opportunities already verified and published in the platform catalogue.

### The Cardinal Rule: The LLM is NOT the Source of Truth
The assistant is **strictly grounded** in canonical platform data:
- The model **never** invents events, dates, deadlines, locations, prizes, fees, eligibility rules, organizer claims, verification levels, source evidence, or recommendation scores.
- Canonical platform data sources (`public.events`, `public.event_deadlines`, `public.event_tags`, `public.organizers`, `public.event_categories`, C13 student profile, C14 eligibility engine, C15 recommendation engine, and C16 saved events) remain the sole factual authorities.
- The assistant retrieves facts using **bounded, deterministic server-side tools** and returns **authoritative structured facts** alongside conversational explanations.
- When data is missing, ambiguous, or unverified in the database, the assistant **explicitly reports it as unknown** (*"Not specified in the platform data"* or *"Not specified in the published opportunity record"*). It never guesses or fills gaps through probabilistic inference.
- **Accurate Provenance Wording**: Published opportunities represent *"technology opportunities published in the platform catalogue"*. Different opportunities carry different trust levels (e.g. community-submitted vs official organizer). Missing fields are stated as *"Not specified in the platform data"*, never implying unverified external records are official.
- **Grounding Status Semantics**: Grounding status `grounded` means requested facts were retrieved from canonical platform data, not that the claims were externally verified as true.

---

## 2. End-to-End Architectural Pipeline & Flow

```
[Student in Browser]
      │
      ▼ (POST /api/assistant with authenticated session cookie)
[Authenticated Assistant Server Route]
      │
      ├─ 1. Basic Request Size Check (Max 16 KB payload)
      ├─ 2. Authenticated Identity Verification (`requireIdentity("/assistant")`)
      ├─ 3. Request & Untrusted History Validation:
      │     • Roles strictly "user" | "assistant" (reject "system" / "tool")
      │     • Max 6 messages, max 1,000 chars/msg
      │     • Malformed inputs reject with HTTP 400 BEFORE consuming quota
      │
      ├─ 4. Non-Factual Fast Path:
      │     • General questions ("What can you do?", "How to use?") return immediately
      │       with grounding.status = "not_applicable" and zero tools
      │
      ├─ 5. Durable PostgreSQL Quota & Concurrency Claim (`claim_assistant_request`):
      │     • Fixed 60s window (10 req/min) & UTC calendar day (50 req/day)
      │     • Atomic ON CONFLICT row initialization (zero first-request race)
      │     • 30-second concurrency lease (1 in-flight request/user)
      │     • Rejects with HTTP 429 + retry-after if exceeded
      │
      ▼ (try / finally block guarantees lease release via `release_assistant_request`)
[Intent / Tool Selection Loop (Max 2 tool rounds, max 4 tool calls, max 3 model calls)]
      │
      ├──> Server Validates & Dispatches Bounded Platform Tools:
      │      • search_events (C12 search/filter: query, domain, skill, dates, deadlines, mode, fee, max 10 items)
      │      • get_event_detail (C06 public projection, capped descriptions, published only)
      │      • compare_events (2-3 canonical events + C14 personalized eligibility)
      │      • evaluate_event_eligibility (C14 AST evaluator with C13 stored profile facts only)
      │      • get_user_recommendations (C15/C14 scoring: Best Matches vs. Worth Reviewing, score: number | null)
      │      • get_saved_events (C16 current user's saved published events)
      │      • get_upcoming_saved_deadlines (C16 active registration deadlines, mixed-precision tie-break)
      │      • get_user_profile_summary (C13 neutral student attributes: year, degree, skills, interests; NO institution)
      │
      ▼
[Structured Factual Context Envelope]
      │
      ▼
[LLM Provider / Mock Model (`AssistantModel`)]
      │  (Generates student-friendly explanation; model prose is SUPPLEMENTARY)
      ▼
[Response Sanitization & Entity Extraction]
      │  • Builds authoritative structured facts & event entities directly from tool data
      │  • Strips or replaces prose that contradicts authoritative tool facts
      │  • Discards model-invented IDs, slugs, or URLs
      │  • Formats text using plain safe text (newlines preserved, no raw HTML, no clickable model links)
      ▼
[Durable Concurrency Lease Release (`release_assistant_request`) in finally block]
      │
      ▼
[Structured Client Response Envelope: { ok: true, answer, events, facts, grounding }]
```

---

## 3. Durable PostgreSQL Rate Limiting & Concurrency Control

### Concurrency-Safe Initialization (First-Request Race Resolution)
To prevent race conditions where two simultaneous first-ever requests for a user both observe no row and fail on unique key constraints, initialization and locking execute atomically inside the same transaction:

```sql
INSERT INTO private.assistant_usage (
  user_id, minute_window_start, minute_request_count,
  daily_window_start, daily_request_count,
  current_lease_id, lease_expires_at, updated_at
) VALUES (
  v_uid, v_now, 0, v_today, 0, NULL, NULL, v_now
)
ON CONFLICT (user_id) DO NOTHING;

SELECT * INTO v_usage
FROM private.assistant_usage
WHERE user_id = v_uid
FOR UPDATE;
```

### Accurate Fixed-Window Semantics
The rate limiter enforces deterministic **fixed-window accounting**:
1. **60-Second Window**: Maximum **10 requests per 60 seconds**.
   - If `v_now - v_usage.minute_window_start >= interval '60 seconds'`, reset `minute_request_count = 0` and `minute_window_start = v_now`.
2. **UTC Calendar Day Quota**: Maximum **50 requests per UTC calendar day**.
   - `v_today := (timezone('UTC', v_now))::date;`
   - If `v_today > v_usage.daily_window_start`, reset `daily_request_count = 0` and `daily_window_start = v_today`.
3. **In-Flight Concurrency Lease**:
   - Maximum **1 in-flight request** per user.
   - If `current_lease_id IS NOT NULL AND lease_expires_at > v_now`, reject with code `'concurrent_request_in_flight'`.
   - If `lease_expires_at <= v_now`, the expired lease is automatically reclaimed (crash recovery).
4. **Lease Duration**: **30 seconds** (comfortably covers the 15-second provider timeout).

### Guaranteed Lease Release & Quota Non-Refund
- After `claim_assistant_request()` succeeds, the server retains `lease_id` and releases it in a `finally` block via `release_assistant_request(lease_id)`.
- Releasing occurs on **all execution paths**: success, provider timeout, provider error, malformed model JSON, tool failure, or client abort.
- **Quota Consumption Invariant**: Quota count is NOT refunded if a downstream provider call fails after a request is successfully claimed.

---

## 4. Single Additive Database Migration Decision

**Migration Name**: `supabase/migrations/20260924000300_ai_assistant_limits.sql`
- Next monotonic migration following `20260924000200_organizer_submissions.sql`.
- Total migrations increase from 11 to **12**.
- Adds `private.assistant_usage` table.
- Adds `claim_assistant_request()` and `release_assistant_request(uuid)` SECURITY DEFINER RPCs.
- `REVOKE ALL FROM public, anon; GRANT EXECUTE TO authenticated`.
- Standard `pg_catalog.gen_random_uuid()` and `pg_catalog.clock_timestamp()` used.
- **Zero chat tables**: Ephemeral chat state preserved.

---

## 5. Untrusted Client History & Mandatory Re-Grounding

1. **Role Restriction**: Accepts only `role: "user" | "assistant"`. Input containing `role: "system"` or `role: "tool"` is rejected (`HTTP 400`).
2. **Hard Bounds**: Maximum **6 messages** (3 user turns, 3 assistant turns); maximum **1,000 characters** per message.
3. **Untrusted Dialogue Only**: Previous assistant messages in client history are treated as unverified conversation context.
4. **Mandatory Re-Grounding Invariant**: The current turn must **always execute canonical platform tools** to ground event facts. Claims in history can never bypass tools or substitute for canonical database queries.
5. **Non-Factual Fast Path**: General questions about assistant capabilities (*"What can you help me with?"*, *"How do I use this assistant?"*) return immediately with `grounding.status = "not_applicable"` and zero tool calls.

---

## 6. No Temporary Profile Fact Overrides in V1

- `evaluate_event_eligibility` strictly evaluates against the authenticated student's stored C13 profile facts in `public.profiles`.
- Hypothetical overrides (*"Assume I am a 3rd-year student..."*) are **strictly deferred**.
- If a student asks for a hypothetical evaluation differing from their profile, the assistant explains:
  > *"Your saved profile indicates [e.g. 1st year]. I can evaluate your eligibility based on your actual profile, but hypothetical profile overrides are not supported yet."*
- Never mutates profile data via chat.

---

## 7. Event Comparison Architecture & C14 Eligibility Integration

When comparing opportunities via `compare_events`:
1. `compare_events` fetches canonical public facts for 2–3 opportunities.
2. If personalized eligibility is requested as part of comparison, comparison orchestration separately invokes the deterministic C14 `evaluateEligibility` engine for each compared event using the student's stored C13 profile.
3. The LLM **never** compares `eligibility_text` strings directly. Every eligibility outcome originates strictly from C14.

---

## 8. Authoritative Structured Facts vs. Supplementary Model Narrative

The Visible Answer is **Safe by Construction**:
- Structured facts (`facts` object) are assembled server-side directly from tool data:
  - `facts.eligibility`: Authoritative C14 state (`eligible`, `ineligible`, `unknown`), evaluator reasons, missing facts.
  - `facts.comparisons`: Server-built comparison matrix with C14 eligibility.
  - `facts.deadlines`: Canonical deadline structures with exact precision and open/closed status.
  - `facts.recommendations`: Ordered C15 results with `score: number | null` and match factors.
- The UI renders these authoritative fact cards directly.
- **Prose Safety**: If the model prose asserts an event-specific fact (e.g. *"The prize is ₹50,000"* or *"Registration deadline is tomorrow"*) that contradicts or is absent from tool data, the unsafe prose is stripped or replaced with a deterministic server-generated answer.

---

## 9. Structured Client Response Envelope

```ts
// src/lib/assistant/types.ts

export type GroundingStatus = "grounded" | "partial" | "no_results" | "not_applicable";

export interface AssistantEventReference {
  id: string;
  slug: string;
  title: string;
  organizerName: string | null;
  categoryName: string | null;
  mode: string | null;
  datesSummary: string | null;
  deadlineSummary: string | null;
  registrationStatus: string | null;
  verificationLevel: string | null;
}

export interface AuthoritativeFacts {
  eligibility?: Array<{
    eventId: string;
    eventTitle: string;
    eventSlug: string;
    state: "eligible" | "ineligible" | "unknown";
    reasons: string[];
    missingFacts: string[];
  }>;
  comparisons?: Array<{
    eventId: string;
    eventTitle: string;
    eventSlug: string;
    category: string | null;
    mode: string | null;
    dates: string | null;
    deadline: string | null;
    fee: string | null;
    prize: string | null;
    eligibilityState?: "eligible" | "ineligible" | "unknown";
    verificationLevel: string | null;
  }>;
  deadlines?: Array<{
    eventId: string;
    eventTitle: string;
    eventSlug: string;
    deadlineKind: string;
    deadlineLabel: string;
    localDate: string | null;
    dueAt: string | null;
    timezone: string | null;
    precision: "date_only" | "datetime" | "unknown";
    isOpen: boolean;
  }>;
  recommendations?: {
    tier: "all" | "best_matches" | "worth_reviewing";
    items: Array<{
      eventId: string;
      title: string;
      slug: string;
      tier: "best" | "review";
      score: number | null; // Real C14/C15 contract: null when coverage insufficient
      matchFactors: string[];
    }>;
  };
}

export interface AssistantSuccessResponse {
  ok: true;
  answer: string;
  events: AssistantEventReference[];
  facts: AuthoritativeFacts;
  grounding: {
    status: GroundingStatus;
    toolsUsed: string[];
    notice?: string;
  };
}

export interface AssistantErrorResponse {
  ok: false;
  code: "unauthorized" | "rate_limited" | "invalid_payload" | "service_unavailable" | "provider_error";
  message: string;
  retryAfterSeconds?: number;
}

export type AssistantApiResponse = AssistantSuccessResponse | AssistantErrorResponse;
```

---

## 10. Grounding & Anti-Hallucination Guarantees

We do not claim that a generic prose sanitizer can semantically fact-check natural language. The exact grounding guarantee is:
1. Structured `events` entities and `facts` objects are reconstructed **exclusively from server-executed tool data**.
2. Event IDs, slugs, and URLs in the response are built server-side; model-invented IDs, slugs, or URLs are discarded.
3. Official and registration links come only from canonical database fields validated via `publicHttps()`.
4. The UI renders authoritative factual components from `facts` directly.
5. If model narrative makes concrete assertions contradicting tool data, deterministic fallback text is used.

---

## 11. Plain Safe Text Rendering (No New Markdown Dependency)

- Model narrative is rendered as **plain safe text** with preserved whitespace and paragraph line breaks (`whitespace-pre-line`).
- Raw HTML is disabled; `<script>`, `<style>`, and HTML tags cannot execute.
- Model-generated external links are non-clickable or stripped.
- All navigation to opportunities (`/events/[slug]`) and external websites (`event.official_url`, `event.registration_url`) occurs via structured, server-validated event cards.

---

## 12. Strict Server-Authoritative Tool Validation & Schemas

All tool schemas set `additionalProperties: false`. Provider-side schema compliance is NOT trusted; the server validates all arguments before execution:

### Bounded Tool Schemas & Input Bounds
1. `search_events`:
   - `query`: string, max 100
   - `domain`: string, max 50 (C12 domain/interest filter)
   - `skill`: string, max 50 (C12 skill filter)
   - `category`: enum (`hackathon`, `coding_competition`, `workshop`, `conference`, `student_technology_event`)
   - `mode`: enum (`online`, `offline`, `hybrid`)
   - `date_from` / `date_to`: ISO date strings `YYYY-MM-DD`
   - `deadline_from` / `deadline_to`: ISO date strings `YYYY-MM-DD`
   - `city`: string, max 50
   - `country`: uppercase 2-letter regex `^[A-Z]{2}$`
   - `fee`: enum (`free`, `paid`, `varies`)
   - `registration_status`: enum (`open`, `not_open`, `closed`)
   - Output bound: **<= 10 compact cards** (no full descriptions).
2. `get_event_detail`:
   - `slug_or_id`: string, max 100.
   - Output: 1 event; descriptions and eligibility text capped at **1,000 characters**.
3. `compare_events`:
   - `slugs_or_ids`: array of strings, min 2, max 3.
   - Output: 2–3 compact fact objects + C14 eligibility. No full descriptions.
4. `evaluate_event_eligibility`:
   - `event_id`: UUID regex.
   - Consumes stored profile server-side; returns `{ state, reasons, missingProfileFacts }`.
5. `get_user_recommendations`:
   - `tier`: enum (`all`, `best_matches`, `worth_reviewing`), `limit`: int (1–10).
   - Reuses exact C15 contract: `score: number | null`.
6. `get_saved_events`:
   - `limit`: int (1–10). Current user's saved published events.
7. `get_upcoming_saved_deadlines`:
   - `limit`: int (1–10). Active registration deadlines, mixed-precision sort.
8. `get_user_profile_summary`:
   - `{}` (zero parameters). Returns minimal student context; **institution excluded**.

---

## 13. Profile Data Minimization & Privacy Disclosure

- **Per-Tool Minimization**: Profile summary is NOT sent with every request.
  - Search / general questions: zero profile context sent.
  - Eligibility: C14 evaluates profile server-side; returns evaluator results.
  - Recommendations: sends match/reason results rather than full profile.
- **Excluded by Default**: User email, user UUID, name, and **institution name**.
- **Privacy Disclosure**: Displayed on `/assistant`:
  > *"When you chat with the Assistant, your question and relevant opportunity details are processed by our configured AI model provider. We do not share your email, account ID, or institution name with the model provider."*

---

## 14. Provider Configuration & Base URL Security

- `MockAssistantModel` is the default in test and development (zero paid credits).
- In production, provider and model must be explicitly configured via `AI_PROVIDER` and `AI_MODEL`. If unset, fails safely with `service_unavailable`. No paid model is silently called.
- `AI_BASE_URL` must use `https:` in production, cannot contain embedded credentials, and is never accepted from or exposed to the client.

---

## 15. Execution Bounds: Max 3 Model Calls

- Maximum **3 model generate calls** per user turn:
  1. Call 1: Tool selection
  2. Call 2: Optional second tool selection OR final synthesis
  3. Call 3: Final synthesis (only when second tool round occurred)
- Maximum **2 tool rounds** and **4 total tool calls** per turn.
- Prevents infinite loops and bounds provider cost.

---

## 16. Deadline Mixed-Precision Ordering

In `get_upcoming_saved_deadlines`:
- Sort key: Effective calendar date (`YYYY-MM-DD`).
- Tie-break: `datetime` deadlines sort first by exact instant; `date_only` deadlines sort after with explicit label:  
  *"Date-only deadline (closes on [date]; specific cutoff time not specified in platform data)"*.
- Deterministic final tie-breaker: `event_id` ASC.
- Ordering is a UI convention only; does not imply date-only occurs at midnight.

---

## 17. UI Architecture & Event Card Design

- **Route**: `/assistant`, protected by `requireIdentity("/assistant")`, wrapped in `DiscoveryShell authenticated`.
- **Navigation**: Adds `"Assistant"` link to `DiscoveryShell` when authenticated.
- **Event Cards**: Contain title, organizer, category, mode, dates, deadline badge, verification level, and a link to **"View Event"** (`/events/[slug]`). **NO save toggle button** (eliminates N+1 queries and save-state overhead).
- **Authoritative Fact Cards**: Visually distinct panels rendering C14 eligibility, C15 recommendations, and comparison matrices directly from `facts`.
- **Responsive**: Verified across **320px, 390px, 768px, and 1280px** with **0 horizontal overflow**.

---

## 18. Comprehensive Validation & Test Plan

### Test Suites to Implement
1. `npm run test:assistant` (`tests/assistant/assistant.test.mjs`):
   - First-request rate-limit row race (two simultaneous first claims).
   - Fixed 60s quota reset and UTC daily quota reset.
   - Concurrency rejection and 30s expired lease recovery.
   - Malformed request fails before consuming quota.
   - Lease releases in `finally` on provider timeout, tool failure, or error.
   - Client history role stripping (reject system/tool roles).
   - Non-factual questions return `not_applicable` with zero tools.
   - Search tool validates domain, skill, and date ranges.
   - C15 contract preservation (`score: number | null`, Best Matches vs Worth Reviewing).
   - Hallucinated event IDs dropped; hallucinated URLs ignored.
   - Fact contradiction fallback (unsafe model prose suppressed).
   - Plain safe text (no raw HTML, no clickable model links).
   - Privacy minimization (no institution, email, or UUID in provider payload).
2. `npm run test:assistant:ui` (`scripts/test-assistant-ui.mjs`):
   - Playwright multi-viewport UI test across 320/390/768/1280px.
   - 0 horizontal overflow. Keyboard navigation, visible focus rings, ARIA live regions.
3. `npm run test:assistant:performance` (`scripts/explain-assistant.mjs`):
   - Measures actual database query counts across search, eligibility, recommendations, saved deadlines, and worst-case 4-tool requests.
4. `npm run test:assistant:hosted` (`scripts/verify-assistant-hosted.mjs`):
   - Uses `MockAssistantModel` (0 paid API credits).
   - Verifies migration `20260924000300_ai_assistant_limits.sql` applied (total 12 migrations).
   - Tests `claim_assistant_request` and `release_assistant_request` on hosted Supabase.
   - 100% table inventory conservation; 0 event fixtures created.

---

## 19. Proposed File Tree Changes

### New Files to Create
```
supabase/migrations/
└── 20260924000300_ai_assistant_limits.sql    # Single additive rate-limit migration

src/
├── app/
│   ├── api/
│   │   └── assistant/
│   │       └── route.ts                      # Authenticated assistant endpoint with finally lease release
│   └── assistant/
│       └── page.tsx                          # Authenticated assistant UI page
├── components/
│   ├── assistant-chat.tsx                    # Chat thread, plain text bubbles, prompt pills & event cards
│   └── assistant-facts.tsx                   # Authoritative facts rendering card
└── lib/
    └── assistant/
        ├── index.ts                          # Public module exports
        ├── model.ts                          # AssistantModel interface & factory
        ├── mock-model.ts                     # Deterministic MockAssistantModel
        ├── gemini-model.ts                   # Native Gemini REST adapter
        ├── openai-model.ts                   # Native OpenAI REST adapter
        ├── orchestrator.ts                   # Multi-turn tool execution loop & bounds
        ├── tools.ts                          # Bounded tool definitions & handlers
        ├── prompts.ts                        # System instructions & context templates
        ├── sanitizer.ts                      # Entity extractor, prose safety check & text sanitizer
        └── types.ts                          # Request/response interfaces & schemas

tests/
└── assistant/
    └── assistant.test.mjs                    # Complete unit, security & rate-limit suite

scripts/
├── explain-assistant.mjs                     # Query count & performance measurement script
├── test-assistant-ui.mjs                     # Playwright multi-viewport UI test
└── verify-assistant-hosted.mjs               # Hosted Supabase verification script
```

### Existing Files to Modify
- `package.json`: Add test scripts (`test:assistant`, `test:assistant:ui`, `test:assistant:performance`, `test:assistant:hosted`) and update `test` script.
- `src/components/public-events.tsx`: Add `"Assistant"` link to `DiscoveryShell` navigation when authenticated.
- `src/lib/supabase/database.types.ts`: Regenerated types including `claim_assistant_request` and `release_assistant_request`.
- `README.md` & `PROJECT_STATE.md`: Update milestone progress and documentation references.
- `docs/section-36-ai-assistant-review.md`: Create milestone review document upon completion.

---

## 20. Limitations & Deferred Features

1. **Hypothetical Profile Overrides**: Deferred to a post-beta milestone; V1 evaluates stored profile facts only.
2. **Persistent Chat History**: Ephemeral client-state sessions for V1; zero database chat tables.
3. **No External Web Browsing or Live Scraping**: The assistant only knows about opportunities present in the canonical database. C09–C11 and C17 remain deferred.
4. **No Document / Resume Parsing**: PDF resume uploads and skill inference are out of scope.
5. **No Automatic Notification Dispatch**: The assistant does not trigger email sends or schedule calendar events directly.
6. **C19 Visual Redesign**: The UI strictly uses existing Tailwind primitives and layout patterns without introducing C19 design changes.
