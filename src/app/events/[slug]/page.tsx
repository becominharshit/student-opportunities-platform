import { notFound } from "next/navigation";
import { EventDetailContent } from "@/components/public-events";
import { readPublishedEvent } from "@/lib/events/public";
export const dynamic = "force-dynamic";
export const metadata = { title: "Event details | Student Opportunities" };
export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await readPublishedEvent({ slug });
  if (!result.ok) {
    if (result.code === "not_found") notFound();
    throw new Error("Public event details unavailable");
  }
  return <EventDetailContent event={result.value} />;
}
