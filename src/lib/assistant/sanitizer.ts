import "server-only";
import type {
  AssistantEventReference,
  AuthoritativeFacts,
} from "./types";

export function cleanSafePlainText(rawText: string): string {
  if (!rawText) return "";

  // 1. Remove dangerous blocks and tags
  let cleaned = rawText
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<[^>]+>/g, ""); // Strip all HTML tags

  // 2. Disarm markdown links [title](url) to plain text "title" to prevent model-directed phishing
  cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");

  // 3. Disarm raw protocol schemes if typed in plain text
  cleaned = cleaned.replace(/(javascript|data|file|vbscript):/gi, "$1_disarmed:");

  // 4. Normalize excess blank lines while preserving intentional paragraphs
  cleaned = cleaned.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}

export function extractCanonicalEvents(
  toolResults: Array<{ toolName: string; result: unknown }>
): AssistantEventReference[] {
  const eventsMap = new Map<string, AssistantEventReference>();

  for (const tr of toolResults) {
    const res = tr.result as Record<string, unknown> | null;
    if (!res || typeof res !== "object") continue;

    // From search_events
    if (tr.toolName === "search_events" && Array.isArray(res.items)) {
      for (const raw of res.items) {
        const item = raw as Record<string, unknown>;
        if (item && item.id && item.slug && item.title) {
          eventsMap.set(String(item.id), {
            id: String(item.id),
            slug: String(item.slug),
            title: String(item.title),
            organizerName: (item.organizer_name as string) ?? null,
            categoryName: (item.category as string) ?? null,
            mode: (item.mode as string) ?? null,
            datesSummary: item.start_date || item.end_date ? `${String(item.start_date || "Unknown")} to ${String(item.end_date || "Unknown")}` : null,
            deadlineSummary: (item.registration_deadline as string) ?? null,
            registrationStatus: (item.registration_status as string) ?? null,
            verificationLevel: (item.verification_level as string) ?? null,
            officialUrl: (item.official_url as string) ?? null,
            registrationUrl: (item.registration_url as string) ?? null,
          });
        }
      }
    }

    // From get_event_detail
    if (tr.toolName === "get_event_detail" && res.id && res.slug && res.title) {
      const detail = res;
      eventsMap.set(String(detail.id), {
        id: String(detail.id),
        slug: String(detail.slug),
        title: String(detail.title),
        organizerName: (detail.organizer_name as string) ?? null,
        categoryName: (detail.category as string) ?? null,
        mode: (detail.mode as string) ?? null,
        datesSummary: detail.start_date || detail.end_date ? `${String(detail.start_date || "Unknown")} to ${String(detail.end_date || "Unknown")}` : null,
        deadlineSummary: (detail.registration_deadline as string) ?? null,
        registrationStatus: (detail.registration_status as string) ?? null,
        verificationLevel: (detail.verification_level as string) ?? null,
        officialUrl: (detail.official_url as string) ?? null,
        registrationUrl: (detail.registration_url as string) ?? null,
      });
    }

    // From compare_events
    if (tr.toolName === "compare_events" && Array.isArray(res.comparisons)) {
      for (const raw of res.comparisons) {
        const comp = raw as Record<string, unknown>;
        if (comp && comp.id && comp.slug && comp.title) {
          eventsMap.set(String(comp.id), {
            id: String(comp.id),
            slug: String(comp.slug),
            title: String(comp.title),
            organizerName: null,
            categoryName: (comp.category as string) ?? null,
            mode: (comp.mode as string) ?? null,
            datesSummary: (comp.dates as string) ?? null,
            deadlineSummary: (comp.registration_deadline as string) ?? null,
            registrationStatus: null,
            verificationLevel: (comp.verification_level as string) ?? null,
            officialUrl: (comp.official_url as string) ?? null,
            registrationUrl: (comp.registration_url as string) ?? null,
          });
        }
      }
    }

    // From evaluate_event_eligibility
    if (tr.toolName === "evaluate_event_eligibility" && res.eventId && res.eventSlug && res.eventTitle) {
      const evId = String(res.eventId);
      if (!eventsMap.has(evId)) {
        eventsMap.set(evId, {
          id: evId,
          slug: String(res.eventSlug),
          title: String(res.eventTitle),
          organizerName: null,
          categoryName: null,
          mode: null,
          datesSummary: null,
          deadlineSummary: null,
          registrationStatus: null,
          verificationLevel: null,
        });
      }
    }

    // From get_user_recommendations
    if (tr.toolName === "get_user_recommendations" && Array.isArray(res.items)) {
      for (const raw of res.items) {
        const item = raw as Record<string, unknown>;
        if (item && item.eventId && item.slug && item.title) {
          const evId = String(item.eventId);
          if (!eventsMap.has(evId)) {
            eventsMap.set(evId, {
              id: evId,
              slug: String(item.slug),
              title: String(item.title),
              organizerName: null,
              categoryName: null,
              mode: null,
              datesSummary: null,
              deadlineSummary: null,
              registrationStatus: null,
              verificationLevel: null,
            });
          }
        }
      }
    }

    // From get_saved_events
    if (tr.toolName === "get_saved_events" && Array.isArray(res.items)) {
      for (const raw of res.items) {
        const item = raw as Record<string, unknown>;
        if (item && item.id && item.slug && item.title) {
          eventsMap.set(String(item.id), {
            id: String(item.id),
            slug: String(item.slug),
            title: String(item.title),
            organizerName: null,
            categoryName: (item.category as string) ?? null,
            mode: (item.mode as string) ?? null,
            datesSummary: item.start_date || item.end_date ? `${String(item.start_date || "Unknown")} to ${String(item.end_date || "Unknown")}` : null,
            deadlineSummary: (item.registration_deadline as string) ?? null,
            registrationStatus: (item.registration_status as string) ?? null,
            verificationLevel: (item.verification_level as string) ?? null,
          });
        }
      }
    }

    // From get_upcoming_saved_deadlines
    if (tr.toolName === "get_upcoming_saved_deadlines" && Array.isArray(res.deadlines)) {
      for (const raw of res.deadlines) {
        const d = raw as Record<string, unknown>;
        if (d && d.eventId && d.eventSlug && d.eventTitle) {
          const evId = String(d.eventId);
          if (!eventsMap.has(evId)) {
            eventsMap.set(evId, {
              id: evId,
              slug: String(d.eventSlug),
              title: String(d.eventTitle),
              organizerName: null,
              categoryName: null,
              mode: null,
              datesSummary: null,
              deadlineSummary: (d.deadlineLabel as string) || null,
              registrationStatus: d.isOpen ? "open" : "closed",
              verificationLevel: null,
            });
          }
        }
      }
    }
  }

  return Array.from(eventsMap.values()).slice(0, 10);
}

export function extractAuthoritativeFacts(
  toolResults: Array<{ toolName: string; result: unknown }>
): AuthoritativeFacts {
  const facts: AuthoritativeFacts = {};

  for (const tr of toolResults) {
    const res = tr.result as Record<string, unknown> | null;
    if (!res || typeof res !== "object") continue;

    if (tr.toolName === "evaluate_event_eligibility" && res.eventId) {
      if (!facts.eligibility) facts.eligibility = [];
      facts.eligibility.push({
        eventId: String(res.eventId),
        eventTitle: String(res.eventTitle || "Opportunity"),
        eventSlug: String(res.eventSlug || ""),
        state: res.state === "eligible" || res.state === "ineligible" ? res.state : "unknown",
        reasons: Array.isArray(res.reasons) ? (res.reasons as string[]) : [],
        missingFacts: Array.isArray(res.missingFacts) ? (res.missingFacts as string[]) : [],
      });
    }

    if (tr.toolName === "compare_events" && Array.isArray(res.comparisons)) {
      facts.comparisons = (res.comparisons as Record<string, unknown>[]).map((c) => ({
        eventId: String(c.id || ""),
        eventTitle: String(c.title || ""),
        eventSlug: String(c.slug || ""),
        category: (c.category as string) ?? null,
        mode: (c.mode as string) ?? null,
        dates: (c.dates as string) ?? null,
        deadline: (c.registration_deadline as string) ?? null,
        fee: (c.fee as string) ?? null,
        prize: (c.prize as string) ?? null,
        eligibilityState: c.eligibility_state === "eligible" || c.eligibility_state === "ineligible" ? c.eligibility_state : c.eligibility_state === "unknown" ? "unknown" : undefined,
        verificationLevel: (c.verification_level as string) ?? null,
      }));
    }

    if (tr.toolName === "get_upcoming_saved_deadlines" && Array.isArray(res.deadlines)) {
      facts.deadlines = (res.deadlines as Record<string, unknown>[]).map((d) => ({
        eventId: String(d.eventId || ""),
        eventTitle: String(d.eventTitle || ""),
        eventSlug: String(d.eventSlug || ""),
        deadlineKind: String(d.deadlineKind || ""),
        deadlineLabel: String(d.deadlineLabel || ""),
        localDate: (d.localDate as string) ?? null,
        dueAt: (d.dueAt as string) ?? null,
        timezone: (d.timezone as string) ?? null,
        precision: d.precision === "datetime" || d.precision === "date_only" ? d.precision : "unknown",
        isOpen: Boolean(d.isOpen),
      }));
    }

    if (tr.toolName === "get_user_recommendations" && Array.isArray(res.items)) {
      facts.recommendations = {
        tier: "all",
        items: (res.items as Record<string, unknown>[]).map((item) => ({
          eventId: String(item.eventId || ""),
          title: String(item.title || ""),
          slug: String(item.slug || ""),
          tier: item.tier === "best" ? "best" : "review",
          score: typeof item.score === "number" ? item.score : null,
          matchFactors: Array.isArray(item.matchFactors) ? (item.matchFactors as string[]) : [],
        })),
      };
    }
  }

  return facts;
}

export function verifyProseFactualSafety(
  prose: string,
  facts: AuthoritativeFacts
): { safeProse: string; wasModified: boolean } {
  let safeProse = cleanSafePlainText(prose);
  let wasModified = false;

  // Check 1: Contradictory Eligibility Claims (single event)
  if (facts.eligibility && facts.eligibility.length > 0) {
    for (const elig of facts.eligibility) {
      if (elig.state === "ineligible") {
        const lower = safeProse.toLowerCase();
        if (
          lower.includes("you are eligible") ||
          lower.includes("you qualify") ||
          lower.includes("you meet all requirements")
        ) {
          safeProse = `According to your saved student profile and platform records, you are currently ineligible for ${elig.eventTitle}.\n\nEvaluator reasons:\n• ${elig.reasons.join("\n• ")}`;
          wasModified = true;
          break;
        }
      } else if (elig.state === "unknown") {
        const lower = safeProse.toLowerCase();
        if (lower.includes("you are eligible") || lower.includes("you are definitely eligible")) {
          safeProse = `Based on available platform catalogue data, your eligibility for ${elig.eventTitle} cannot be definitively determined.\n\nDetails:\n• ${elig.reasons.join("\n• ")}`;
          wasModified = true;
          break;
        }
      }
    }
  }

  // Check 2: Contradictory Eligibility Claims, Fabricated Prizes, and Fabricated Fees in Comparisons
  if (facts.comparisons && facts.comparisons.length > 0) {
    for (const comp of facts.comparisons) {
      if (comp.eligibilityState === "ineligible") {
        const lower = safeProse.toLowerCase();
        if (
          lower.includes(`eligible for ${comp.eventTitle.toLowerCase()}`) ||
          lower.includes(`qualify for ${comp.eventTitle.toLowerCase()}`)
        ) {
          safeProse += `\n\n[Authoritative Platform Record: You are evaluated as ineligible for ${comp.eventTitle} based on your saved profile.]`;
          wasModified = true;
        }
      }

      // Fabricated Prize when prize is unspecified
      if (!comp.prize || comp.prize.includes("Not specified")) {
        const lower = safeProse.toLowerCase();
        if (
          (/[\$₹€£]\s*\d+/i.test(safeProse) || /\b(inr|usd|eur|gbp)\s*\d+/i.test(safeProse)) &&
          (lower.includes(comp.eventTitle.toLowerCase()) || facts.comparisons.length === 1)
        ) {
          safeProse += `\n\n[Authoritative Platform Record: The prize pool for ${comp.eventTitle} is not specified in platform data.]`;
          wasModified = true;
        }
      }

      // Fabricated Fee when event is free
      if (comp.fee === "Free") {
        const lower = safeProse.toLowerCase();
        if (lower.includes("registration fee") || lower.includes("entry fee") || lower.includes("costs ")) {
          safeProse += `\n\n[Authoritative Platform Record: ${comp.eventTitle} is free of charge according to platform records.]`;
          wasModified = true;
        }
      }
    }
  }

  // Check 3: Fabricated Recommendation Scores for null score items
  if (facts.recommendations?.items) {
    const hasNullScore = facts.recommendations.items.some((item) => item.score === null);
    if (hasNullScore) {
      const matchScorePattern = /\b\d{1,3}%\s+match\b/i;
      const scorePattern = /\bmatch\s+score\s+(?:of\s+)?\d+/i;
      if (matchScorePattern.test(safeProse) || scorePattern.test(safeProse)) {
        safeProse += "\n\n[Authoritative Platform Record: Recommendation match scores are not numerically assigned when profile evidence coverage is incomplete.]";
        wasModified = true;
      }
    }
  }

  // Check 4: Fabricated Deadlines & Midnight conversions
  if (facts.deadlines) {
    if (facts.deadlines.length === 0) {
      const lower = safeProse.toLowerCase();
      if (lower.includes("deadline is") || lower.includes("upcoming deadline")) {
        safeProse = "According to your saved platform records, there are currently no upcoming application or registration deadlines.";
        wasModified = true;
      }
    } else {
      for (const d of facts.deadlines) {
        if (d.precision === "date_only") {
          const lower = safeProse.toLowerCase();
          if (
            lower.includes("midnight") ||
            lower.includes("11:59 pm") ||
            lower.includes("12:00 am") ||
            lower.includes("23:59")
          ) {
            safeProse += `\n\n[Authoritative Platform Record: The registration deadline for ${d.eventTitle} closes on calendar date ${d.localDate} without a specific cutoff time.]`;
            wasModified = true;
            break;
          }
        }
      }
    }
  }

  return { safeProse, wasModified };
}
