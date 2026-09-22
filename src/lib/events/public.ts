import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { getPublicSupabaseEnv } from "../supabase/public-env";
import { uuid } from "./validation";
// Explicit public projection: never ship evidence, raw metadata or private relations.
const detailFields = "id,slug,title,short_description,full_description,participation_process,official_url,registration_url,start_date,end_date,start_at,end_at,timezone,date_precision,mode,venue,city,state,country,eligibility_text,individual_allowed,min_team_size,max_team_size,fee,fee_max,fee_status,fee_basis,currency,prize_pool,prize_currency,prize_description,status,registration_status,verification_level,verification_status,last_checked_at,version,organizers(id,name,website),event_categories(id,slug,name),event_tags(tag,kind,skill_id),event_deadlines(id,kind,label,local_date,due_at,timezone,precision,source_id,active,is_primary)" as const;
const cardFields = "id,slug,title,short_description,start_date,end_date,start_at,end_at,timezone,date_precision,mode,venue,city,state,country,status,registration_status,verification_level,verification_status,last_checked_at,organizers(id,name,website),event_categories(id,slug,name),event_deadlines(id,kind,label,local_date,due_at,timezone,precision,active,is_primary)" as const;
export function publicClient() {
    const { url, key } = getPublicSupabaseEnv();
    return createClient<Database>(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
}
export const PUBLIC_PAGE_SIZE = 24;
/** Immutable UUID keyset order, not a popularity, freshness or relevance ranking. */
export async function listPublishedEvents(options: { after?: string } = {}) {
    if (options.after !== undefined && !uuid(options.after))
        return { ok: false as const, code: "invalid_cursor" as const };
    const client = publicClient();
    let query = client.from("events").select(cardFields).eq("publication_status", "published")
        .order("id", { ascending: true }).limit(PUBLIC_PAGE_SIZE + 1);
    if (options.after) query = query.gt("id", options.after);
    const result = await query;
    if (result.error) return { ok: false as const, code: "database_failure" as const };
    const items = result.data.slice(0, PUBLIC_PAGE_SIZE);
    return { ok: true as const, value: {
        items,
        nextCursor: result.data.length > PUBLIC_PAGE_SIZE ? items.at(-1)!.id : null,
    } };
}
export type PublicEventCard = Extract<Awaited<ReturnType<typeof listPublishedEvents>>, { ok: true }>["value"]["items"][number];
export type PublicEvent = Extract<Awaited<ReturnType<typeof readPublishedEvent>>, { ok: true }>["value"];
/** Deliberately anonymous even for an admin caller: no cookies or service key. */
export async function readPublishedEvent(key: {
    id: string;
} | {
    slug: string;
}) {
    const client = publicClient();
    if (("id" in key && !uuid(key.id)) || ("slug" in key && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key.slug)))
        return { ok: false as const, code: "not_found" as const };
    const query = client.from("events").select(detailFields).eq("publication_status", "published");
    const result = await ("id" in key ? query.eq("id", key.id) : query.eq("slug", key.slug)).maybeSingle();
    if (result.error)
        return { ok: false as const, code: "database_failure" as const };
    if (!result.data)
        return { ok: false as const, code: "not_found" as const };
    const sources = await client.from("public_event_sources").select("id,event_id,source_url,last_checked_at,source_name").eq("event_id", result.data.id);
    if (sources.error)
        return { ok: false as const, code: "database_failure" as const };
    // Recheck visibility after the source query, avoiding a mixed unpublish read.
    const visible = await client.from("events").select("version").eq("id", result.data.id).eq("publication_status", "published").eq("version", result.data.version).maybeSingle();
    if (visible.error)
        return { ok: false as const, code: "database_failure" as const };
    if (!visible.data)
        return { ok: false as const, code: "not_found" as const };
    const event = result.data;
    return { ok: true as const, value: { ...event, sources: sources.data, registration_deadline: event.event_deadlines.find(d => d.active && d.is_primary && d.kind === "registration") ?? null } };
}
