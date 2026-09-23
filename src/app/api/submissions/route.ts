import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { appOrigin } from "@/lib/auth/config";
import { submitOpportunity } from "@/lib/submissions/service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const headers = new Headers();
  headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");

  // CSRF & Cross-site origin verification
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (origin !== appOrigin() || secFetchSite === "cross-site") {
    return NextResponse.json({ ok: false, code: "forbidden", message: "Forbidden cross-site request" }, { status: 403, headers });
  }

  // Content type check
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ ok: false, code: "validation", message: "Invalid content type" }, { status: 400, headers });
  }

  // Body size cap: 64 KB (65536 bytes)
  const reader = request.body?.getReader();
  if (!reader) {
    return NextResponse.json({ ok: false, code: "validation", message: "Missing request body" }, { status: 400, headers });
  }

  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65536) {
      await reader.cancel();
      return NextResponse.json({ ok: false, code: "validation", message: "Payload size exceeds maximum allowed (64 KB)" }, { status: 413, headers });
    }
    chunks.push(value);
  }

  let payload: unknown;
  try {
    const rawText = Buffer.concat(chunks).toString("utf8");
    payload = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ ok: false, code: "validation", message: "Invalid JSON format" }, { status: 400, headers });
  }

  const response = NextResponse.json({ ok: false }, { status: 500, headers });
  const client = createRequestSupabaseClient(request, response);

  const result = await submitOpportunity(client, payload);
  if (!result.ok) {
    const statusMap: Record<string, number> = {
      unauthorized: 401,
      forbidden: 403,
      validation: 422,
      not_found: 404,
      rate_limit_exceeded: 429,
      duplicate_submission: 409,
      version_conflict: 409,
      already_accepted: 409,
      invalid_transition: 422,
      database_failure: 500,
    };
    const status = statusMap[result.code] || 400;
    return NextResponse.json(result, { status, headers });
  }

  return NextResponse.json(result, { status: 201, headers });
}
