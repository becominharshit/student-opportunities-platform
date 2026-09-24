import "server-only";
import type {
  AssistantModel,
  ModelGenerateOptions,
  ModelGenerateResponse,
} from "./types";

export class MockAssistantModel implements AssistantModel {
  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResponse> {
    const userMessages = options.messages.filter((m) => m.role === "user");
    const lastUserMessage = (userMessages.at(-1)?.content || "").toLowerCase();
    const toolMessages = options.messages.filter((m) => m.role === "tool");

    // Phase 1: Tool Selection (No tool messages yet)
    if (toolMessages.length === 0) {
      // 1. General non-factual fast-path check
      if (
        lastUserMessage.includes("what can you do") ||
        lastUserMessage.includes("how do i use") ||
        lastUserMessage.includes("help me with") ||
        lastUserMessage === "hello" ||
        lastUserMessage === "hi"
      ) {
        return {
          content:
            "I can help you explore student technology opportunities published in the platform catalogue. You can ask me to find hackathons, evaluate your eligibility based on your saved profile, check your upcoming saved deadlines, compare opportunities, or view personalized recommendations.",
          finishReason: "stop",
        };
      }

      // 2. Specific intent simulation
      if (lastUserMessage.includes("compare")) {
        // Extract words or ids if possible, or pass two dummy identifiers that orchestrator will replace
        return {
          content: null,
          toolCalls: [
            {
              id: "call_comp_1",
              name: "compare_events",
              arguments: {
                slugs_or_ids: ["hackathon-alpha", "conference-beta"],
              },
            },
          ],
          finishReason: "tool_calls",
        };
      }

      if (
        lastUserMessage.includes("eligible") ||
        lastUserMessage.includes("eligibility") ||
        lastUserMessage.includes("qualify")
      ) {
        return {
          content: null,
          toolCalls: [
            {
              id: "call_elig_1",
              name: "evaluate_event_eligibility",
              arguments: {
                event_id: "00000000-0000-0000-0000-000000000001",
              },
            },
          ],
          finishReason: "tool_calls",
        };
      }

      if (
        lastUserMessage.includes("recommend") ||
        lastUserMessage.includes("for you") ||
        lastUserMessage.includes("fit me") ||
        lastUserMessage.includes("suit me")
      ) {
        return {
          content: null,
          toolCalls: [
            {
              id: "call_rec_1",
              name: "get_user_recommendations",
              arguments: {
                tier: "all",
                limit: 5,
              },
            },
          ],
          finishReason: "tool_calls",
        };
      }

      if (
        lastUserMessage.includes("saved") ||
        lastUserMessage.includes("deadline") ||
        lastUserMessage.includes("closing")
      ) {
        return {
          content: null,
          toolCalls: [
            {
              id: "call_deadlines_1",
              name: "get_upcoming_saved_deadlines",
              arguments: {
                limit: 5,
              },
            },
          ],
          finishReason: "tool_calls",
        };
      }

      // Default to search_events
      const queryTerm = lastUserMessage.replace(/[^a-z0-9\s]/gi, "").trim();
      return {
        content: null,
        toolCalls: [
          {
            id: "call_search_1",
            name: "search_events",
            arguments: {
              query: queryTerm || "technology",
            },
          },
        ],
        finishReason: "tool_calls",
      };
    }

    // Phase 2: Grounded Synthesis from tool results
    if (lastUserMessage.includes("eligible") || lastUserMessage.includes("eligibility")) {
      return {
        content:
          "Based on the platform catalogue records and your saved student profile, here is your eligibility evaluation.",
        finishReason: "stop",
      };
    }

    if (lastUserMessage.includes("recommend") || lastUserMessage.includes("for you")) {
      return {
        content:
          "Based on your profile interests, skills, and eligibility verification, here are your current recommendations.",
        finishReason: "stop",
      };
    }

    if (lastUserMessage.includes("saved") || lastUserMessage.includes("deadline")) {
      return {
        content:
          "Here are the active registration deadlines for the opportunities in your saved list, arranged in chronological order.",
        finishReason: "stop",
      };
    }

    if (lastUserMessage.includes("compare")) {
      return {
        content:
          "Here is a side-by-side factual comparison of the requested opportunities based on published platform records.",
        finishReason: "stop",
      };
    }

    return {
      content:
        "Here are the opportunities found in the platform catalogue matching your request. Details such as registration deadlines, modes, and categories are listed below.",
      finishReason: "stop",
    };
  }
}
