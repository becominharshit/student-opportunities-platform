import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type {
  ClientChatMessage,
  ModelMessage,
  AssistantSuccessResponse,
  GroundingStatus,
} from "./types";
import { getAssistantModel } from "./model";
import { ASSISTANT_SYSTEM_PROMPT } from "./prompts";
import { TOOL_DEFINITIONS, executeTool } from "./tools";
import {
  extractCanonicalEvents,
  extractAuthoritativeFacts,
  verifyProseFactualSafety,
  cleanSafePlainText,
} from "./sanitizer";

export async function runAssistantConversation(
  client: SupabaseClient<Database>,
  userId: string,
  clientMessages: ClientChatMessage[]
): Promise<AssistantSuccessResponse> {
  // 1. Validate Client Messages & History Bounds
  if (!Array.isArray(clientMessages) || clientMessages.length === 0) {
    throw new Error("Invalid request: messages array is required.");
  }

  if (clientMessages.length > 6) {
    throw new Error("Invalid request: conversation history exceeds maximum 6 messages.");
  }

  for (const msg of clientMessages) {
    if (msg.role !== "user" && msg.role !== "assistant") {
      throw new Error(`Invalid role '${String((msg as { role?: unknown }).role)}'. Only 'user' and 'assistant' are permitted.`);
    }
    if (typeof msg.content !== "string" || msg.content.length > 1000) {
      throw new Error("Invalid message content: must be a string up to 1,000 characters.");
    }
  }

  const latestUserMessage = clientMessages.at(-1);
  if (!latestUserMessage || latestUserMessage.role !== "user") {
    throw new Error("Last message must be from user.");
  }

  const userQueryLower = latestUserMessage.content.trim().toLowerCase();

  // 2. Non-Factual Fast Path (No tools needed for general assistant capability questions)
  if (
    userQueryLower === "hello" ||
    userQueryLower === "hi" ||
    userQueryLower.startsWith("what can you do") ||
    userQueryLower.startsWith("what can you help me with") ||
    userQueryLower.startsWith("how do i use") ||
    userQueryLower.startsWith("help me with this assistant")
  ) {
    return {
      ok: true,
      answer:
        "I am your Grounded AI Assistant. I can help you explore student technology opportunities published in the platform catalogue. You can ask me to find hackathons, evaluate your eligibility based on your saved profile, check upcoming registration deadlines for your saved events, compare opportunities, or view personalized recommendations.",
      events: [],
      facts: {},
      grounding: {
        status: "not_applicable",
        toolsUsed: [],
      },
    };
  }

  // 3. Assemble Model Context (History treated as conversational context; current turn must re-ground)
  const modelMessages: ModelMessage[] = [
    { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
  ];

  // Include prior untrusted turns
  for (const m of clientMessages.slice(0, -1)) {
    modelMessages.push({
      role: m.role,
      content: cleanSafePlainText(m.content),
    });
  }

  // Append current turn
  modelMessages.push({
    role: "user",
    content: latestUserMessage.content.trim(),
  });

  const model = getAssistantModel();

  const executedToolResults: Array<{ toolName: string; result: unknown }> = [];
  const toolsUsedSet = new Set<string>();

  let modelCallsCount = 0;
  let toolRoundsCount = 0;
  let totalToolCallsCount = 0;
  let finalContent: string | null = null;

  // Bounded Execution Loop: Max 3 model calls, max 2 tool rounds, max 4 tool calls
  while (modelCallsCount < 3) {
    modelCallsCount++;

    const response = await model.generate({
      messages: modelMessages,
      tools: toolRoundsCount < 2 && totalToolCallsCount < 4 ? TOOL_DEFINITIONS : undefined,
      temperature: 0.2,
      maxOutputTokens: 1024,
    });

    if (response.toolCalls && response.toolCalls.length > 0 && toolRoundsCount < 2) {
      toolRoundsCount++;

      // Record assistant message with tool calls
      modelMessages.push({
        role: "assistant",
        content: response.content || "",
        toolCalls: response.toolCalls,
      });

      for (const tc of response.toolCalls) {
        if (totalToolCallsCount >= 4) break;
        totalToolCallsCount++;
        toolsUsedSet.add(tc.name);

        let result: unknown;
        try {
          result = await executeTool(client, userId, tc.name, tc.arguments);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : "unknown failure";
          result = { error: `Tool execution error: ${errMsg}` };
        }

        executedToolResults.push({ toolName: tc.name, result });

        // Feed tool result back to model context
        modelMessages.push({
          role: "tool",
          toolCallId: tc.id,
          content: JSON.stringify(result),
        });
      }
    } else {
      // Finished with content
      finalContent = response.content || "I have processed the opportunity records from the catalogue.";
      break;
    }
  }

  if (!finalContent) {
    finalContent = "Based on the platform catalogue records, here are the opportunities that match your inquiry.";
  }

  // 4. Extract Canonical Events and Authoritative Facts from executed tool results
  const events = extractCanonicalEvents(executedToolResults);
  const facts = extractAuthoritativeFacts(executedToolResults);

  // 5. Verify Prose Factual Safety against authoritative facts
  const { safeProse } = verifyProseFactualSafety(finalContent, facts);

  // 6. Compute Grounding Status
  let status: GroundingStatus = "grounded";
  if (toolsUsedSet.size === 0) {
    status = "not_applicable";
  } else if (events.length === 0 && (!facts.eligibility || facts.eligibility.length === 0)) {
    status = "no_results";
  } else {
    // Check if any fact was unknown or missing
    const hasUnknownEligibility = facts.eligibility?.some((e) => e.state === "unknown");
    const hasMissingDeadlines = events.some((e) => !e.deadlineSummary || e.deadlineSummary.includes("Not specified"));
    if (hasUnknownEligibility || hasMissingDeadlines) {
      status = "partial";
    }
  }

  return {
    ok: true,
    answer: safeProse,
    events,
    facts,
    grounding: {
      status,
      toolsUsed: Array.from(toolsUsedSet),
    },
  };
}
