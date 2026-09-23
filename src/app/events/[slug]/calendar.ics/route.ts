import { readPublishedEvent } from "@/lib/events/public";
import { generateEventIcs, getCalendarDates, sanitizeIcsFilename } from "@/lib/events/calendar";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;

  // Query published event via existing public RLS-safe helper (deliberately anonymous, never service role)
  const result = await readPublishedEvent({ slug });
  if (!result.ok || !result.value) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  }

  const event = result.value;
  const dates = getCalendarDates(event);

  // If no usable calendar date exists, export is disabled
  if (!dates.canGenerateIcs) {
    return new Response("Event date is not specified.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  }

  try {
    const icsContent = generateEventIcs(event);
    const filename = sanitizeIcsFilename(event.slug);

    return new Response(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new Response("Failed to generate calendar export.", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  }
}
