import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types";
import { categories, validateCommand, uuid, type EventRow, type Issue } from "./validation";
export type Code = "unauthorized" | "forbidden" | "validation" | "not_found" | "version_conflict" | "publication_requirements" | "database_failure";
export type Result<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    code: Code;
    issues?: Issue[];
};
export const messages: Record<Code, string> = {
    unauthorized: "Sign in to continue.", forbidden: "Administrator access is required.", validation: "Check the supplied values and workflow transition.",
    not_found: "Event not found.", version_conflict: "Another edit changed this event. Reload it and reapply your changes; nothing was overwritten.",
    publication_requirements: "Publication requires complete identity fields, current verification and checked matching source evidence, with no pending duplicate review.",
    database_failure: "The operation could not be completed. Try again later.",
};
export type Client = SupabaseClient<Database>;
function failure(error: {
    code?: string;
}, publishing = false): Result<never> {
    const code: Code = ({ P0501: "unauthorized", P0503: "forbidden", P0504: "not_found", P0509: "version_conflict", P0512: "publication_requirements", P0522: "validation", "42501": "forbidden", "23505": "validation", "23503": "validation", "22P02": "validation", "22007": "validation", "22008": "validation", "23502": "validation", "23514": publishing ? "publication_requirements" : "validation" } as Record<string, Code>)[error.code ?? ""] ?? "database_failure";
    // Log only an allowlisted category. Never provider bodies, input, SQL, or credentials.
    if (code === "database_failure")
        console.error("Event database operation failed", { category: code });
    return { ok: false, code };
}
export async function authorizeAdmin(client: Client): Promise<Result<string>> {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.email_confirmed_at)
        return { ok: false, code: "unauthorized" };
    const membership = await client.from("admin_memberships").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (membership.error)
        return failure(membership.error);
    return membership.data ? { ok: true, value: data.user.id } : { ok: false, code: "forbidden" };
}
/** All commands use user JWT/RLS; the database rechecks membership inside the transaction. */
export async function mutateEvent(client: Client, input: unknown): Promise<Result<Omit<EventRow, "search_vector">>> {
    const auth = await authorizeAdmin(client);
    if (!auth.ok)
        return auth;
    let parsed = validateCommand(input);
    if (!parsed.command)
        return { ok: false, code: "validation", issues: parsed.issues };
    let previous: EventRow | undefined;
    if (parsed.command.action !== "create") {
        const row = await client.from("events").select("*").eq("id", parsed.command.id!).maybeSingle();
        if (row.error)
            return failure(row.error);
        if (!row.data)
            return { ok: false, code: "not_found" };
        previous = row.data;
        if (previous.version !== parsed.command.expected_version)
            return { ok: false, code: "version_conflict" };
        parsed = validateCommand(input, previous);
        if (!parsed.command)
            return { ok: false, code: "validation", issues: parsed.issues };
    }
    const command = parsed.command;
    const category = command.event?.category_id;
    if (category) {
        const found = await client.from("event_categories").select("slug").eq("id", String(category)).maybeSingle();
        if (found.error)
            return failure(found.error);
        if (!found.data || !categories.includes(found.data.slug as typeof categories[number]))
            return { ok: false, code: "validation", issues: [{ field: "category_id", message: "Choose an MVP category." }] };
    }
    const { data, error } = await client.rpc("mutate_event", { command: command as unknown as Json });
    if (error)
        return failure(error, command.action === "publish" || previous?.publication_status === "published");
    return { ok: true, value: data as unknown as Omit<EventRow, "search_vector"> };
}
export async function readAdminEvent(client: Client, id: string) {
    const auth = await authorizeAdmin(client);
    if (!auth.ok)
        return auth;
    if (!uuid(id))
        return { ok: false as const, code: "not_found" as const };
    const result = await client.from("events").select("*, organizers(*), event_categories(*), event_tags(*), event_deadlines(*), event_changes(*), event_sources(id,source_url,last_checked_at,validated_observation,field_evidence)").eq("id", id).maybeSingle();
    if (result.error)
        return failure(result.error);
    return result.data ? { ok: true as const, value: result.data } : { ok: false as const, code: "not_found" as const };
}
export async function listAdminEvents(client: Client, page = 0) {
    const auth = await authorizeAdmin(client);
    if (!auth.ok)
        return auth;
    const offset = Number.isSafeInteger(page) && page >= 0 ? Math.min(page, 100000) * 25 : 0;
    const result = await client.from("events").select("id,title,slug,publication_status,version").order("created_at", { ascending: false }).order("id").range(offset, offset + 24);
    return result.error ? failure(result.error) : { ok: true as const, value: result.data };
}
// Named operations for future callers; all delegate to the same authorization/transaction boundary.
export const createEvent = (client: Client, input: Omit<import("./validation").Command, "action" | "id" | "expected_version">) => mutateEvent(client, { ...input, action: "create" });
export const updateEvent = (client: Client, input: Omit<import("./validation").Command, "action">) => mutateEvent(client, { ...input, action: "update" });
export const publishEvent = (client: Client, id: string, expected_version: number, reason: string) => mutateEvent(client, { action: "publish", id, expected_version, reason });
export const unpublishEvent = (client: Client, id: string, expected_version: number, reason: string) => mutateEvent(client, { action: "unpublish", id, expected_version, reason });
export const archiveEvent = (client: Client, id: string, expected_version: number, reason: string) => mutateEvent(client, { action: "archive", id, expected_version, reason });
