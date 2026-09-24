import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type { ModelToolDefinition } from "./types";
import { searchPublishedEvents } from "../events/public-search";
import { readPublishedEvent, type PublicEventCard } from "../events/public";
import { readForYou } from "../for-you/service";
import { readSaved } from "../saves/service";
import { readOwnProfile } from "../profiles/service";
import { evaluateEligibility } from "../recommendations/eligibility";
import type { StudentFacts } from "../recommendations/types";
import { dateFact } from "../events/presentation";
import { uuid } from "../events/validation";

export const TOOL_DEFINITIONS: ModelToolDefinition[] = [
  {
    name: "search_events",
    description:
      "Search published student technology opportunities in the catalogue using keywords, category, participation mode, skills, domain, location, or dates.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords, title, topic or skill search term (max 100 chars)",
        },
        domain: {
          type: "string",
          description: "Domain or interest area, e.g. web, ai, mobile (max 50 chars)",
        },
        skill: {
          type: "string",
          description: "Specific skill name, e.g. python, react, rust (max 50 chars)",
        },
        category: {
          type: "string",
          enum: [
            "hackathon",
            "coding_competition",
            "workshop",
            "conference",
            "student_technology_event",
          ],
        },
        mode: {
          type: "string",
          enum: ["online", "offline", "hybrid"],
        },
        city: {
          type: "string",
          description: "City name for in-person/hybrid events (max 50 chars)",
        },
        country: {
          type: "string",
          description: "2-letter uppercase ISO country code, e.g. IN, US",
        },
        date_from: {
          type: "string",
          description: "Earliest event start date (YYYY-MM-DD)",
        },
        date_to: {
          type: "string",
          description: "Latest event start date (YYYY-MM-DD)",
        },
        deadline_from: {
          type: "string",
          description: "Earliest registration deadline date (YYYY-MM-DD)",
        },
        deadline_to: {
          type: "string",
          description: "Latest registration deadline date (YYYY-MM-DD)",
        },
        fee: {
          type: "string",
          enum: ["free", "paid", "varies"],
        },
        registration_status: {
          type: "string",
          enum: ["open", "not_open", "closed"],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_event_detail",
    description:
      "Retrieve full canonical facts, descriptions, eligibility guidelines, fees, prizes, and links for a specific published opportunity by slug or UUID.",
    parameters: {
      type: "object",
      properties: {
        slug_or_id: {
          type: "string",
          description: "The event slug (e.g. hack-india-2026) or UUID",
        },
      },
      required: ["slug_or_id"],
      additionalProperties: false,
    },
  },
  {
    name: "compare_events",
    description:
      "Compare 2 or 3 opportunities side-by-side across category, mode, dates, registration deadline, team size, fee, prizes, and personalized eligibility.",
    parameters: {
      type: "object",
      properties: {
        slugs_or_ids: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 3,
          description: "List of 2 or 3 event slugs or UUIDs to compare",
        },
      },
      required: ["slugs_or_ids"],
      additionalProperties: false,
    },
  },
  {
    name: "evaluate_event_eligibility",
    description:
      "Deterministically evaluate whether the current student is eligible for an event based on their saved profile rules and the event's requirements.",
    parameters: {
      type: "object",
      properties: {
        event_id: {
          type: "string",
          description: "Canonical UUID of the published event to evaluate",
        },
      },
      required: ["event_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_user_recommendations",
    description:
      "Retrieve the student's personalized recommendations (Best Matches and Worth Reviewing) computed by the deterministic recommendation engine.",
    parameters: {
      type: "object",
      properties: {
        tier: {
          type: "string",
          enum: ["all", "best_matches", "worth_reviewing"],
          description: "Filter by recommendation tier (default: all)",
        },
        limit: {
          type: "integer",
          description: "Maximum number of recommendations to return (1-10, default: 5)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_saved_events",
    description:
      "Retrieve the opportunities currently bookmarked/saved by the authenticated student.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximum number of saved events to return (1-10, default: 5)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_upcoming_saved_deadlines",
    description:
      "Retrieve saved events sorted chronologically by active registration deadline, indicating which ones close soonest.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximum number of deadlines to return (1-10, default: 5)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_user_profile_summary",
    description:
      "Retrieve the authenticated student's academic and skill preferences (study year, degree, skills, interests) to personalize guidance.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

export async function executeTool(
  client: SupabaseClient<Database>,
  userId: string,
  toolName: string,
  rawArgs: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case "search_events": {
      const q = typeof rawArgs.query === "string" ? rawArgs.query.trim().slice(0, 100) : undefined;
      const domain = typeof rawArgs.domain === "string" ? rawArgs.domain.trim().slice(0, 50) : undefined;
      const skill = typeof rawArgs.skill === "string" ? rawArgs.skill.trim().slice(0, 50) : undefined;
      const category = typeof rawArgs.category === "string" ? rawArgs.category.trim() : undefined;
      const mode = typeof rawArgs.mode === "string" ? rawArgs.mode.trim() : undefined;
      const city = typeof rawArgs.city === "string" ? rawArgs.city.trim().slice(0, 50) : undefined;
      const country = typeof rawArgs.country === "string" && /^[A-Z]{2}$/i.test(rawArgs.country.trim())
        ? rawArgs.country.trim().toUpperCase()
        : undefined;
      const fee = typeof rawArgs.fee === "string" ? rawArgs.fee.trim() : undefined;
      const registration = typeof rawArgs.registration_status === "string" ? rawArgs.registration_status.trim() : undefined;
      const date_from = typeof rawArgs.date_from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawArgs.date_from) ? rawArgs.date_from : undefined;
      const date_to = typeof rawArgs.date_to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawArgs.date_to) ? rawArgs.date_to : undefined;
      const deadline_from = typeof rawArgs.deadline_from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawArgs.deadline_from) ? rawArgs.deadline_from : undefined;
      const deadline_to = typeof rawArgs.deadline_to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawArgs.deadline_to) ? rawArgs.deadline_to : undefined;

      const filters = {
        q: q || (skill ? skill : domain ? domain : undefined),
        domain,
        category,
        mode,
        city,
        country,
        fee,
        registration,
        date_from,
        date_to,
        deadline_from,
        deadline_to,
        sort: "relevance",
      };

      const result = await searchPublishedEvents(filters);
      if (!result.ok) {
        return { error: "Failed to search opportunities in platform catalogue." };
      }

      const items = result.value.items.slice(0, 10).map((e: PublicEventCard) => {
        const deadline = e.event_deadlines.find((d) => d.active && d.is_primary && d.kind === "registration");
        const deadlineFormatted = deadline
          ? dateFact(deadline.local_date, deadline.precision === "datetime" ? deadline.due_at : null, deadline.timezone).text
          : "Not specified in the platform data";

        return {
          id: e.id,
          slug: e.slug,
          title: e.title,
          organizer_name: e.organizers?.name ?? null,
          category: e.event_categories?.name ?? null,
          mode: e.mode,
          city: e.city,
          country: e.country,
          start_date: e.start_date,
          end_date: e.end_date,
          registration_status: e.registration_status,
          registration_deadline: deadlineFormatted,
          verification_level: e.verification_level,
        };
      });

      return { count: items.length, items };
    }

    case "get_event_detail": {
      const slugOrId = typeof rawArgs.slug_or_id === "string" ? rawArgs.slug_or_id.trim() : "";
      if (!slugOrId) return { error: "Missing required slug_or_id." };

      const key = uuid(slugOrId) ? { id: slugOrId } : { slug: slugOrId };
      const result = await readPublishedEvent(key);
      if (!result.ok) return { error: `Opportunity '${slugOrId}' not found in published catalogue.` };

      const e = result.value;
      const primaryDeadline = e.registration_deadline
        ? dateFact(
            e.registration_deadline.local_date,
            e.registration_deadline.precision === "datetime" ? e.registration_deadline.due_at : null,
            e.registration_deadline.timezone
          ).text
        : "Not specified in the platform data";

      return {
        id: e.id,
        slug: e.slug,
        title: e.title,
        organizer_name: e.organizers?.name ?? null,
        category: e.event_categories?.name ?? null,
        mode: e.mode,
        location: [e.venue, e.city, e.state, e.country].filter(Boolean).join(", ") || "Not specified in the platform data",
        start_date: e.start_date,
        end_date: e.end_date,
        timezone: e.timezone,
        registration_status: e.registration_status,
        registration_deadline: primaryDeadline,
        short_description: (e.short_description || "").slice(0, 1000) || "Not specified in the platform data",
        full_description: (e.full_description || "").slice(0, 1000) || null,
        eligibility_text: (e.eligibility_text || "").slice(0, 1000) || "Not specified in the platform data",
        individual_allowed: e.individual_allowed,
        team_size: e.min_team_size || e.max_team_size ? `${e.min_team_size || 1} - ${e.max_team_size || "unspecified"}` : "Not specified in the platform data",
        fee_status: e.fee_status,
        fee_amount: e.fee,
        currency: e.currency,
        prize_pool: e.prize_pool,
        prize_description: e.prize_description,
        verification_level: e.verification_level,
        official_url: e.official_url,
        registration_url: e.registration_url,
      };
    }

    case "compare_events": {
      const slugsOrIds = Array.isArray(rawArgs.slugs_or_ids)
        ? rawArgs.slugs_or_ids.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
        : [];

      if (slugsOrIds.length < 2) {
        return { error: "compare_events requires 2 or 3 event slugs or IDs." };
      }

      const [eventsResults, profileData] = await Promise.all([
        Promise.all(slugsOrIds.map((val) => readPublishedEvent(uuid(val) ? { id: val } : { slug: val }))),
        readOwnProfile(client, userId),
      ]);

      const publishedIds = eventsResults.filter((r) => r.ok).map((r) => r.value.id);
      const { data: rulesData } = publishedIds.length > 0
        ? await client.from("events").select("id, eligibility_rules, verification_status").in("id", publishedIds)
        : { data: [] };
      const rulesMap = new Map((rulesData ?? []).map((r) => [r.id, r]));

      const comparisons = [];
      for (const res of eventsResults) {
        if (!res.ok) continue;
        const ev = res.value;

        let eligState: "eligible" | "ineligible" | "unknown" = "unknown";
        let eligReasons: string[] = [];

        if (profileData) {
          const evRules = rulesMap.get(ev.id);
          if (evRules && evRules.eligibility_rules) {
            const facts: StudentFacts = {
              student_status: null,
              degree: profileData.profile.degree ?? null,
              study_year: profileData.profile.study_year ?? null,
              institution: profileData.profile.institution ?? null,
              participation_country: profileData.profile.country ?? null,
              team_size: null,
            };
            const isCurrent = evRules.verification_status === "current";
            const eligRes = evaluateEligibility(evRules.eligibility_rules, facts, isCurrent);
            eligState = eligRes.state;
            eligReasons = eligRes.explanations.map((exp) => exp.message);
          }
        }

        const deadlineText = ev.registration_deadline
          ? dateFact(
              ev.registration_deadline.local_date,
              ev.registration_deadline.precision === "datetime" ? ev.registration_deadline.due_at : null,
              ev.registration_deadline.timezone
            ).text
          : "Not specified in the platform data";

        comparisons.push({
          id: ev.id,
          slug: ev.slug,
          title: ev.title,
          category: ev.event_categories?.name ?? null,
          mode: ev.mode,
          dates: ev.start_date || ev.end_date ? `${ev.start_date || "Unknown"} to ${ev.end_date || "Unknown"}` : "Not specified in the platform data",
          registration_deadline: deadlineText,
          location: [ev.city, ev.country].filter(Boolean).join(", ") || "Not specified in the platform data",
          fee: ev.fee_status === "free" ? "Free" : ev.fee ? `${ev.fee} ${ev.currency || ""}` : "Not specified in the platform data",
          prize: ev.prize_pool ? `${ev.prize_pool} ${ev.prize_currency || ""}` : "Not specified in the platform data",
          eligibility_state: eligState,
          eligibility_reasons: eligReasons,
          verification_level: ev.verification_level,
          official_url: ev.official_url,
          registration_url: ev.registration_url,
        });
      }

      return { count: comparisons.length, comparisons };
    }

    case "evaluate_event_eligibility": {
      const eventId = typeof rawArgs.event_id === "string" ? rawArgs.event_id.trim() : "";
      if (!uuid(eventId)) {
        return { error: "Valid event_id UUID is required." };
      }

      const [evRes, profileData, rulesQuery] = await Promise.all([
        readPublishedEvent({ id: eventId }),
        readOwnProfile(client, userId),
        client.from("events").select("id, eligibility_rules, verification_status").eq("id", eventId).maybeSingle(),
      ]);

      if (!evRes.ok) {
        return { error: "Opportunity not found in published catalogue." };
      }
      if (!profileData) {
        return {
          eventId,
          eventTitle: evRes.value.title,
          eventSlug: evRes.value.slug,
          state: "unknown",
          reasons: ["Student profile not found. Please complete your profile in Account."],
          missingFacts: ["profile"],
        };
      }

      const ev = evRes.value;
      const facts: StudentFacts = {
        student_status: null,
        degree: profileData.profile.degree ?? null,
        study_year: profileData.profile.study_year ?? null,
        institution: profileData.profile.institution ?? null,
        participation_country: profileData.profile.country ?? null,
        team_size: null,
      };

      const evRules = rulesQuery.data;
      const isCurrent = evRules?.verification_status === "current";
      const result = evaluateEligibility(evRules?.eligibility_rules ?? null, facts, isCurrent);

      return {
        eventId: ev.id,
        eventTitle: ev.title,
        eventSlug: ev.slug,
        state: result.state,
        reasons: result.explanations.map((exp) => exp.message),
        missingFacts: result.state === "unknown" ? ["specific_eligibility_criteria"] : [],
      };
    }

    case "get_user_recommendations": {
      const tierFilter = typeof rawArgs.tier === "string" ? rawArgs.tier.trim() : "all";
      const limit = typeof rawArgs.limit === "number" && rawArgs.limit >= 1 && rawArgs.limit <= 10 ? rawArgs.limit : 5;

      const recResult = await readForYou();
      if (recResult.kind !== "ready") {
        return { error: "Recommendations are currently unavailable. Ensure your profile is set up." };
      }

      const best = (tierFilter === "worth_reviewing" ? [] : recResult.best).map((item) => ({
        eventId: item.event.id,
        title: item.event.title,
        slug: item.event.slug,
        tier: "best" as const,
        score: typeof item.score === "number" ? item.score : null,
        matchFactors: item.reasons,
      }));

      const review = (tierFilter === "best_matches" ? [] : recResult.review).map((item) => ({
        eventId: item.event.id,
        title: item.event.title,
        slug: item.event.slug,
        tier: "review" as const,
        score: typeof item.score === "number" ? item.score : null,
        matchFactors: item.reasons,
      }));

      const combined = [...best, ...review].slice(0, limit);

      return {
        count: combined.length,
        items: combined,
      };
    }

    case "get_saved_events": {
      const limit = typeof rawArgs.limit === "number" && rawArgs.limit >= 1 && rawArgs.limit <= 10 ? rawArgs.limit : 5;
      const savedRes = await readSaved();
      if (savedRes.kind !== "ready") {
        return { count: 0, items: [] };
      }

      const items = savedRes.items.slice(0, limit).map((e) => {
        const deadline = e.event_deadlines.find((d) => d.active && d.is_primary && d.kind === "registration");
        const deadlineText = deadline
          ? dateFact(deadline.local_date, deadline.precision === "datetime" ? deadline.due_at : null, deadline.timezone).text
          : "Not specified in the platform data";

        return {
          id: e.id,
          slug: e.slug,
          title: e.title,
          category: e.event_categories?.name ?? null,
          mode: e.mode,
          start_date: e.start_date,
          end_date: e.end_date,
          registration_status: e.registration_status,
          registration_deadline: deadlineText,
          verification_level: e.verification_level,
        };
      });

      return { count: items.length, items };
    }

    case "get_upcoming_saved_deadlines": {
      const limit = typeof rawArgs.limit === "number" && rawArgs.limit >= 1 && rawArgs.limit <= 10 ? rawArgs.limit : 5;
      const savedRes = await readSaved();
      if (savedRes.kind !== "ready") {
        return { count: 0, deadlines: [] };
      }

      const activeDeadlines: Array<{
        eventId: string;
        eventTitle: string;
        eventSlug: string;
        deadlineKind: string;
        deadlineLabel: string;
        localDate: string | null;
        dueAt: string | null;
        timezone: string | null;
        precision: "date_only" | "datetime" | "unknown";
        effectiveDateKey: string;
        isOpen: boolean;
      }> = [];

      for (const ev of savedRes.items) {
        const regDeadline = ev.event_deadlines.find((d) => d.active && d.is_primary && d.kind === "registration");
        if (!regDeadline) continue;

        const effectiveDateKey = regDeadline.local_date ?? (regDeadline.due_at ? regDeadline.due_at.slice(0, 10) : "9999-99-99");
        activeDeadlines.push({
          eventId: ev.id,
          eventTitle: ev.title,
          eventSlug: ev.slug,
          deadlineKind: regDeadline.kind,
          deadlineLabel: regDeadline.label,
          localDate: regDeadline.local_date,
          dueAt: regDeadline.due_at,
          timezone: regDeadline.timezone,
          precision: regDeadline.precision === "datetime" ? "datetime" : regDeadline.precision === "date_only" ? "date_only" : "unknown",
          effectiveDateKey,
          isOpen: ev.registration_status === "open",
        });
      }

      // Deterministic mixed-precision tie-break sort:
      // 1. Primary sort: effective calendar date YYYY-MM-DD
      // 2. Same date: datetime before date_only
      // 3. Final tie-break: eventId ASC
      activeDeadlines.sort((a, b) => {
        const dateCmp = a.effectiveDateKey.localeCompare(b.effectiveDateKey);
        if (dateCmp !== 0) return dateCmp;

        if (a.precision === "datetime" && b.precision === "date_only") return -1;
        if (a.precision === "date_only" && b.precision === "datetime") return 1;

        if (a.precision === "datetime" && b.precision === "datetime" && a.dueAt && b.dueAt) {
          const instantCmp = a.dueAt.localeCompare(b.dueAt);
          if (instantCmp !== 0) return instantCmp;
        }

        return a.eventId.localeCompare(b.eventId);
      });

      const sliced = activeDeadlines.slice(0, limit);
      return { count: sliced.length, deadlines: sliced };
    }

    case "get_user_profile_summary": {
      const profileData = await readOwnProfile(client, userId);
      if (!profileData) {
        return { status: "not_found", message: "Student profile not set up yet." };
      }

      // Data minimization: exclude institution, email, user_id, full name
      return {
        study_year: profileData.profile.study_year,
        degree: profileData.profile.degree,
        skills: profileData.skills.filter((s) => profileData.selectedSkills.includes(s.id)).map((s) => s.name),
        interests: profileData.interests.filter((i) => profileData.selectedInterests.includes(i.id)).map((i) => i.name),
        preferred_modes: profileData.profile.preferred_modes,
        preferred_categories: profileData.profile.preferred_categories,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
