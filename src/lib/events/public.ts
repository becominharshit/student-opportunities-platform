import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { getPublicSupabaseEnv } from "../supabase/public-env";
import { uuid } from "./validation";
/** Deliberately anonymous even for an admin caller: no cookies or service key. */
export async function readPublishedEvent(key: {
    id: string;
} | {
    slug: string;
}) {
    const { url, key: apiKey } = getPublicSupabaseEnv();
    const client = createClient<Database>(url, apiKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    if (("id" in key && !uuid(key.id)) || ("slug" in key && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key.slug)))
        return { ok: false as const, code: "not_found" as const };
    const query = client.from("events").select("*, organizers(id,name,website), event_categories(id,slug,name), event_tags(tag,kind,skill_id), event_deadlines(id,kind,label,local_date,due_at,timezone,precision,source_id,active,is_primary)").eq("publication_status", "published");
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
    const { search_vector: ignored, ...event } = result.data;
    void ignored;
    return { ok: true as const, value: { ...event, sources: sources.data, registration_deadline: event.event_deadlines.find(d => d.active && d.is_primary && d.kind === "registration") ?? null } };
}
