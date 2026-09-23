import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types";
import { categories, choices, validateCommand, uuid, type EventRow, type Issue } from "./validation";
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
    if (error || !data?.user?.email_confirmed_at)
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

export type AdminDashboardSummary = {
    counts: {
        draft: number;
        review: number;
        published: number;
        unpublished: number;
        archived: number;
        needsAttention: number;
        duplicateReviews: number;
    };
    recentChanges: Array<{
        id: string;
        event_id: string;
        event_version: number;
        reason: string;
        created_at: string;
        actor_id: string | null;
        field_diff: Json;
        events: {
            id: string;
            title: string;
            slug: string;
        } | null;
    }>;
};

export async function getAdminDashboardSummary(client: Client): Promise<Result<AdminDashboardSummary>> {
    const auth = await authorizeAdmin(client);
    if (!auth.ok)
        return auth;
    const [draftRes, reviewRes, publishedRes, unpublishedRes, archivedRes, attentionRes, duplicateRes, changesRes] = await Promise.all([
        client.from("events").select("id", { count: "exact", head: true }).eq("publication_status", "draft"),
        client.from("events").select("id", { count: "exact", head: true }).eq("publication_status", "review"),
        client.from("events").select("id", { count: "exact", head: true }).eq("publication_status", "published"),
        client.from("events").select("id", { count: "exact", head: true }).eq("publication_status", "unpublished"),
        client.from("events").select("id", { count: "exact", head: true }).eq("publication_status", "archived"),
        client.from("events").select("id", { count: "exact", head: true }).in("verification_status", ["pending", "stale", "conflicted", "rejected"]),
        client.from("duplicate_reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
        client.from("event_changes").select("id, event_id, event_version, reason, created_at, actor_id, field_diff, events(id, title, slug)").order("created_at", { ascending: false }).limit(5),
    ]);
    if (draftRes.error) return failure(draftRes.error);
    if (reviewRes.error) return failure(reviewRes.error);
    if (publishedRes.error) return failure(publishedRes.error);
    if (unpublishedRes.error) return failure(unpublishedRes.error);
    if (archivedRes.error) return failure(archivedRes.error);
    if (attentionRes.error) return failure(attentionRes.error);
    if (duplicateRes.error) return failure(duplicateRes.error);
    if (changesRes.error) return failure(changesRes.error);

    return {
        ok: true,
        value: {
            counts: {
                draft: draftRes.count ?? 0,
                review: reviewRes.count ?? 0,
                published: publishedRes.count ?? 0,
                unpublished: unpublishedRes.count ?? 0,
                archived: archivedRes.count ?? 0,
                needsAttention: attentionRes.count ?? 0,
                duplicateReviews: duplicateRes.count ?? 0,
            },
            recentChanges: (changesRes.data ?? []) as unknown as AdminDashboardSummary["recentChanges"],
        },
    };
}

export type AdminEventListItem = {
    id: string;
    title: string;
    slug: string;
    publication_status: string;
    verification_status: string;
    category_id: string | null;
    updated_at: string;
    created_at: string;
    version: number;
    event_categories: {
        id: string;
        name: string;
        slug: string;
    } | null;
};

export type AdminEventListResult = {
    items: AdminEventListItem[];
    hasNextPage: boolean;
    page: number;
};

export async function listAdminEvents(
    client: Client,
    options: number | { page?: number; status?: string; categoryId?: string; verificationStatus?: string } = 0
): Promise<Result<AdminEventListResult>> {
    const auth = await authorizeAdmin(client);
    if (!auth.ok)
        return auth;
    const opts = typeof options === "number" ? { page: options } : options;
    const page = Number.isSafeInteger(opts.page) && (opts.page ?? 0) >= 0 ? Math.min(opts.page!, 100000) : 0;
    const offset = page * 25;
    let query = client.from("events").select("id, title, slug, publication_status, verification_status, category_id, updated_at, created_at, version, event_categories(id, name, slug)");

    if (opts.status && ["draft", "review", "published", "unpublished", "archived"].includes(opts.status)) {
        query = query.eq("publication_status", opts.status);
    }
    if (opts.categoryId && uuid(opts.categoryId)) {
        query = query.eq("category_id", opts.categoryId);
    }
    if (opts.verificationStatus && choices.verification_status.includes(opts.verificationStatus)) {
        query = query.eq("verification_status", opts.verificationStatus);
    }

    const result = await query.order("created_at", { ascending: false }).order("id").range(offset, offset + 25);
    if (result.error)
        return failure(result.error);
    const data = result.data ?? [];
    const hasNextPage = data.length > 25;
    const items = (hasNextPage ? data.slice(0, 25) : data) as unknown as AdminEventListItem[];
    return { ok: true, value: { items, hasNextPage, page } };
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
    if (!result.data)
        return { ok: false as const, code: "not_found" as const };

    const dupResult = await client.from("duplicate_reviews").select("id, event_a_id, event_b_id, status, signals, created_at").eq("status", "pending").or(`event_a_id.eq.${id},event_b_id.eq.${id}`);
    if (dupResult.error)
        return failure(dupResult.error);

    return { ok: true as const, value: { ...result.data, duplicate_reviews: dupResult.data ?? [] } };
}

// Named operations for future callers; all delegate to the same authorization/transaction boundary.
export const createEvent = (client: Client, input: Omit<import("./validation").Command, "action" | "id" | "expected_version">) => mutateEvent(client, { ...input, action: "create" });
export const updateEvent = (client: Client, input: Omit<import("./validation").Command, "action">) => mutateEvent(client, { ...input, action: "update" });
export const reviewEvent = (client: Client, id: string, expected_version: number, reason: string) => mutateEvent(client, { action: "review", id, expected_version, reason });
export const publishEvent = (client: Client, id: string, expected_version: number, reason: string) => mutateEvent(client, { action: "publish", id, expected_version, reason });
export const unpublishEvent = (client: Client, id: string, expected_version: number, reason: string) => mutateEvent(client, { action: "unpublish", id, expected_version, reason });
export const archiveEvent = (client: Client, id: string, expected_version: number, reason: string) => mutateEvent(client, { action: "archive", id, expected_version, reason });
