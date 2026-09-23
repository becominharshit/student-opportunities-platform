import type { CalendarEventData } from "@/lib/events/calendar";
import { generateGoogleCalendarUrl, getCalendarDates } from "@/lib/events/calendar";

interface CalendarActionsProps {
  event: CalendarEventData;
}

/**
 * Event Detail calendar section.
 * Presents clear, accessible, non-icon-only calendar actions.
 * Respects event status (cancelled, completed) and date availability without fabricating data.
 */
export function EventCalendarSection({ event }: CalendarActionsProps) {
  const dates = getCalendarDates(event);
  const isCancelled = event.status === "cancelled";
  const isCompleted = event.status === "completed";
  const googleUrl = generateGoogleCalendarUrl(event);

  // If no calendar dates are available at all
  if (!dates.canGenerateIcs && !dates.canGenerateGoogleCalendarLink) {
    return (
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">Add to calendar</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {dates.icsUnavailableReason || "Event date is not specified."}
        </p>
      </div>
    );
  }

  // Cancelled event state: do not present ordinary calendar CTA
  if (isCancelled) {
    return (
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">Add to calendar</h3>
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          This event is cancelled. Calendar actions are disabled.
        </p>
        {dates.canGenerateIcs && (
          <div className="mt-3">
            <a
              href={`/events/${event.slug}/calendar.ics`}
              download
              className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground"
            >
              Download cancellation notice (.ics)
            </a>
          </div>
        )}
      </div>
    );
  }

  // Completed event state: do not encourage adding already-completed events
  if (isCompleted) {
    return (
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">Add to calendar</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This event has completed.
        </p>
        {dates.canGenerateIcs && (
          <div className="mt-3">
            <a
              href={`/events/${event.slug}/calendar.ics`}
              download
              className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground"
            >
              Download archive (.ics)
            </a>
          </div>
        )}
      </div>
    );
  }

  // Active / scheduled event
  return (
    <div className="mt-6 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">Add to calendar</h3>
      <div className="mt-3 flex flex-col gap-2.5">
        {dates.canGenerateGoogleCalendarLink && googleUrl ? (
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition"
          >
            Add to Google Calendar
            <span className="ml-1.5" aria-hidden="true">↗</span>
            <span className="sr-only"> (opens Google Calendar in a new tab)</span>
          </a>
        ) : dates.googleCalendarUnavailableReason ? (
          <p className="text-xs text-muted-foreground italic">
            Google Calendar: {dates.googleCalendarUnavailableReason}
          </p>
        ) : null}

        {dates.canGenerateIcs && (
          <a
            href={`/events/${event.slug}/calendar.ics`}
            download
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition"
          >
            Download .ics
          </a>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Export reflects event facts at download time. Calendar events do not automatically sync.
      </p>
    </div>
  );
}

/**
 * Compact calendar links for event cards on the Saved page.
 * Derives links strictly from already-fetched card DTO facts with zero database queries.
 */
export function EventCardCalendarActions({ event }: CalendarActionsProps) {
  const dates = getCalendarDates(event);
  const isCancelled = event.status === "cancelled";
  const isCompleted = event.status === "completed";

  if (isCancelled) {
    return (
      <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
        Event cancelled
      </p>
    );
  }

  if (isCompleted) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Event completed</span>
        {dates.canGenerateIcs && (
          <a
            href={`/events/${event.slug}/calendar.ics`}
            download
            className="underline underline-offset-4 hover:text-foreground"
          >
            .ics archive
          </a>
        )}
      </div>
    );
  }

  if (!dates.canGenerateIcs && !dates.canGenerateGoogleCalendarLink) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        {dates.icsUnavailableReason || "Date not specified"}
      </p>
    );
  }

  const googleUrl = dates.canGenerateGoogleCalendarLink ? generateGoogleCalendarUrl(event) : null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-medium">
      <span className="text-muted-foreground">Calendar:</span>
      {googleUrl && (
        <a
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center underline underline-offset-4 text-primary hover:text-primary/80 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          Google Calendar
          <span className="ml-1" aria-hidden="true">↗</span>
          <span className="sr-only"> (opens Google Calendar in a new tab)</span>
        </a>
      )}
      {dates.canGenerateIcs && (
        <a
          href={`/events/${event.slug}/calendar.ics`}
          download
          className="underline underline-offset-4 text-primary hover:text-primary/80 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          Download .ics
        </a>
      )}
    </div>
  );
}
