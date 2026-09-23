import { loadSaveState } from "@/lib/saves/service";
import { notFound } from "next/navigation";
import { EventDetailContent } from "@/components/public-events";
import { readPublishedEvent } from "@/lib/events/public";
import { recommendationForEvent } from "@/lib/recommendations/service";
import { EventPersonalization } from "@/components/event-personalization";
export const dynamic = "force-dynamic";
export const metadata = { title: "Event details | Student Opportunities" };
export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await readPublishedEvent({ slug });
  if (!result.ok) {
    if (result.code === "not_found") notFound();
    throw new Error("Public event details unavailable");
  }
  const personalized = await recommendationForEvent(result.value.id, result.value.version);
  return <EventDetailContent saveState={await loadSaveState([result.value.id])} event={result.value} personalization={<EventPersonalization value={personalized}/>}/>;
}
