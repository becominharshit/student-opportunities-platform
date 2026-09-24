import { NextRequest, NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/auth/identity";
import { runAssistantConversation } from "@/lib/assistant/orchestrator";
import type { ClientChatMessage } from "@/lib/assistant/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 1. Basic Request Size Check (Max 16 KB)
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > 16384) {
    return NextResponse.json(
      { ok: false, code: "invalid_payload", message: "Request payload exceeds 16 KB limit." },
      { status: 413 }
    );
  }

  // 2. Authenticated Identity Verification
  const { client, user } = await resolveIdentity();
  if (!user) {
    return NextResponse.json(
      { ok: false, code: "unauthorized", message: "Authentication required to access the assistant." },
      { status: 401 }
    );
  }

  // 3. Request / History Schema Validation BEFORE Consuming Quota
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_payload", message: "Malformed JSON body." },
      { status: 400 }
    );
  }

  const bodyObj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  let rawMessages: unknown[] | null = null;
  if (Array.isArray(bodyObj?.messages)) {
    rawMessages = bodyObj.messages;
  } else if (typeof bodyObj?.message === "string") {
    const history = Array.isArray(bodyObj?.history) ? bodyObj.history : [];
    rawMessages = [...history, { role: "user", content: bodyObj.message }];
  }

  if (!rawMessages || rawMessages.length === 0) {
    return NextResponse.json(
      { ok: false, code: "invalid_payload", message: "Request must include a non-empty 'messages' array or 'message' string." },
      { status: 400 }
    );
  }

  if (rawMessages.length > 6) {
    return NextResponse.json(
      { ok: false, code: "invalid_payload", message: "Conversation history exceeds maximum of 6 messages." },
      { status: 400 }
    );
  }

  const validatedMessages: ClientChatMessage[] = [];
  for (const m of rawMessages) {
    const msgObj = typeof m === "object" && m !== null ? (m as Record<string, unknown>) : null;
    const role = msgObj?.role;
    const content = msgObj?.content;

    if (role !== "user" && role !== "assistant") {
      return NextResponse.json(
        {
          ok: false,
          code: "invalid_payload",
          message: `Forbidden role '${String(role)}'. Only 'user' and 'assistant' roles are permitted in history.`,
        },
        { status: 400 }
      );
    }
    if (typeof content !== "string" || content.length > 1000) {
      return NextResponse.json(
        {
          ok: false,
          code: "invalid_payload",
          message: "Each message must have string content up to 1,000 characters.",
        },
        { status: 400 }
      );
    }
    validatedMessages.push({ role, content });
  }

  const latestMsg = validatedMessages.at(-1);
  if (latestMsg?.role !== "user") {
    return NextResponse.json(
      { ok: false, code: "invalid_payload", message: "Last message must be from the user." },
      { status: 400 }
    );
  }

  // 4. Claim Durable Quota & Concurrency Lease
  const claimRes = await client.rpc("claim_assistant_request");
  if (claimRes.error) {
    return NextResponse.json(
      { ok: false, code: "service_unavailable", message: "Assistant quota service temporarily unavailable." },
      { status: 503 }
    );
  }

  interface ClaimResult {
    allowed?: boolean;
    code?: string;
    lease_id?: string;
    retry_after_seconds?: number;
  }
  const claimData = claimRes.data as ClaimResult | null;
  if (!claimData?.allowed) {
    const isMinute = claimData?.code === "rate_limit_exceeded_minute";
    const isDaily = claimData?.code === "rate_limit_exceeded_daily";
    const isConcurrent = claimData?.code === "concurrent_request_in_flight";

    const retryAfter = claimData?.retry_after_seconds || 30;

    let userMessage = "Too many requests. Please wait a moment.";
    if (isMinute) userMessage = `Rate limit exceeded (10 requests/minute). Please retry in ${retryAfter}s.`;
    if (isDaily) userMessage = "Daily quota reached (50 requests/day). Resets at 00:00 UTC.";
    if (isConcurrent) userMessage = `Another assistant request is already in progress. Please retry in ${retryAfter}s.`;

    return NextResponse.json(
      {
        ok: false,
        code: isConcurrent ? "concurrent_request_in_flight" : "rate_limited",
        message: userMessage,
        retryAfterSeconds: retryAfter,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }

  const leaseId = claimData.lease_id as string;

  // 5. Execute Orchestration with Guaranteed Lease Release in Finally
  try {
    const response = await runAssistantConversation(client, user.id, validatedMessages);
    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error("Assistant execution error:", err);
    return NextResponse.json(
      {
        ok: false,
        code: "provider_error",
        message: "The assistant service encountered an error while processing your request. Please try again shortly.",
      },
      { status: 500 }
    );
  } finally {
    if (leaseId) {
      try {
        await client.rpc("release_assistant_request", { p_lease_id: leaseId });
      } catch (releaseErr) {
        console.error("Lease release failure:", releaseErr);
      }
    }
  }
}
