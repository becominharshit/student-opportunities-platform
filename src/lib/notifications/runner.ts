import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { createServiceSupabaseClient } from "../supabase/service";
import {
  type NotificationType,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_GENERIC_COPY,
  classifySubstantiveEventChange,
  isValidActionUrl,
} from "./types";
import { type EmailSender, DevelopmentEmailSender, renderNotificationEmail } from "./email";

export interface RunnerResult {
  ok: boolean;
  duration_ms: number;
  processed: {
    deadlineReminders: number;
    eventChanges: number;
    emailDeliveries: number;
    retentionPurged: number;
  };
}

export async function withRunnerLease<T>(
  client: SupabaseClient<Database>,
  jobName: string,
  durationSeconds: number,
  task: () => Promise<T>
): Promise<{ acquired: boolean; result?: T }> {
  const owner = randomUUID();
  const { data: acquired, error: acquireError } = await client.rpc("acquire_runner_lease", {
    p_job_name: jobName,
    p_owner: owner,
    p_duration_seconds: durationSeconds,
  });

  if (acquireError || acquired !== true) {
    return { acquired: false };
  }

  try {
    const result = await task();
    return { acquired: true, result };
  } finally {
    try {
      await client.rpc("release_runner_lease", {
        p_job_name: jobName,
        p_owner: owner,
      });
    } catch {
      // Lease release failure will expire naturally at durationSeconds
    }
  }
}

export function selectDeadlineWindow(hoursUntil: number): "1d" | "3d" | "7d" | null {
  // 1-Day Window: due in <= 24 hours, but not more than 24 hours overdue
  if (hoursUntil <= 24 && hoursUntil > -24) {
    return "1d";
  }
  // 3-Day Window: due in <= 72 hours and > 24 hours
  if (hoursUntil <= 72 && hoursUntil > 24) {
    return "3d";
  }
  // 7-Day Window: due in <= 168 hours and > 72 hours
  if (hoursUntil <= 168 && hoursUntil > 72) {
    return "7d";
  }
  return null;
}

export async function runDeadlineReminders(
  client: SupabaseClient<Database> = createServiceSupabaseClient()
): Promise<number> {
  let createdCount = 0;

  // 1. Query active registration deadlines for published events
  const { data: deadlines, error } = await client
    .from("event_deadlines")
    .select(`
      id,
      event_id,
      kind,
      label,
      precision,
      due_at,
      local_date,
      timezone,
      active,
      events!inner(
        id,
        slug,
        title,
        publication_status,
        timezone
      )
    `)
    .eq("kind", "registration")
    .eq("active", true)
    .eq("events.publication_status", "published")
    .limit(500);

  if (error || !deadlines || deadlines.length === 0) {
    return 0;
  }

  const now = Date.now();

  for (const deadline of deadlines) {
    const event = deadline.events as unknown as {
      id: string;
      slug: string;
      title: string;
      publication_status: string;
      timezone: string | null;
    } | null;

    if (!event || event.publication_status !== "published") continue;

    let hoursUntil: number | null = null;

    if (deadline.precision === "datetime" && deadline.due_at) {
      hoursUntil = (new Date(deadline.due_at).getTime() - now) / (1000 * 3600);
    } else if (deadline.precision === "date_only" && deadline.local_date) {
      const tz = event.timezone || deadline.timezone || "UTC";
      let todayStr = new Date().toISOString().slice(0, 10);
      try {
        todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
      } catch {
        todayStr = new Date().toISOString().slice(0, 10);
      }
      const daysUntil = Math.round(
        (new Date(deadline.local_date + "T00:00:00Z").getTime() - new Date(todayStr + "T00:00:00Z").getTime()) /
          (1000 * 86400)
      );
      hoursUntil = daysUntil * 24;
    }

    if (hoursUntil === null) continue;

    const window = selectDeadlineWindow(hoursUntil);
    if (!window) continue;

    const notifType: NotificationType = window === "1d" ? "registration_closing_soon" : "deadline_approaching";
    const copy = NOTIFICATION_GENERIC_COPY[notifType];

    // Fetch subscribers in bounded chunks of 500
    let offset = 0;
    while (true) {
      const { data: subscribers } = await client
        .from("saved_events")
        .select("user_id")
        .eq("event_id", deadline.event_id)
        .range(offset, offset + 499);

      if (!subscribers || subscribers.length === 0) break;

      const userIds = subscribers.map((s) => s.user_id);
      const { data: prefRows } = await client
        .from("notification_preferences")
        .select("user_id, in_app_enabled, email_enabled, deadline_reminders, event_changes, recommendations")
        .in("user_id", userIds);

      const prefsMap = new Map((prefRows || []).map((p) => [p.user_id, p]));

      for (const subscriber of subscribers) {
        const p = prefsMap.get(subscriber.user_id);
        const remindersEnabled = p?.deadline_reminders ?? DEFAULT_NOTIFICATION_PREFERENCES.deadlineReminders;
        const inAppEnabled = p?.in_app_enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.inAppEnabled;
        const emailEnabled = p?.email_enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.emailEnabled;

        if (!remindersEnabled || (!inAppEnabled && !emailEnabled)) {
          continue;
        }

        const idempotencyKey = `deadline:${deadline.id}:${window}`;

        const { data: inserted, error: insertError } = await client
          .from("notifications")
          .upsert(
            {
              user_id: subscriber.user_id,
              type: notifType,
              event_id: deadline.event_id,
              title: copy.title,
              body: copy.body,
              action_url: `/events/${event.slug}`,
              idempotency_key: idempotencyKey,
              in_app_visible: inAppEnabled,
            },
            { onConflict: "user_id, idempotency_key", ignoreDuplicates: true }
          )
          .select("id");

        if (!insertError && inserted && inserted.length > 0) {
          createdCount++;
        }

        if (emailEnabled) {
          const { data: notif } = await client
            .from("notifications")
            .select("id")
            .eq("user_id", subscriber.user_id)
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();

          if (notif) {
            await client.from("notification_deliveries").upsert(
              {
                notification_id: notif.id,
                user_id: subscriber.user_id,
                channel: "email",
                status: "pending",
                idempotency_key: `email:${notif.id}`,
              },
              { onConflict: "idempotency_key", ignoreDuplicates: true }
            );
          }
        }
      }

      if (subscribers.length < 500) break;
      offset += 500;
    }
  }

  return createdCount;
}

export async function runEventChangeNotifications(
  client: SupabaseClient<Database> = createServiceSupabaseClient()
): Promise<number> {
  let createdCount = 0;

  // 1. Get persistent cursor
  const { data: cursorData, error: cursorError } = await client.rpc("get_runner_cursor", {
    p_job_name: "event-changes",
  });

  if (cursorError) {
    return 0;
  }

  const cursorObj = (cursorData ?? {}) as { cursor_timestamp?: string; cursor_id?: string };
  const cursorTimestamp = cursorObj.cursor_timestamp;
  const cursorId = cursorObj.cursor_id;

  // 2. Fetch at most 100 changes strictly after cursor
  let query = client
    .from("event_changes")
    .select("id, event_id, event_version, field_diff, created_at")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(100);

  if (cursorTimestamp && cursorTimestamp !== "-infinity") {
    query = query.or(
      `created_at.gt.${cursorTimestamp},and(created_at.eq.${cursorTimestamp},id.gt.${cursorId})`
    );
  }

  const { data: changes, error: changesError } = await query;
  if (changesError || !changes || changes.length === 0) {
    return 0;
  }

  for (const change of changes) {
    // Re-verify event is currently published
    const { data: event } = await client
      .from("events")
      .select("id, slug, title, publication_status")
      .eq("id", change.event_id)
      .eq("publication_status", "published")
      .maybeSingle();

    if (!event) continue;

    const classified = classifySubstantiveEventChange(change.field_diff as Record<string, unknown>);
    if (!classified || !classified.isSubstantive) continue;

    const copy = NOTIFICATION_GENERIC_COPY[classified.type];

    // Bulk fetch saved subscribers in 500-user chunks
    let offset = 0;
    while (true) {
      const { data: subscribers } = await client
        .from("saved_events")
        .select("user_id")
        .eq("event_id", change.event_id)
        .range(offset, offset + 499);

      if (!subscribers || subscribers.length === 0) break;

      const userIds = subscribers.map((s) => s.user_id);
      const { data: prefRows } = await client
        .from("notification_preferences")
        .select("user_id, in_app_enabled, email_enabled, deadline_reminders, event_changes, recommendations")
        .in("user_id", userIds);

      const prefsMap = new Map((prefRows || []).map((p) => [p.user_id, p]));

      for (const subscriber of subscribers) {
        const p = prefsMap.get(subscriber.user_id);
        const eventChangesEnabled = p?.event_changes ?? DEFAULT_NOTIFICATION_PREFERENCES.eventChanges;
        const inAppEnabled = p?.in_app_enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.inAppEnabled;
        const emailEnabled = p?.email_enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.emailEnabled;

        if (!eventChangesEnabled || (!inAppEnabled && !emailEnabled)) {
          continue;
        }

        const idempotencyKey = `event-change:${change.id}:${subscriber.user_id}`;

        const { data: inserted, error: insertError } = await client
          .from("notifications")
          .upsert(
            {
              user_id: subscriber.user_id,
              type: classified.type,
              event_id: change.event_id,
              event_version: change.event_version,
              title: copy.title,
              body: copy.body,
              action_url: `/events/${event.slug}`,
              idempotency_key: idempotencyKey,
              in_app_visible: inAppEnabled,
            },
            { onConflict: "user_id, idempotency_key", ignoreDuplicates: true }
          )
          .select("id");

        if (!insertError && inserted && inserted.length > 0) {
          createdCount++;
        }

        if (emailEnabled) {
          const { data: notif } = await client
            .from("notifications")
            .select("id")
            .eq("user_id", subscriber.user_id)
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();

          if (notif) {
            await client.from("notification_deliveries").upsert(
              {
                notification_id: notif.id,
                user_id: subscriber.user_id,
                channel: "email",
                status: "pending",
                idempotency_key: `email:${notif.id}`,
              },
              { onConflict: "idempotency_key", ignoreDuplicates: true }
            );
          }
        }
      }

      if (subscribers.length < 500) break;
      offset += 500;
    }
  }

  // Advance cursor ONLY after all changes in the batch have completed safely
  const lastChange = changes[changes.length - 1];
  await client.rpc("update_runner_cursor", {
    p_job_name: "event-changes",
    p_cursor_timestamp: lastChange.created_at,
    p_cursor_id: lastChange.id,
  });

  return createdCount;
}

export async function processEmailDeliveries(
  client: SupabaseClient<Database> = createServiceSupabaseClient(),
  emailSender: EmailSender = new DevelopmentEmailSender()
): Promise<number> {
  let sentCount = 0;

  // 1. Atomic claim of up to 50 deliveries
  const { data: claimedRaw, error: claimError } = await client.rpc("claim_email_deliveries", {
    p_batch_size: 50,
  });

  if (claimError || !claimedRaw) {
    return 0;
  }

  const deliveries = (Array.isArray(claimedRaw) ? claimedRaw : []) as Array<{
    id: string;
    notification_id: string;
    user_id: string;
    channel: string;
    status: string;
    attempt_count: number;
    idempotency_key: string;
  }>;

  if (deliveries.length === 0) {
    return 0;
  }

  for (const delivery of deliveries) {
    // 2. Fetch notification details
    const { data: notif, error: notifError } = await client
      .from("notifications")
      .select("id, title, body, action_url, event_id, type")
      .eq("id", delivery.notification_id)
      .maybeSingle();

    if (notifError || !notif) {
      await client
        .from("notification_deliveries")
        .update({
          status: "failed",
          last_error_code: "NOTIFICATION_NOT_FOUND",
          last_error_message: "Linked notification row missing",
          attempt_count: delivery.attempt_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
      continue;
    }

    // 3. Send-time publication re-check
    let eventTitle = notif.title;
    let eventActionUrl = notif.action_url;

    if (notif.event_id) {
      const { data: event } = await client
        .from("events")
        .select("id, slug, title, publication_status")
        .eq("id", notif.event_id)
        .maybeSingle();

      if (!event || event.publication_status !== "published") {
        // Suppress immediately: event is no longer published
        await client
          .from("notification_deliveries")
          .update({
            status: "suppressed",
            last_error_code: "EVENT_UNPUBLISHED",
            last_error_message: "Event is no longer published at send time",
            updated_at: new Date().toISOString(),
          })
          .eq("id", delivery.id);
        continue;
      }

      eventTitle = `${event.title}: ${notif.title}`;
      eventActionUrl = isValidActionUrl(notif.action_url) ? notif.action_url : `/events/${event.slug}`;
    }

    // 4. Fetch user email
    const { data: userData, error: userError } = await client.auth.admin.getUserById(delivery.user_id);
    const userEmail = userData?.user?.email;

    if (userError || !userEmail || !userData.user.email_confirmed_at) {
      await client
        .from("notification_deliveries")
        .update({
          status: "suppressed",
          last_error_code: "USER_UNAVAILABLE",
          last_error_message: "User unconfirmed or missing email",
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
      continue;
    }

    // 5. Render email template
    const rendered = renderNotificationEmail({
      title: eventTitle,
      body: notif.body,
      actionUrl: eventActionUrl,
    });

    // 6. Dispatch via transport abstraction
    const result = await emailSender.send({
      to: userEmail,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody,
      notificationId: notif.id,
      idempotencyKey: delivery.idempotency_key,
    });

    const nowIso = new Date().toISOString();

    if (result.success) {
      await client
        .from("notification_deliveries")
        .update({
          status: "sent",
          sent_at: nowIso,
          attempt_count: delivery.attempt_count + 1,
          updated_at: nowIso,
        })
        .eq("id", delivery.id);
      sentCount++;
    } else {
      const nextAttemptCount = delivery.attempt_count + 1;
      const willRetry = result.retryable && nextAttemptCount < 3;

      if (willRetry) {
        const delayMs = nextAttemptCount === 1 ? 5 * 60 * 1000 : 30 * 60 * 1000;
        const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

        await client
          .from("notification_deliveries")
          .update({
            status: "retryable",
            attempt_count: nextAttemptCount,
            next_attempt_at: nextAttemptAt,
            last_error_code: (result.errorCode || "SEND_FAILED").slice(0, 64),
            last_error_message: (result.errorMessage || "Transient failure").slice(0, 256),
            updated_at: nowIso,
          })
          .eq("id", delivery.id);
      } else {
        await client
          .from("notification_deliveries")
          .update({
            status: "failed",
            attempt_count: nextAttemptCount,
            last_error_code: (result.errorCode || "PERMANENT_FAILURE").slice(0, 64),
            last_error_message: (result.errorMessage || "Delivery permanently failed").slice(0, 256),
            updated_at: nowIso,
          })
          .eq("id", delivery.id);
      }
    }
  }

  return sentCount;
}

export async function purgeExpiredNotifications(
  client: SupabaseClient<Database> = createServiceSupabaseClient()
): Promise<number> {
  let purgedCount = 0;

  try {
    // 1. Read notifications older than 60 days
    // Safe deletion: only if not referenced by active deliveries
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400 * 1000).toISOString();
    const { data: readToPurge } = await client
      .from("notifications")
      .select("id")
      .eq("in_app_visible", true)
      .not("read_at", "is", null)
      .lt("read_at", sixtyDaysAgo)
      .limit(500);

    if (readToPurge && readToPurge.length > 0) {
      const ids = readToPurge.map((r) => r.id);
      const { data: activeDeliveries } = await client
        .from("notification_deliveries")
        .select("notification_id")
        .in("notification_id", ids)
        .in("status", ["pending", "processing", "retryable"]);

      const activeIds = new Set((activeDeliveries || []).map((d) => d.notification_id));
      const safeToDelete = ids.filter((id) => !activeIds.has(id));

      if (safeToDelete.length > 0) {
        const { error: delError } = await client
          .from("notifications")
          .delete()
          .in("id", safeToDelete);
        if (!delError) purgedCount += safeToDelete.length;
      }
    }

    // 2. Unread notifications older than 180 days
    const oneEightyDaysAgo = new Date(Date.now() - 180 * 86400 * 1000).toISOString();
    const { data: unreadToPurge } = await client
      .from("notifications")
      .select("id")
      .eq("in_app_visible", true)
      .is("read_at", null)
      .lt("created_at", oneEightyDaysAgo)
      .limit(500);

    if (unreadToPurge && unreadToPurge.length > 0) {
      const ids = unreadToPurge.map((r) => r.id);
      const { data: activeDeliveries } = await client
        .from("notification_deliveries")
        .select("notification_id")
        .in("notification_id", ids)
        .in("status", ["pending", "processing", "retryable"]);

      const activeIds = new Set((activeDeliveries || []).map((d) => d.notification_id));
      const safeToDelete = ids.filter((id) => !activeIds.has(id));

      if (safeToDelete.length > 0) {
        const { error: delError } = await client
          .from("notifications")
          .delete()
          .in("id", safeToDelete);
        if (!delError) purgedCount += safeToDelete.length;
      }
    }

    // 3. Terminal deliveries older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const { data: terminalDeliveries } = await client
      .from("notification_deliveries")
      .select("id")
      .in("status", ["sent", "failed", "suppressed"])
      .lt("updated_at", thirtyDaysAgo)
      .limit(500);

    if (terminalDeliveries && terminalDeliveries.length > 0) {
      const ids = terminalDeliveries.map((d) => d.id);
      const { error: delError } = await client
        .from("notification_deliveries")
        .delete()
        .in("id", ids);
      if (!delError) purgedCount += ids.length;
    }
  } catch {
    // Non-fatal retention failure
  }

  return purgedCount;
}

export async function runAllNotificationJobs(options?: {
  client?: SupabaseClient<Database>;
  emailSender?: EmailSender;
}): Promise<RunnerResult> {
  const startTime = Date.now();
  const client = options?.client ?? createServiceSupabaseClient();
  const emailSender = options?.emailSender ?? new DevelopmentEmailSender();

  let deadlineReminders = 0;
  let eventChanges = 0;
  let emailDeliveries = 0;
  let retentionPurged = 0;

  // 1. Deadline Reminders with lease
  const dlResult = await withRunnerLease(client, "deadline-reminders", 600, async () => {
    return await runDeadlineReminders(client);
  });
  if (dlResult.acquired && typeof dlResult.result === "number") {
    deadlineReminders = dlResult.result;
  }

  // 2. Event Changes Sweeper with lease
  const ecResult = await withRunnerLease(client, "event-changes", 600, async () => {
    return await runEventChangeNotifications(client);
  });
  if (ecResult.acquired && typeof ecResult.result === "number") {
    eventChanges = ecResult.result;
  }

  // 3. Email Deliveries Processor with lease
  const edResult = await withRunnerLease(client, "email-delivery", 300, async () => {
    return await processEmailDeliveries(client, emailSender);
  });
  if (edResult.acquired && typeof edResult.result === "number") {
    emailDeliveries = edResult.result;
  }

  // 4. Notification Retention Purge with lease
  const retResult = await withRunnerLease(client, "notification-retention", 600, async () => {
    return await purgeExpiredNotifications(client);
  });
  if (retResult.acquired && typeof retResult.result === "number") {
    retentionPurged = retResult.result;
  }

  return {
    ok: true,
    duration_ms: Date.now() - startTime,
    processed: {
      deadlineReminders,
      eventChanges,
      emailDeliveries,
      retentionPurged,
    },
  };
}
