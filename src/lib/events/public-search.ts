import "server-only";
import { createHash } from "node:crypto";
import { publicClient, PUBLIC_PAGE_SIZE, type PublicEventCard } from "./public";
import { exploreUrl, type ExploreFilters } from "./explore-query";
import type { Json } from "../supabase/database.types";
type Row = { card: PublicEventCard; key: string | null };
type Cursor = { v: 1; scope: string; id: string; key: string | null };
export async function searchPublishedEvents(filters: ExploreFilters, after?: string) {
  const scope = createHash("sha256").update(exploreUrl(filters)).digest("hex");
  let cursor: Cursor | null = null;
  if (after !== undefined) {
    try {
      if (after.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(after)) throw Error();
      cursor = JSON.parse(Buffer.from(after, "base64url").toString("utf8")) as Cursor;
      if (!cursor || cursor.v !== 1 || cursor.scope !== scope ||
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(cursor.id) ||
        !(cursor.key === null || typeof cursor.key === "string" && /^-?\d{1,20}(\.\d{1,20})?$/.test(cursor.key))) throw Error();
    } catch { return { ok: false as const, code: "invalid_cursor" as const }; }
  }
  const result = await publicClient().rpc("search_published_events", {
    filters, page_after: cursor as unknown as Json,
  });
  if (result.error || !Array.isArray(result.data)) return { ok: false as const, code: "database_failure" as const };
  const rows = result.data as unknown as Row[];
  const page = rows.slice(0, PUBLIC_PAGE_SIZE);
  const last = page.at(-1);
  return { ok: true as const, value: {
    items: page.map(row => row.card),
    nextCursor: rows.length > PUBLIC_PAGE_SIZE && last ? Buffer.from(JSON.stringify({ v: 1, scope, id: last.card.id, key: last.key } satisfies Cursor)).toString("base64url") : null,
  } };
}
