"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { NotificationItem } from "@/lib/notifications/types";

export function NotificationCard({ item }: { item: NotificationItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleMarkRead() {
    startTransition(async () => {
      try {
        await fetch("/api/notifications/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId: item.id }),
        });
        router.refresh();
      } catch {
        // Graceful error handling
      }
    });
  }

  const dateObj = new Date(item.createdAt);
  const formattedDate = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : item.createdAt;

  return (
    <article
      className={`border rounded-lg p-5 transition-colors ${
        item.isRead ? "bg-card text-card-foreground border-border" : "bg-muted/40 border-primary/30"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          {!item.isRead && (
            <span
              className="inline-block h-2.5 w-2.5 rounded-full bg-primary flex-shrink-0"
              aria-label="Unread"
            />
          )}
          <time dateTime={item.createdAt} className="text-xs text-muted-foreground">
            {formattedDate}
          </time>
        </div>
        {!item.isRead && (
          <button
            onClick={handleMarkRead}
            disabled={isPending}
            className="text-xs underline text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {isPending ? "Updating..." : "Mark as read"}
          </button>
        )}
      </div>

      <h2 className="mt-2 text-lg font-semibold tracking-tight">
        {item.isEventPublished && item.actionUrl ? (
          <Link href={item.actionUrl} className="underline underline-offset-4 hover:text-primary">
            {item.title}
          </Link>
        ) : (
          <span>{item.title}</span>
        )}
      </h2>

      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{item.body}</p>

      {!item.isEventPublished && (
        <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
          This opportunity is no longer published.
        </p>
      )}

      {item.isEventPublished && item.actionUrl && (
        <div className="mt-4">
          <Link
            href={item.actionUrl}
            className="inline-flex items-center text-sm font-medium underline underline-offset-4 hover:text-primary"
          >
            View opportunity →
          </Link>
        </div>
      )}
    </article>
  );
}

export function NotificationListHeader({
  hasUnread,
}: {
  hasUnread: boolean;
  totalCount?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleMarkAllRead() {
    startTransition(async () => {
      try {
        await fetch("/api/notifications/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
        router.refresh();
      } catch {
        // Graceful error handling
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Updates on deadlines and schedule changes for your saved opportunities.
        </p>
      </div>
      {hasUnread && (
        <button
          onClick={handleMarkAllRead}
          disabled={isPending}
          className="rounded-md border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {isPending ? "Updating..." : "Mark all as read"}
        </button>
      )}
    </div>
  );
}

export function NotificationsContent({
  items,
  hasAny,
  nextCursor,
  after,
  invalidCursorNotice,
  unreadCount,
}: {
  items: NotificationItem[];
  hasAny: boolean;
  nextCursor: string | null;
  after?: string;
  invalidCursorNotice?: boolean;
  unreadCount: number;
}) {
  return (
    <div className="space-y-6">
      <NotificationListHeader hasUnread={unreadCount > 0} totalCount={items.length} />

      {invalidCursorNotice && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          The requested notification page link was invalid. Showing the most recent notifications.
        </div>
      )}

      {!hasAny ? (
        <div className="my-12 text-center py-12 border rounded-lg border-border bg-card">
          <h2 className="text-xl font-semibold">No notifications yet</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            When registration deadlines approach or saved opportunities update, you will see notifications here.
          </p>
          <div className="mt-6">
            <Link
              href="/explore"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Explore opportunities
            </Link>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="my-12 text-center py-8">
          <p className="text-sm text-muted-foreground">No more notifications on this page.</p>
          <div className="mt-4">
            <Link href="/notifications" className="text-sm underline underline-offset-4">
              Return to first page
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <NotificationCard item={item} />
              </li>
            ))}
          </ul>

          {(after || nextCursor) && (
            <nav
              aria-label="Notification pagination"
              className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6"
            >
              {after ? (
                <Link
                  href="/notifications"
                  className="inline-flex min-h-10 items-center text-sm underline underline-offset-4"
                >
                  ← First page
                </Link>
              ) : (
                <span />
              )}
              {nextCursor && (
                <Link
                  href={`/notifications?after=${encodeURIComponent(nextCursor)}`}
                  className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Older notifications →
                </Link>
              )}
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
