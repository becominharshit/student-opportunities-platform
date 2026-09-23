import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { appOrigin } from "@/lib/auth/config";
import {
  startReviewSubmission,
  rejectSubmission,
  acceptSubmission,
  SubmissionErrorCode,
} from "@/lib/submissions/service";
import { textFields, numberFields, jsonFields, choices } from "@/lib/events/validation";

export const dynamic = "force-dynamic";

const statusMap: Record<SubmissionErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  validation: 422,
  not_found: 404,
  version_conflict: 409,
  invalid_transition: 422,
  rate_limit_exceeded: 429,
  duplicate_submission: 409,
  already_accepted: 409,
  database_failure: 503,
};

export async function POST(request: NextRequest): Promise<Response> {
  const headers = new Headers();
  headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");

  // CSRF & Cross-site origin verification
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (origin !== appOrigin() || secFetchSite === "cross-site") {
    return NextResponse.json({ ok: false, code: "forbidden", message: "Forbidden cross-site request" }, { status: 403, headers });
  }

  const contentType = request.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const isForm = contentType.startsWith("application/x-www-form-urlencoded");

  if (!isJson && !isForm) {
    return NextResponse.json({ ok: false, code: "validation", message: "Unsupported content type" }, { status: 400, headers });
  }

  // Body size cap: 128 KB
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
    if (size > 131072) {
      await reader.cancel();
      return NextResponse.json({ ok: false, code: "validation", message: "Payload size exceeds maximum allowed (128 KB)" }, { status: 413, headers });
    }
    chunks.push(value);
  }

  const rawText = Buffer.concat(chunks).toString("utf8");
  const response = NextResponse.json({ ok: false }, { status: 500, headers });
  const client = createRequestSupabaseClient(request, response);

  if (isJson) {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, code: "validation", message: "Invalid JSON format" }, { status: 400, headers });
    }

    const action = body?.action as string | undefined;
    const id = (body?.id ?? body?.submission_id) as string | undefined;
    const expectedVersion = (body?.expectedVersion ?? body?.expected_version) as number | undefined;

    if (!id || typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return NextResponse.json({ ok: false, code: "validation", message: "Missing or invalid id or expectedVersion" }, { status: 400, headers });
    }

    if (action === "start_review") {
      const internalNotes = (body.internalNotes ?? body.internal_notes) as string | undefined;
      const result = await startReviewSubmission(client, id, expectedVersion, internalNotes);
      if (!result.ok) {
        return NextResponse.json(result, { status: statusMap[result.code] || 400, headers });
      }
      return NextResponse.json(result, { status: 200, headers });
    }

    if (action === "reject") {
      const reasonCode = (body.rejectionReasonCode ?? body.rejection_reason_code) as string | undefined;
      if (!reasonCode) {
        return NextResponse.json({ ok: false, code: "validation", message: "Missing rejection reason code" }, { status: 422, headers });
      }
      const details = (body.rejectionReasonDetails ?? body.rejection_reason_details) as string | undefined;
      const internalNotes = (body.internalNotes ?? body.internal_notes) as string | undefined;
      const result = await rejectSubmission(
        client,
        id,
        expectedVersion,
        reasonCode,
        details,
        internalNotes
      );
      if (!result.ok) {
        return NextResponse.json(result, { status: statusMap[result.code] || 400, headers });
      }
      return NextResponse.json(result, { status: 200, headers });
    }

    if (action === "accept") {
      const eventCommand = (body.eventCommand ?? body.event_command) as Record<string, unknown> | undefined;
      if (!eventCommand || typeof eventCommand !== "object") {
        return NextResponse.json({ ok: false, code: "validation", message: "Missing eventCommand for accept" }, { status: 422, headers });
      }
      const internalNotes = (body.internalNotes ?? body.internal_notes) as string | undefined;
      const publicNotes = (body.publicNotes ?? body.public_notes) as string | undefined;
      const result = await acceptSubmission(
        client,
        id,
        expectedVersion,
        eventCommand,
        internalNotes,
        publicNotes
      );
      if (!result.ok) {
        return NextResponse.json(result, { status: statusMap[result.code] || 400, headers });
      }
      return NextResponse.json(result, { status: 200, headers });
    }

    return NextResponse.json({ ok: false, code: "validation", message: "Unsupported admin action" }, { status: 400, headers });
  }

  // Handle Form Submission
  const form = new URLSearchParams(rawText);
  const action = form.get("action");
  const id = form.get("id") || form.get("submission_id");
  const expectedVersion = Number(form.get("expected_version"));

  if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return NextResponse.json({ ok: false, code: "validation", message: "Missing or invalid id or expected_version" }, { status: 400, headers });
  }

  if (action === "start_review") {
    const result = await startReviewSubmission(client, id, expectedVersion, form.get("internal_notes") || undefined);
    if (result.ok) {
      response.headers.set("Location", `${appOrigin()}/admin/submissions/${id}?saved=1`);
      return new NextResponse(null, { status: 303, headers: response.headers });
    }
    const status = statusMap[result.code] || 400;
    return NextResponse.json(result, { status, headers });
  }

  if (action === "reject") {
    const reasonCode = form.get("rejection_reason_code");
    if (!reasonCode) {
      return NextResponse.json({ ok: false, code: "validation", message: "Missing rejection reason code" }, { status: 422, headers });
    }
    const result = await rejectSubmission(
      client,
      id,
      expectedVersion,
      reasonCode,
      form.get("rejection_reason_details") || undefined,
      form.get("internal_notes") || undefined
    );
    if (result.ok) {
      response.headers.set("Location", `${appOrigin()}/admin/submissions/${id}?saved=1`);
      return new NextResponse(null, { status: 303, headers: response.headers });
    }
    const status = statusMap[result.code] || 400;
    return NextResponse.json(result, { status, headers });
  }

  if (action === "accept") {
    const reason = form.get("reason") || `Accepted submission ${id}`;
    const event: Record<string, unknown> = {};
    for (const k of [...textFields, ...Object.keys(choices)]) {
      if (form.has(k)) event[k] = form.get(k) || null;
    }
    for (const k of numberFields) {
      if (form.has(k)) event[k] = form.get(k)?.trim() === "" ? null : Number(form.get(k));
    }
    if (form.has("individual_allowed")) {
      const b = form.get("individual_allowed");
      event.individual_allowed = b === "" ? null : b === "true";
    }
    for (const k of jsonFields) {
      if (form.has(k)) {
        try {
          event[k] = form.get(k) ? JSON.parse(form.get(k)!) : null;
        } catch {
          event[k] = null;
        }
      }
    }

    const eventCommand: Record<string, unknown> = {
      action: "create",
      reason,
      event,
    };

    if (form.has("tags")) {
      try {
        eventCommand.tags = JSON.parse(form.get("tags")!);
      } catch {
        // ignore
      }
    }
    if (form.has("deadlines")) {
      try {
        eventCommand.deadlines = JSON.parse(form.get("deadlines")!);
      } catch {
        // ignore
      }
    }

    const result = await acceptSubmission(
      client,
      id,
      expectedVersion,
      eventCommand,
      form.get("internal_notes") || undefined,
      form.get("public_notes") || undefined
    );

    if (result.ok) {
      response.headers.set("Location", `${appOrigin()}/admin/events/${result.value.canonicalEventId}?saved=1`);
      return new NextResponse(null, { status: 303, headers: response.headers });
    }

    const status = statusMap[result.code] || 400;
    return NextResponse.json(result, { status, headers });
  }

  return NextResponse.json({ ok: false, code: "validation", message: "Unsupported admin action" }, { status: 400, headers });
}
