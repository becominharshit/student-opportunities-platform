import Link from "next/link";
import { DiscoveryShell, ExploreContent } from "@/components/public-events";
import { listPublishedEvents } from "@/lib/events/public";
export const dynamic = "force-dynamic";
export const metadata = { title: "Explore events | Student Opportunities" };
export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ after?: string | string[] }> }) {
  const { after } = await searchParams;
  const result = await listPublishedEvents({ after: Array.isArray(after) ? "invalid" : after });
  if (!result.ok) {
    if (result.code === "invalid_cursor") return <DiscoveryShell><h1 className="text-3xl font-semibold">This page link is invalid</h1><Link className="mt-6 inline-block underline" href="/explore">Return to Explore</Link></DiscoveryShell>;
    throw new Error("Public event catalogue unavailable");
  }
  return <ExploreContent {...result.value} after={typeof after === "string" ? after : undefined} />;
}
