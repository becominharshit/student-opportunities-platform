import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabaseClient } from "../supabase/request";
import { appOrigin } from "../auth/config";
import { parseProfileForm, ProfileInputError } from "./validation";
export async function profilePost(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control","private, no-store, max-age=0");
  const error = (message: string, status: number) => {
    const result = NextResponse.json({ ok: false, message }, { status });
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
    for (const [key,value] of response.headers) if (key !== "content-length" && key !== "set-cookie") result.headers.set(key,value);
    return result;
  };
  if (request.headers.get("origin") !== appOrigin() || request.headers.get("sec-fetch-site") === "cross-site" || !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return error("Invalid request. Reload the page and try again.",403);
  try {
    const client = createRequestSupabaseClient(request,response);
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user?.email_confirmed_at) return error("Please sign in again before saving.",401);
    const reader = request.body?.getReader();
    if (!reader) return error("No form was submitted.",400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 16384) { await reader.cancel(); return error("This section is too large. Shorten the entries and try again.",413); } chunks.push(item.value); }
    const input = parseProfileForm(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
    // auth.uid() inside the SECURITY INVOKER transaction supplies ownership.
    const saved = await client.rpc("save_profile_section", { section: input.section, values_json: input.values });
    if (saved.error) return error(["22023","22P02","23503","23514"].includes(saved.error.code) ? "Check this section's values and available choices, then try again." : "Your changes could not be saved. Please try again.",400);
    if (saved.data !== true) return error("Your changes could not be saved. Please try again.",503);
    return response;
  } catch (cause) { return error(cause instanceof ProfileInputError ? cause.message : "Your changes could not be saved. Please try again.",400); }
}
