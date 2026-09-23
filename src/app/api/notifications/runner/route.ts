import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { runAllNotificationJobs } from "@/lib/notifications/runner";

export const dynamic = "force-dynamic";

function safeCompare(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function POST(request: Request): Promise<Response> {
  const expectedSecret = process.env.NOTIFICATION_RUNNER_SECRET;
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: "Runner not configured" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  }

  // Strictly reject tokens in URL search params
  const url = new URL(request.url);
  if (url.searchParams.has("secret") || url.searchParams.has("token")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  }

  // Authorization: Bearer <SECRET>
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  }

  const token = authHeader.slice(7).trim();
  if (!token || !safeCompare(token, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  }

  try {
    const summary = await runAllNotificationJobs();
    return NextResponse.json(summary, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal runner error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  }
}
