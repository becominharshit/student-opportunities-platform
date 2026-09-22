import { SearchExploreContent } from "@/components/explore-search";
import { parseExploreQuery, type QueryInput } from "@/lib/events/explore-query";
import { searchPublishedEvents } from "@/lib/events/public-search";
export const dynamic = "force-dynamic";
export const metadata = { title: "Explore events | Student Opportunities" };
export default async function ExplorePage({ searchParams }: { searchParams: Promise<QueryInput> }) {
  const { filters, warnings, after } = parseExploreQuery(await searchParams);
  const result = await searchPublishedEvents(filters, after);
  if (!result.ok && result.code === "database_failure") throw new Error("Public event catalogue unavailable");
  return <SearchExploreContent filters={filters} warnings={warnings} after={after}
    items={result.ok ? result.value.items : []} nextCursor={result.ok ? result.value.nextCursor : null}
    invalidCursor={!result.ok} />;
}
