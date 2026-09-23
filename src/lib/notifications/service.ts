import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import {
  type NotificationItem,
  type NotificationPreferences,
  type NotificationType,
  DEFAULT_NOTIFICATION_PREFERENCES,
  UNPUBLISHED_EVENT_NOTICE,
  decodeNotificationCursor,
  encodeNotificationCursor,
  isValidActionUrl,
} from "./types";

export const NOTIFICATIONS_PAGE_SIZE = 24;

export type NotificationsListResult =
  | { kind: "unavailable" }
  | {
      kind: "ready";
      items: NotificationItem[];
      hasAny: boolean;
      nextCursor: string | null;
      invalidCursorNotice?: boolean;
    };

export async function listUserNotifications(
  client: SupabaseClient<Database>,
  userId: string,
  options?: { limit?: number; cursor?: string | null }
): Promise<NotificationsListResult> {
  try {
    const rawCursor = options?.cursor;
    let decodedCursor = decodeNotificationCursor(rawCursor);
    let invalidCursorNotice = false;

    if (rawCursor && !decodedCursor) {
      // Safe fallback to first page if cursor is invalid or tampered
      invalidCursorNotice = true;
      decodedCursor = null;
    }

    const limit = Math.min(Math.max(options?.limit ?? NOTIFICATIONS_PAGE_SIZE, 1), 50);

    let query = client
      .from("notifications")
      .select("id, type, event_id, event_version, title, body, action_url, in_app_visible, read_at, created_at")
      .eq("user_id", userId)
      .eq("in_app_visible", true)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (decodedCursor) {
      query = query.or(
        `created_at.lt.${decodedCursor.createdAt},and(created_at.eq.${decodedCursor.createdAt},id.lt.${decodedCursor.id})`
      );
    }

    const [rowsResult, anyResult] = await Promise.all([
      query,
      client
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("in_app_visible", true)
        .limit(1),
    ]);

    if (rowsResult.error || anyResult.error) {
      return { kind: "unavailable" };
    }

    const rawRows = rowsResult.data ?? [];
    const hasMore = rawRows.length > limit;
    const pageRows = rawRows.slice(0, limit);

    // Dynamic resolution of public event titles and relative URLs
    const eventIds = Array.from(new Set(pageRows.map((r) => r.event_id).filter((id): id is string => Boolean(id))));

    const publishedEventsMap = new Map<string, { slug: string; title: string }>();

    if (eventIds.length > 0) {
      const eventsResult = await client
        .from("events")
        .select("id, slug, title, publication_status")
        .in("id", eventIds)
        .eq("publication_status", "published")
        .limit(eventIds.length);

      if (!eventsResult.error && eventsResult.data) {
        for (const ev of eventsResult.data) {
          publishedEventsMap.set(ev.id, { slug: ev.slug, title: ev.title });
        }
      }
    }

    const items: NotificationItem[] = pageRows.map((row) => {
      const isRead = row.read_at !== null;
      if (row.event_id) {
        const published = publishedEventsMap.get(row.event_id);
        if (published) {
          return {
            id: row.id,
            type: row.type as NotificationType,
            eventId: row.event_id,
            eventVersion: row.event_version,
            title: `${published.title}: ${row.title}`,
            body: row.body,
            actionUrl: isValidActionUrl(row.action_url) ? row.action_url : `/events/${published.slug}`,
            createdAt: row.created_at,
            readAt: row.read_at,
            isRead,
            isEventPublished: true,
          };
        } else {
          // Event is unpublished, draft, review, archived, or deleted
          return {
            id: row.id,
            type: row.type as NotificationType,
            eventId: row.event_id,
            eventVersion: row.event_version,
            title: row.title,
            body: UNPUBLISHED_EVENT_NOTICE,
            actionUrl: null,
            createdAt: row.created_at,
            readAt: row.read_at,
            isRead,
            isEventPublished: false,
          };
        }
      }

      return {
        id: row.id,
        type: row.type as NotificationType,
        eventId: null,
        eventVersion: null,
        title: row.title,
        body: row.body,
        actionUrl: isValidActionUrl(row.action_url) ? row.action_url : null,
        createdAt: row.created_at,
        readAt: row.read_at,
        isRead,
        isEventPublished: true,
      };
    });

    const lastItem = pageRows.at(-1);
    const nextCursor =
      hasMore && lastItem ? encodeNotificationCursor({ createdAt: lastItem.created_at, id: lastItem.id }) : null;

    return {
      kind: "ready",
      items,
      hasAny: (anyResult.data?.length ?? 0) > 0,
      nextCursor,
      ...(invalidCursorNotice ? { invalidCursorNotice: true } : {}),
    };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function getUnreadNotificationCount(
  client: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  try {
    const { count, error } = await client
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("in_app_visible", true)
      .is("read_at", null);

    if (error || typeof count !== "number") {
      return 0;
    }
    return count;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(
  client: SupabaseClient<Database>,
  notificationId: string
): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("mark_notification_read", {
      p_notification_id: notificationId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function markAllNotificationsRead(
  client: SupabaseClient<Database>
): Promise<number> {
  try {
    const { data, error } = await client.rpc("mark_all_notifications_read");
    if (error || typeof data !== "number") {
      return 0;
    }
    return data;
  } catch {
    return 0;
  }
}

export async function getNotificationPreferences(
  client: SupabaseClient<Database>,
  userId: string
): Promise<NotificationPreferences> {
  try {
    const { data, error } = await client
      .from("notification_preferences")
      .select("user_id, in_app_enabled, email_enabled, deadline_reminders, event_changes, recommendations, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return {
        userId,
        ...DEFAULT_NOTIFICATION_PREFERENCES,
      };
    }

    return {
      userId: data.user_id,
      inAppEnabled: data.in_app_enabled,
      emailEnabled: data.email_enabled,
      deadlineReminders: data.deadline_reminders,
      eventChanges: data.event_changes,
      recommendations: data.recommendations,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch {
    return {
      userId,
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    };
  }
}

export async function updateNotificationPreferences(
  client: SupabaseClient<Database>,
  userId: string,
  prefs: Partial<Omit<NotificationPreferences, "userId">>
): Promise<{ success: boolean; preferences?: NotificationPreferences; error?: string }> {
  try {
    const current = await getNotificationPreferences(client, userId);
    const updated = {
      user_id: userId,
      in_app_enabled: prefs.inAppEnabled ?? current.inAppEnabled,
      email_enabled: prefs.emailEnabled ?? current.emailEnabled,
      deadline_reminders: prefs.deadlineReminders ?? current.deadlineReminders,
      event_changes: prefs.eventChanges ?? current.eventChanges,
      recommendations: prefs.recommendations ?? current.recommendations,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from("notification_preferences")
      .upsert(updated, { onConflict: "user_id" });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      preferences: {
        userId,
        inAppEnabled: updated.in_app_enabled,
        emailEnabled: updated.email_enabled,
        deadlineReminders: updated.deadline_reminders,
        eventChanges: updated.event_changes,
        recommendations: updated.recommendations,
        updatedAt: updated.updated_at,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update notification preferences";
    return { success: false, error: message };
  }
}
