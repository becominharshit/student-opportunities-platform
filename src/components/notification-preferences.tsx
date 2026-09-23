"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NotificationPreferences } from "@/lib/notifications/types";

export function NotificationPreferencesForm({
  initialPreferences,
}: {
  initialPreferences: NotificationPreferences;
}) {
  const router = useRouter();
  const [inApp, setInApp] = useState(initialPreferences.inAppEnabled);
  const [email, setEmail] = useState(initialPreferences.emailEnabled);
  const [deadlineReminders, setDeadlineReminders] = useState(initialPreferences.deadlineReminders);
  const [eventChanges, setEventChanges] = useState(initialPreferences.eventChanges);

  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    startTransition(async () => {
      setStatusMessage(null);
      setIsError(false);
      try {
        const response = await fetch("/api/notifications/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inAppEnabled: inApp,
            emailEnabled: email,
            deadlineReminders,
            eventChanges,
          }),
        });
        const res = await response.json();
        if (response.ok && res.ok) {
          setStatusMessage("Notification preferences saved successfully.");
          router.refresh();
        } else {
          setIsError(true);
          setStatusMessage(res.error || "Failed to save preferences. Please retry.");
        }
      } catch {
        setIsError(true);
        setStatusMessage("Failed to save preferences. Please retry.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-base font-semibold">Delivery Channels</h3>
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="inAppEnabled"
              checked={inApp}
              onChange={(e) => setInApp(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium">In-app notifications</span>
              <p className="text-xs text-muted-foreground">
                Display notifications in your navigation bar and at /notifications.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="emailEnabled"
              checked={email}
              onChange={(e) => setEmail(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium">Email notifications</span>
              <p className="text-xs text-muted-foreground">
                Receive transactional email updates. We never send marketing emails or share your address.
              </p>
            </div>
          </label>
        </div>
      </div>

      <div className="space-y-4 border-t border-border pt-4">
        <h3 className="text-base font-semibold">Notification Topics</h3>
        <p className="text-xs text-muted-foreground">
          Topic preferences apply across both in-app and email channels.
        </p>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="deadlineReminders"
              checked={deadlineReminders}
              onChange={(e) => setDeadlineReminders(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium">Registration deadline reminders</span>
              <p className="text-xs text-muted-foreground">
                Reminders at 7 days, 3 days, and 24 hours before active registration closes on saved events.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="eventChanges"
              checked={eventChanges}
              onChange={(e) => setEventChanges(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div>
              <span className="text-sm font-medium">Saved event schedule updates</span>
              <p className="text-xs text-muted-foreground">
                Alerts when a saved opportunity updates its date, venue, participation mode, or status.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 opacity-60 cursor-not-allowed">
            <input
              type="checkbox"
              name="recommendations"
              checked={false}
              disabled
              className="mt-1 h-4 w-4 rounded border-border text-primary"
            />
            <div>
              <span className="text-sm font-medium">Personalized recommendations</span>
              <p className="text-xs text-muted-foreground">
                Alerts for newly published opportunities matching your profile (Coming in Notifications 1.1).
              </p>
            </div>
          </label>
        </div>
      </div>

      {statusMessage && (
        <div
          role="status"
          className={`p-3 rounded-md text-sm ${
            isError
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200 border border-red-200 dark:border-red-800"
              : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-200 border border-green-200 dark:border-green-800"
          }`}
        >
          {statusMessage}
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save notification preferences"}
        </button>
      </div>
    </form>
  );
}
