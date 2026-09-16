import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { appOrigin } from "@/lib/auth/config";
import { mutateEvent, messages } from "@/lib/events/service";
import { textFields, numberFields, jsonFields, choices } from "@/lib/events/validation";
export async function POST(request: NextRequest) {
    const response = NextResponse.json({ ok: false, code: "validation", message: messages.validation }, { status: 400 });
    response.headers.set("Cache-Control", "private, no-store");
    if (request.headers.get("origin") !== appOrigin() || request.headers.get("sec-fetch-site") === "cross-site")
        return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
        return response;
    const reader = request.body?.getReader();
    if (!reader)
        return response;
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        size += value.length;
        if (size > 131072) {
            await reader.cancel();
            return response;
        }
        chunks.push(value);
    }
    const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    const command: Record<string, unknown> = { action: form.get("action"), reason: form.get("reason") };
    if (command.action !== "create") {
        command.id = form.get("id");
        command.expected_version = Number(form.get("expected_version"));
    }
    try {
        if (command.action === "create" || command.action === "update") {
            const event: Record<string, unknown> = {};
            for (const k of [...textFields, ...Object.keys(choices)])
                if (form.has(k))
                    event[k] = form.get(k) || null;
            for (const k of numberFields)
                if (form.has(k))
                    event[k] = form.get(k)?.trim() === "" ? null : Number(form.get(k));
            if (form.has("individual_allowed")) {
                const b = form.get("individual_allowed");
                if (b !== "" && b !== "true" && b !== "false")
                    return response;
                event.individual_allowed = b === "" ? null : b === "true";
            }
            for (const k of jsonFields)
                if (form.has(k))
                    event[k] = form.get(k) ? JSON.parse(form.get(k)!) : null;
            command.event = event;
            for (const k of ["tags", "deadlines"])
                if (form.has(k))
                    command[k] = JSON.parse(form.get(k)!);
        }
    }
    catch {
        return NextResponse.json({ ok: false, code: "validation", message: messages.validation }, { status: 422, headers: response.headers });
    }
    try {
        const client = createRequestSupabaseClient(request, response);
        const result = await mutateEvent(client, command);
        if (result.ok) {
            response.headers.set("Location", appOrigin() + "/admin/events/" + result.value.id + "?saved=1");
            return new NextResponse(null, { status: 303, headers: response.headers });
        }
        const status = { unauthorized: 401, forbidden: 403, validation: 422, not_found: 404, version_conflict: 409, publication_requirements: 422, database_failure: 503 }[result.code];
        // Failed submissions retain the browser's form history; no edits are silently reapplied.
        const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
        const errors = (result.issues ?? []).map(i => "<li>" + escape(i.field) + ": " + escape(i.message) + "</li>").join("");
        const headers = new Headers(response.headers);
        headers.set("Content-Type", "text/html; charset=utf-8");
        return new NextResponse('<!doctype html><html lang="en"><meta charset="utf-8"><title>Event change not saved</title><main><h1>Event change not saved</h1><p role="alert">' + messages[result.code] + '</p><ul>' + errors + '</ul><p>Use your browser Back button to recover your submitted form. For a version conflict, open the latest event from the list and reconcile your changes.</p><a href="/admin">Return to event list</a></main></html>', { status, headers });
    }
    catch {
        return NextResponse.json({ ok: false, code: "database_failure", message: messages.database_failure }, { status: 503, headers: response.headers });
    }
}
