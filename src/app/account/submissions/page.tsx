import Link from "next/link";
import { requireIdentity } from "@/lib/auth/identity";
import { DiscoveryShell } from "@/components/public-events";
import { Button } from "@/components/ui/button";
import { getUnreadNotificationCount } from "@/lib/notifications/service";
import { listUserSubmissions } from "@/lib/submissions/service";
import { SubmissionList } from "@/components/submission-list";

export const metadata = {
  title: "Your submitted opportunities",
  robots: { index: false, follow: false },
};

export default async function AccountSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  const { client, user } = await requireIdentity("/account/submissions");
  const params = await searchParams;

  let cursorCreatedAt: string | undefined;
  let cursorId: string | undefined;

  if (params.after) {
    try {
      const decoded = Buffer.from(params.after, "base64url").toString("utf8");
      const parsed = JSON.parse(decoded);
      if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
        cursorCreatedAt = parsed.createdAt;
        cursorId = parsed.id;
      }
    } catch {
      // Ignore malformed cursor and fallback to first page
    }
  }

  const [unreadCount, { items, nextCursor }] = await Promise.all([
    getUnreadNotificationCount(client, user.id),
    listUserSubmissions(client, {
      cursorCreatedAt,
      cursorId,
    }),
  ]);

  return (
    <DiscoveryShell authenticated unreadCount={unreadCount}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Community Submissions</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Your submitted opportunities</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
              Track the status of student technology opportunities you have submitted for administrator verification.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/account" className="text-sm underline underline-offset-4 hover:text-primary">
              ← Account overview
            </Link>
            <Link href="/submit-event">
              <Button>Submit an opportunity</Button>
            </Link>
          </div>
        </div>

        <SubmissionList items={items} nextCursor={nextCursor} />
      </div>
    </DiscoveryShell>
  );
}
