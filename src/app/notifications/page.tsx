import { requireIdentity } from "@/lib/auth/identity";
import { DiscoveryShell } from "@/components/public-events";
import { NotificationsContent } from "@/components/notifications";
import { getUnreadNotificationCount, listUserNotifications } from "@/lib/notifications/service";

export const metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  const { client, user } = await requireIdentity("/notifications");
  const params = await searchParams;

  const [unreadCount, listResult] = await Promise.all([
    getUnreadNotificationCount(client, user.id),
    listUserNotifications(client, user.id, { cursor: params.after }),
  ]);

  return (
    <DiscoveryShell authenticated unreadCount={unreadCount}>
      {listResult.kind === "unavailable" ? (
        <div className="my-12 text-center py-12 border rounded-lg border-border bg-card">
          <h1 className="text-2xl font-semibold">Notifications unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Notification records are temporarily unavailable. Please retry shortly.
          </p>
        </div>
      ) : (
        <NotificationsContent
          items={listResult.items}
          hasAny={listResult.hasAny}
          nextCursor={listResult.nextCursor}
          after={params.after}
          invalidCursorNotice={listResult.invalidCursorNotice}
          unreadCount={unreadCount}
        />
      )}
    </DiscoveryShell>
  );
}
