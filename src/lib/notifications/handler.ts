import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabaseClient } from "../supabase/request";
import { appOrigin } from "../auth/config";
import { uuid } from "../events/validation";
import {
  markNotificationRead,
  markAllNotificationsRead,
  updateNotificationPreferences,
} from "./service";

export async function notificationMarkReadPost(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");

  const error = (message: string, status: number) => {
    const result = NextResponse.json({ ok: false, error: message }, { status });
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
    return result;
  };

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== appOrigin() || fetchSite === "cross-site") {
    return error("Forbidden", 403);
  }

  try {
    const client = createRequestSupabaseClient(request, response);
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user?.email_confirmed_at) {
      return error("Unauthorized", 401);
    }

    let all = false;
    let notificationId: string | null = null;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      all = body.all === true;
      if (typeof body.notificationId === "string") {
        notificationId = body.notificationId;
      }
    } else {
      const formData = await request.formData();
      all = formData.get("all") === "true";
      const idVal = formData.get("notificationId");
      if (typeof idVal === "string") {
        notificationId = idVal;
      }
    }

    if (all) {
      const count = await markAllNotificationsRead(client);
      const result = NextResponse.json({ ok: true, count });
      for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
      return result;
    }

    if (!notificationId || !uuid(notificationId)) {
      return error("Invalid notification ID", 400);
    }

    const success = await markNotificationRead(client, notificationId);
    const result = NextResponse.json({ ok: success });
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
    return result;
  } catch {
    return error("Failed to update notification", 500);
  }
}

export async function notificationPreferencesPost(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");

  const error = (message: string, status: number) => {
    const result = NextResponse.json({ ok: false, error: message }, { status });
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
    return result;
  };

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== appOrigin() || fetchSite === "cross-site") {
    return error("Forbidden", 403);
  }

  try {
    const client = createRequestSupabaseClient(request, response);
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user?.email_confirmed_at) {
      return error("Unauthorized", 401);
    }

    let parsed: Record<string, unknown> = {};
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      parsed = await request.json();
    } else {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        if (typeof value === "string") {
          parsed[key] = value === "true" || (value !== "false" && value);
        }
      }
    }

    const prefsUpdate: Parameters<typeof updateNotificationPreferences>[2] = {};
    if (typeof parsed.inAppEnabled === "boolean") prefsUpdate.inAppEnabled = parsed.inAppEnabled;
    if (typeof parsed.emailEnabled === "boolean") prefsUpdate.emailEnabled = parsed.emailEnabled;
    if (typeof parsed.deadlineReminders === "boolean") prefsUpdate.deadlineReminders = parsed.deadlineReminders;
    if (typeof parsed.eventChanges === "boolean") prefsUpdate.eventChanges = parsed.eventChanges;

    const result = await updateNotificationPreferences(client, authData.user.id, prefsUpdate);
    if (!result.success) {
      return error(result.error ?? "Failed to save preferences", 400);
    }

    const res = NextResponse.json({ ok: true, preferences: result.preferences });
    for (const cookie of response.cookies.getAll()) res.cookies.set(cookie);
    return res;
  } catch {
    return error("Failed to update preferences", 500);
  }
}
