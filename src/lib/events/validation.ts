import type { Database, Json } from "../supabase/database.types";
export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export const categories = ["hackathon", "coding_competition", "workshop", "conference", "student_technology_event"] as const;
export const choices: Record<string, readonly string[]> = {
    date_precision: ["unknown", "date_only", "datetime"], mode: ["online", "offline", "hybrid"],
    fee_status: ["unknown", "free", "paid", "varies"], fee_basis: ["unknown", "person", "team", "other"],
    status: ["announced", "scheduled", "ongoing", "completed", "postponed", "cancelled", "unknown"],
    registration_status: ["not_open", "open", "closed", "unknown"],
    verification_level: ["verified", "source_confirmed", "community_submitted"],
    verification_status: ["pending", "current", "stale", "conflicted", "rejected"],
};
export const textFields = ["title", "slug", "short_description", "full_description", "participation_process", "official_url", "registration_url", "image_url", "start_date", "end_date", "start_at", "end_at", "timezone", "venue", "city", "state", "country", "eligibility_text", "currency", "prize_currency", "prize_description", "last_checked_at", "source_updated_at", "organizer_id", "category_id"] as const;
export const numberFields = ["latitude", "longitude", "min_team_size", "max_team_size", "fee", "fee_max", "prize_pool"] as const;
export const jsonFields = ["image_rights", "date_metadata", "eligibility_rules", "eligible_years", "eligible_degrees"] as const;
export const eventFields = [...textFields, ...numberFields, ...jsonFields, ...Object.keys(choices), "individual_allowed"];
export type Command = {
    action: "create" | "update" | "review" | "publish" | "unpublish" | "archive";
    id?: string;
    expected_version?: number;
    reason: string;
    event?: Record<string, Json>;
    tags?: Json[];
    deadlines?: Json[];
};
export type Issue = {
    field: string;
    message: string;
};
export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const nonempty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) > 0 && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const instant = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && date(v.slice(0, 10)) && Number.isFinite(Date.parse(v)) && Number(v.slice(11, 13)) < 24 && Number(v.slice(14, 16)) < 60 && Number(v.slice(17, 19)) < 60;
const zone = (v: unknown): v is string => { try {
    if (typeof v !== "string" || !v || /^[+-]/.test(v))
        return false;
    new Intl.DateTimeFormat("en", { timeZone: v }).format();
    return true;
}
catch {
    return false;
} };
export function https(v: unknown) { try {
    if (typeof v !== "string" || !/^https:\/\/[^\s<>]+$/.test(v))
        return false;
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && !!u.hostname;
}
catch {
    return false;
} }
function localDay(at: string, tz: string) { const p = new Intl.DateTimeFormat("en", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at)); return ["year", "month", "day"].map(k => p.find(x => x.type === k)?.value).join("-"); }
export function validEligibility(value: unknown): boolean {
    if (!isObject(value) || value.version !== 1 || JSON.stringify(value).length > 16384)
        return false;
    function rule(n: unknown, depth: number): boolean {
        if (!isObject(n) || depth > 12)
            return false;
        if (n.op === "all" || n.op === "any")
            return Array.isArray(n.rules) && n.rules.length > 0 && n.rules.every(x => rule(x, depth + 1));
        if (n.op === "unresolved")
            return nonempty(n.reason);
        if (n.op !== "predicate" || !["student_status", "degree", "study_year", "institution", "participation_country", "team_size"].includes(String(n.field)) || !nonempty(n.evidence))
            return false;
        if (n.operator === "unrestricted")
            return true;
        if (n.operator === "in")
            return Array.isArray(n.value) && n.value.length > 0 && n.value.every(v => rule({ ...n, operator: "eq", value: v }, depth + 1));
        if (!["eq", "gte", "lte"].includes(String(n.operator)))
            return false;
        if (n.field === "study_year" || n.field === "team_size")
            return Number.isSafeInteger(n.value) && Number(n.value) > 0;
        if (n.operator !== "eq")
            return false;
        if (n.field === "student_status")
            return typeof n.value === "boolean";
        return nonempty(n.value) && (n.field !== "participation_country" || /^[A-Z]{2}$/.test(String(n.value)));
    }
    return rule(value.expression, 0);
}
export function validateCommand(input: unknown, previous?: EventRow): {
    command?: Command;
    issues: Issue[];
} {
    const issues: Issue[] = [];
    const bad = (field: string, message = "Invalid value or combination.") => issues.push({ field, message });
    if (!isObject(input) || JSON.stringify(input).length > 120000)
        return { issues: [{ field: "command", message: "Expected a bounded command object." }] };
    for (const k of Object.keys(input))
        if (!["action", "id", "expected_version", "reason", "event", "tags", "deadlines"].includes(k))
            bad(k, "Unsupported field.");
    if (!["create", "update", "review", "publish", "unpublish", "archive"].includes(String(input.action)))
        bad("action");
    if (!nonempty(input.reason) || String(input.reason).length > 1000)
        bad("reason", "Provide a reason of 1–1000 characters.");
    if (input.action !== "create" && (!uuid(input.id) || !Number.isSafeInteger(input.expected_version) || Number(input.expected_version) < 1))
        bad("expected_version", "Event ID and expected version are required.");
    if (input.action === "create" && ("id" in input || "expected_version" in input))
        bad("id");
    if (input.event !== undefined && !isObject(input.event))
        bad("event");
    const patch = isObject(input.event) ? input.event : {};
    for (const k of Object.keys(patch))
        if (!eventFields.includes(k))
            bad(k, "Unsupported event field.");
    if (input.action !== "create" && "slug" in patch)
        bad("slug", "The slug is immutable.");
    if (!["create", "update"].includes(String(input.action)) && (Object.keys(patch).length || "tags" in input || "deadlines" in input))
        bad("action", "State actions cannot also edit content.");
    const e: Record<string, unknown> = { date_precision: "unknown", fee_status: "unknown", fee_basis: "unknown", status: "unknown", registration_status: "unknown", verification_status: "pending", ...previous, ...patch };
    // Validate complete rows for edits, and only the supplied field types before a row is loaded.
    const full = input.action === "create" || !!previous;
    const values = full ? e : patch;
    for (const k of textFields) {
        const v = values[k];
        if (v != null && (typeof v !== "string" || !v.trim() || v.length > (["full_description", "participation_process", "eligibility_text"].includes(k) ? 20000 : k === "short_description" ? 2000 : 2048)))
            bad(k);
    }
    for (const k of ["title", "slug"])
        if ((full || k in patch) && !nonempty(e[k]))
            bad(k, "Required.");
    if (values.slug != null && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(values.slug)))
        bad("slug");
    for (const [k, allowed] of Object.entries(choices))
        if (values[k] !== undefined && (values[k] === null ? !["mode", "verification_level"].includes(k) : (typeof values[k] !== "string" || !allowed.includes(values[k] as string))))
            bad(k);
    for (const k of ["organizer_id", "category_id"])
        if (values[k] != null && !uuid(values[k]))
            bad(k);
    for (const k of ["official_url", "registration_url", "image_url"])
        if (values[k] != null && !https(values[k]))
            bad(k, "Use an absolute HTTPS URL without credentials.");
    for (const k of ["start_date", "end_date"])
        if (values[k] != null && !date(values[k]))
            bad(k);
    for (const k of ["start_at", "end_at", "last_checked_at", "source_updated_at"])
        if (values[k] != null && !instant(values[k]))
            bad(k, "Include a valid date, time and explicit offset.");
    if (values.timezone != null && !zone(values.timezone))
        bad("timezone");
    if (values.country != null && !/^[A-Z]{2}$/.test(String(values.country)))
        bad("country");
    for (const k of ["currency", "prize_currency"])
        if (values[k] != null && !/^[A-Z]{3}$/.test(String(values[k])))
            bad(k);
    for (const k of numberFields)
        if (values[k] != null && (typeof values[k] !== "number" || !Number.isFinite(values[k])))
            bad(k);
    for (const k of ["min_team_size", "max_team_size"])
        if (values[k] != null && (!Number.isSafeInteger(values[k]) || Number(values[k]) < 1 || Number(values[k]) > 2147483647))
            bad(k);
    for (const k of ["fee", "fee_max", "prize_pool"])
        if (values[k] != null && (Number(values[k]) < 0 || Number(values[k]) > Number.MAX_SAFE_INTEGER / 100 || Math.abs(Number(values[k]) * 100 - Math.round(Number(values[k]) * 100)) > 0.000001))
            bad(k, "Use a nonnegative amount with at most two decimal places.");
    if (values.latitude != null && Math.abs(Number(values.latitude)) > 90)
        bad("latitude");
    if (values.longitude != null && Math.abs(Number(values.longitude)) > 180)
        bad("longitude");
    if (values.individual_allowed != null && typeof values.individual_allowed !== "boolean")
        bad("individual_allowed");
    for (const k of ["eligible_years", "eligible_degrees"])
        if (values[k] != null && (!Array.isArray(values[k]) || !(values[k] as unknown[]).length || (values[k] as unknown[]).length > 100 || !(values[k] as unknown[]).every(v => k === "eligible_years" ? Number.isSafeInteger(v) && Number(v) > 0 : nonempty(v))))
            bad(k, "Use null for unknown; empty arrays do not mean unrestricted.");
    for (const k of ["image_rights", "date_metadata"])
        if (values[k] != null && (!isObject(values[k]) || JSON.stringify(values[k]).length > 16384))
            bad(k);
    if (values.eligibility_rules != null && !validEligibility(values.eligibility_rules))
        bad("eligibility_rules");
    if (full) {
        for (const [a, b] of [["start_date", "end_date"], ["min_team_size", "max_team_size"], ["fee", "fee_max"]])
            if (e[a] != null && e[b] != null && e[a]! > e[b]!)
                bad(a);
        if (instant(e.start_at) && instant(e.end_at) && Date.parse(e.start_at) > Date.parse(e.end_at))
            bad("start_at");
        if (e.date_precision === "unknown" && [e.start_date, e.end_date, e.start_at, e.end_at].some(v => v != null))
            bad("date_precision");
        if (e.date_precision === "date_only" && ((e.start_date == null && e.end_date == null) || e.start_at != null || e.end_at != null))
            bad("date_precision");
        if (e.date_precision === "datetime" && ((e.start_at == null && e.end_at == null) || !zone(e.timezone)))
            bad("date_precision");
        for (const [at, day] of [["start_at", "start_date"], ["end_at", "end_date"]])
            if (e[at] != null && (!instant(e[at]) || !zone(e.timezone) || localDay(e[at] as string, e.timezone as string) !== e[day]))
                bad(at, "Timestamp must match its local date and timezone.");
        if ((e.fee != null || e.fee_max != null) && !e.currency)
            bad("currency");
        if (e.prize_pool != null && !e.prize_currency)
            bad("prize_currency");
        if (e.fee_status === "unknown" && (e.fee != null || e.fee_max != null))
            bad("fee_status");
        if (e.fee_status === "free" && [e.fee, e.fee_max].some(v => v != null && v !== 0))
            bad("fee_status");
        if (e.fee_status === "paid" && e.fee != null && Number(e.fee) <= 0)
            bad("fee");
        if (e.image_url != null && (!isObject(e.image_rights) || !Object.keys(e.image_rights).length))
            bad("image_rights");
    }
    for (const collection of ["tags", "deadlines"]) {
        if (!(collection in input))
            continue;
        const list = input[collection];
        if (!Array.isArray(list) || list.length > 100) {
            bad(collection);
            continue;
        }
        const seen = new Set<string>();
        let primary = 0;
        for (const [i, item] of list.entries()) {
            const path = collection + "." + i;
            if (!isObject(item)) {
                bad(path);
                continue;
            }
            const allowed = collection === "tags" ? ["kind", "tag", "skill_id"] : ["id", "kind", "label", "local_date", "due_at", "timezone", "precision", "source_id", "active", "is_primary"];
            if (Object.keys(item).some(k => !allowed.includes(k)))
                bad(path);
            if (collection === "tags") {
                if (!["domain", "skill"].includes(String(item.kind)) || !nonempty(item.tag) || String(item.tag).length > 100 || (item.kind === "skill" ? !uuid(item.skill_id) : item.skill_id != null))
                    bad(path);
                const key = item.kind + ":" + item.tag;
                if (seen.has(key))
                    bad(path, "Duplicate tag.");
                seen.add(key);
            }
            else {
                if (!["registration", "submission", "stage"].includes(String(item.kind)) || !nonempty(item.label) || String(item.label).length > 300 || typeof item.active !== "boolean" || typeof item.is_primary !== "boolean")
                    bad(path);
                if (item.id !== undefined && (!uuid(item.id) || seen.has(item.id)))
                    bad(path);
                if (typeof item.id === "string")
                    seen.add(item.id);
                if (item.source_id != null && !uuid(item.source_id))
                    bad(path);
                if (item.timezone != null && !zone(item.timezone))
                    bad(path);
                if (item.local_date != null && !date(item.local_date))
                    bad(path);
                if (item.due_at != null && !instant(item.due_at))
                    bad(path);
                if (item.is_primary && (item.kind !== "registration" || item.active && ++primary > 1))
                    bad(path, "Only one active primary registration deadline is allowed.");
                if (item.precision === "unknown") {
                    if (item.local_date != null || item.due_at != null)
                        bad(path);
                }
                else if (item.precision === "date_only") {
                    if (!date(item.local_date) || item.due_at != null)
                        bad(path);
                }
                else if (item.precision === "datetime") {
                    if (!instant(item.due_at) || !zone(item.timezone) || localDay(item.due_at as string, item.timezone as string) !== item.local_date)
                        bad(path);
                }
                else
                    bad(path);
            }
        }
    }
    return issues.length ? { issues } : { command: input as Command, issues };
}
