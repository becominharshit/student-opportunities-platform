export type NotificationType =
  | "deadline_approaching"
  | "registration_closing_soon"
  | "event_time_changed"
  | "event_cancelled"
  | "recommendation_match"
  | "event_updated";

export type DeliveryChannel = "email";
export type DeliveryStatus = "pending" | "processing" | "sent" | "retryable" | "failed" | "suppressed";

export interface NotificationPreferences {
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  deadlineReminders: boolean;
  eventChanges: boolean;
  recommendations: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<NotificationPreferences, "userId"> = {
  inAppEnabled: true,
  emailEnabled: false, // Conservative opt-in
  deadlineReminders: true,
  eventChanges: true,
  recommendations: false, // Deferred to Notifications 1.1
};

export interface NotificationItem {
  id: string;
  type: NotificationType;
  eventId: string | null;
  eventVersion: number | null;
  title: string;
  body: string;
  actionUrl: string | null;
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
  isEventPublished: boolean;
}

export interface NotificationCursor {
  createdAt: string;
  id: string;
}

export const SAFE_ACTION_URL_REGEX = /^\/(events\/[a-z0-9-]+|saved|for-you|notifications)$/;

export function isValidActionUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return SAFE_ACTION_URL_REGEX.test(url.trim());
}

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  const json = JSON.stringify({ createdAt: cursor.createdAt, id: cursor.id });
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeNotificationCursor(raw: string | null | undefined): NotificationCursor | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const jsonStr = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.createdAt === "string" &&
      typeof parsed.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.id) &&
      !isNaN(Date.parse(parsed.createdAt))
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

// Generic copy stored in DB to guarantee private/unpublished event safety
export const NOTIFICATION_GENERIC_COPY: Record<NotificationType, { title: string; body: string }> = {
  deadline_approaching: {
    title: "Registration deadline reminder",
    body: "A saved opportunity has an upcoming registration deadline.",
  },
  registration_closing_soon: {
    title: "Registration closing soon",
    body: "Registration for a saved opportunity is closing soon.",
  },
  event_time_changed: {
    title: "Event schedule update",
    body: "A saved opportunity has updated its date or schedule.",
  },
  event_cancelled: {
    title: "Event cancelled",
    body: "A saved opportunity has been marked as cancelled.",
  },
  event_updated: {
    title: "Event details update",
    body: "A saved opportunity has updated its key details.",
  },
  recommendation_match: {
    title: "Opportunity recommendation",
    body: "A new opportunity matching your profile is available.",
  },
};

export const UNPUBLISHED_EVENT_NOTICE = "This opportunity is no longer published.";

export interface ClassifiedChange {
  isSubstantive: boolean;
  type: NotificationType;
  summary: string;
}

export function classifySubstantiveEventChange(fieldDiff: Record<string, unknown> | null | undefined): ClassifiedChange | null {
  if (!fieldDiff || typeof fieldDiff !== "object") return null;

  const diffKeys = Object.keys(fieldDiff);
  if (diffKeys.length === 0) return null;

  // 1. Cancellation check
  if ("status" in fieldDiff) {
    const statusVal = fieldDiff.status;
    const isCancelled =
      statusVal === "cancelled" ||
      (typeof statusVal === "object" && statusVal !== null && (statusVal as { new?: unknown }).new === "cancelled");
    if (isCancelled) {
      return {
        isSubstantive: true,
        type: "event_cancelled",
        summary: "The event has been cancelled.",
      };
    }
  }

  // 2. Schedule change check
  const scheduleFields = ["start_date", "end_date", "start_at", "end_at", "timezone"];
  const hasScheduleChange = scheduleFields.some((f) => f in fieldDiff);
  if (hasScheduleChange) {
    return {
      isSubstantive: true,
      type: "event_time_changed",
      summary: "Event dates or schedule have been updated.",
    };
  }

  // 3. Substantive updates check
  const updateFields = [
    "registration_status",
    "mode",
    "venue",
    "city",
    "state",
    "country",
    "event_deadlines",
  ];
  const hasUpdateChange = updateFields.some((f) => f in fieldDiff);
  if (hasUpdateChange) {
    return {
      isSubstantive: true,
      type: "event_updated",
      summary: "Key event details (mode, venue, registration, or deadlines) have been updated.",
    };
  }

  return null;
}
