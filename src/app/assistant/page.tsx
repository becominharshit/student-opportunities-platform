import { requireIdentity } from "@/lib/auth/identity";
import { DiscoveryShell } from "@/components/public-events";
import { AssistantChat } from "@/components/assistant-chat";
import { getUnreadNotificationCount } from "@/lib/notifications/service";

export const metadata = {
  title: "AI Assistant",
  robots: { index: false, follow: false },
};

export default async function AssistantPage() {
  const { client, user } = await requireIdentity("/assistant");
  const unreadCount = await getUnreadNotificationCount(client, user.id);

  return (
    <DiscoveryShell authenticated unreadCount={unreadCount}>
      <AssistantChat />
    </DiscoveryShell>
  );
}
