import Link from "next/link";
import { requireAdministrator } from "@/lib/auth/identity";
import { readAdminEvent, messages } from "@/lib/events/service";
import { EventEditor } from "@/components/event-editor";

export const metadata = {
    title: "Edit Event | Administrator Operations",
    robots: { index: false, follow: false },
};

function statusBadge(status: string) {
    const colors: Record<string, string> = {
        draft: "bg-gray-100 text-gray-800 border-gray-300",
        review: "bg-amber-100 text-amber-800 border-amber-300",
        published: "bg-emerald-100 text-emerald-800 border-emerald-300",
        unpublished: "bg-orange-100 text-orange-800 border-orange-300",
        archived: "bg-red-100 text-red-800 border-red-300",
    };
    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? "bg-gray-100 text-gray-800 border-gray-200"}`}
        >
            {status}
        </span>
    );
}

function verificationBadge(status: string) {
    const colors: Record<string, string> = {
        current: "bg-emerald-50 text-emerald-700 border-emerald-200",
        pending: "bg-blue-50 text-blue-700 border-blue-200",
        stale: "bg-amber-50 text-amber-700 border-amber-200",
        conflicted: "bg-purple-50 text-purple-700 border-purple-200",
        rejected: "bg-red-50 text-red-700 border-red-200",
    };
    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}
        >
            Verification: {status}
        </span>
    );
}

export default async function AdminEventDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<{
        saved?: string;
    }>;
}) {
    const { client } = await requireAdministrator();
    const { id } = await params;
    const { saved } = await searchParams;

    const result = await readAdminEvent(client, id);
    if (!result.ok) {
        return (
            <main className="max-w-4xl mx-auto p-6 md:p-8">
                <Link href="/admin" className="text-blue-600 underline text-sm">
                    ← Return to event list
                </Link>
                <div role="alert" className="my-6 p-4 bg-red-50 border border-red-200 rounded text-red-700">
                    <p className="font-semibold">{messages[result.code]}</p>
                </div>
            </main>
        );
    }

    const e = result.value;

    const [organizersRes, categoriesRes, interestsRes, skillsRes] = await Promise.all([
        client.from("organizers").select("id, name").order("name").limit(500),
        client.from("event_categories").select("id, name").order("name"),
        client.from("interests").select("slug, name").order("name").limit(500),
        client.from("skills").select("id, slug, name").order("name").limit(500),
    ]);

    const deadlines = (e.event_deadlines ?? []).map(d => ({
        id: d.id,
        kind: d.kind,
        label: d.label,
        local_date: d.local_date,
        due_at: d.due_at,
        timezone: d.timezone,
        precision: d.precision,
        source_id: d.source_id,
        active: d.active,
        is_primary: d.is_primary,
    }));

    const tags = (e.event_tags ?? []).map(t => ({
        kind: t.kind,
        tag: t.tag,
        skill_id: t.skill_id,
    }));

    // Workflow actions derived from C05 state transitions
    const workflowActions: Array<{
        action: "review" | "publish" | "unpublish" | "archive";
        label: string;
        hint?: string;
        style: string;
    }> = [];

    if (e.publication_status === "draft") {
        workflowActions.push({
            action: "review",
            label: "Submit for Review",
            hint: "Advances state to In Review for validation checks before publication.",
            style: "bg-amber-600 hover:bg-amber-700 text-white",
        });
        workflowActions.push({
            action: "archive",
            label: "Archive Event",
            hint: "Terminal state. Cannot be edited or published once archived.",
            style: "bg-red-600 hover:bg-red-700 text-white",
        });
    } else if (e.publication_status === "review") {
        workflowActions.push({
            action: "publish",
            label: "Publish Event",
            hint: "Requires current verification, complete identity fields, checked matching evidence, and no pending duplicate reviews.",
            style: "bg-emerald-600 hover:bg-emerald-700 text-white",
        });
        workflowActions.push({
            action: "archive",
            label: "Archive Event",
            hint: "Terminal state. Cannot be edited or published once archived.",
            style: "bg-red-600 hover:bg-red-700 text-white",
        });
    } else if (e.publication_status === "published") {
        workflowActions.push({
            action: "unpublish",
            label: "Unpublish Event",
            hint: "Removes event from public listings and search while retaining full audit history.",
            style: "bg-orange-600 hover:bg-orange-700 text-white",
        });
        workflowActions.push({
            action: "archive",
            label: "Archive Event",
            hint: "Terminal state. Cannot be edited or published once archived.",
            style: "bg-red-600 hover:bg-red-700 text-white",
        });
    } else if (e.publication_status === "unpublished") {
        workflowActions.push({
            action: "review",
            label: "Submit for Review",
            hint: "Returns event to In Review state for re-validation before republishing.",
            style: "bg-amber-600 hover:bg-amber-700 text-white",
        });
        workflowActions.push({
            action: "archive",
            label: "Archive Event",
            hint: "Terminal state. Cannot be edited or published once archived.",
            style: "bg-red-600 hover:bg-red-700 text-white",
        });
    }

    const pendingDuplicates = e.duplicate_reviews ?? [];

    // Pre-flight check for publication blockers that can be detected from current event data.
    // Note: C05 database mutate_event RPC remains authoritative.
    const detectedBlockers: string[] = [];
    if (e.verification_status !== "current") {
        detectedBlockers.push(`Verification status is '${e.verification_status}' (must be 'current' to publish).`);
    }
    if (pendingDuplicates.length > 0) {
        detectedBlockers.push(`Has ${pendingDuplicates.length} unresolved duplicate review item(s).`);
    }
    if (!e.short_description || !e.short_description.trim()) {
        detectedBlockers.push("Short description is missing.");
    }
    if (!e.organizer_id) {
        detectedBlockers.push("Organizer is not assigned.");
    }
    if (!e.category_id) {
        detectedBlockers.push("Category is not assigned.");
    }
    if (!e.official_url) {
        detectedBlockers.push("Official URL is missing.");
    }
    if (!e.registration_url) {
        detectedBlockers.push("Registration URL is missing.");
    }
    if (!e.last_checked_at) {
        detectedBlockers.push("Last checked timestamp is missing.");
    }
    if (!e.verification_level) {
        detectedBlockers.push("Verification level is missing.");
    }
    if (e.event_sources && e.event_sources.length > 0) {
        const requiredFields = [
            "title",
            "organizer",
            "official_url",
            "registration_url",
            "dates",
            "deadline",
            "eligibility",
            "team",
            "fee",
            "status",
            "registration_status",
        ];
        for (const src of e.event_sources) {
            const fe = (src.field_evidence as Record<string, { status?: string }>) || {};
            for (const rf of requiredFields) {
                if (fe[rf] && ["conflicted", "unresolved", "rejected"].includes(fe[rf].status || "")) {
                    detectedBlockers.push(`Source field '${rf}' has evidence status '${fe[rf].status}'.`);
                }
            }
        }
    }

    return (
        <main className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-8">
            {/* Breadcrumb Navigation */}
            <div>
                <Link
                    href="/admin"
                    className="inline-flex items-center text-xs font-semibold text-blue-600 hover:underline"
                >
                    ← All Events (Admin Operations)
                </Link>
            </div>

            {/* Saved Banner */}
            {saved && (
                <div role="status" className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center justify-between">
                    <div>
                        <span className="font-bold">Success:</span> Event changes saved successfully and recorded in audit history.
                    </div>
                    <span className="text-xs text-emerald-600 font-mono">version {e.version}</span>
                </div>
            )}

            {/* Header Information */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                        {e.title}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                        {statusBadge(e.publication_status)}
                        {verificationBadge(e.verification_status)}
                        <span className="font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            version {e.version}
                        </span>
                        <span className="font-mono text-gray-500">
                            ID: {e.id}
                        </span>
                    </div>
                </div>

                {/* Conditional Public View Link: Rendered ONLY if published */}
                {e.publication_status === "published" && (
                    <div className="self-start sm:self-auto">
                        <a
                            href={`/events/${e.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center px-3 py-1.5 border border-emerald-300 text-xs font-semibold rounded text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition"
                        >
                            View Public Page ↗
                        </a>
                    </div>
                )}
            </div>

            {/* Duplicate Review Warning Banner */}
            {pendingDuplicates.length > 0 && (
                <div className="p-4 bg-purple-50 border-l-4 border-purple-600 rounded text-purple-900 text-xs space-y-2">
                    <div className="flex items-center space-x-2 font-bold text-sm text-purple-950">
                        <span>⚠ Pending Duplicate Review Detected ({pendingDuplicates.length})</span>
                    </div>
                    <p>
                        This event has pending duplicate review items. Publication is strictly blocked by database guards
                        until duplicate items are reviewed and resolved by administrators.
                    </p>
                    <div className="space-y-1 pt-1 font-mono text-[11px]">
                        {pendingDuplicates.map(dup => (
                            <div key={dup.id} className="p-2 bg-white rounded border border-purple-200">
                                <div>Review ID: {dup.id}</div>
                                <div>
                                    Conflicting Event: {dup.event_a_id === e.id ? dup.event_b_id : dup.event_a_id}
                                </div>
                                {dup.signals && (
                                    <div className="text-[10px] text-gray-600 mt-1">
                                        Signals: {JSON.stringify(dup.signals)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Workflow Transition Controls */}
            {e.publication_status !== "archived" && workflowActions.length > 0 && (
                <section aria-labelledby="workflow-heading" className="p-5 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                    <h2 id="workflow-heading" className="text-base font-bold text-gray-900 mb-1">
                        Workflow State Transitions
                    </h2>
                    <p className="text-xs text-gray-600 mb-4">
                        State transitions follow strict database lifecycle rules. Provide an explicit reason for the permanent audit trail.
                    </p>

                    {e.publication_status === "review" && (
                        <div className="mb-4">
                            {detectedBlockers.length > 0 ? (
                                <div className="p-4 bg-amber-50 border border-amber-300 rounded text-amber-900 text-xs space-y-2">
                                    <div className="font-bold text-sm text-amber-950">
                                        Detected Publication Blockers ({detectedBlockers.length})
                                    </div>
                                    <p className="text-amber-800">
                                        These are currently detected blockers. Final publication requirements are enforced by the server/database.
                                    </p>
                                    <ul className="list-disc list-inside space-y-1 font-mono text-[11px] text-amber-950">
                                        {detectedBlockers.map((b, idx) => (
                                            <li key={idx}>{b}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded text-emerald-900 text-xs">
                                    <span className="font-bold text-emerald-950">Pre-flight check clear:</span> No blockers currently detected from page data. These are currently detected blockers. Final publication requirements are enforced by the server/database.
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-4">
                        {workflowActions.map(action => (
                            <form
                                key={action.action}
                                action="/admin/events/mutate"
                                method="post"
                                className="p-3 bg-white border border-gray-200 rounded flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                            >
                                <input type="hidden" name="action" value={action.action} />
                                <input type="hidden" name="id" value={e.id} />
                                <input type="hidden" name="expected_version" value={e.version} />

                                <div className="space-y-1 flex-1">
                                    <div className="font-semibold text-gray-900">{action.label}</div>
                                    {action.hint && <div className="text-gray-500">{action.hint}</div>}
                                </div>

                                <div className="flex items-center space-x-2 w-full md:w-auto">
                                    <input
                                        name="reason"
                                        required
                                        maxLength={1000}
                                        placeholder={`Reason to ${action.action}...`}
                                        className="border border-gray-300 rounded p-1.5 text-xs flex-1 md:w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    <button
                                        type="submit"
                                        className={`px-3 py-1.5 rounded font-semibold text-xs whitespace-nowrap shadow-sm transition ${action.style}`}
                                    >
                                        Confirm {action.action}
                                    </button>
                                </div>
                            </form>
                        ))}
                    </div>
                </section>
            )}

            {e.publication_status === "archived" && (
                <div className="p-4 bg-gray-100 border border-gray-300 rounded text-gray-700 text-xs">
                    <span className="font-bold">Archived:</span> This event is archived in a terminal state. No further edits or transitions are permitted.
                </div>
            )}

            {/* Structured Provenance & Evidence (`event_sources`) */}
            <section aria-labelledby="provenance-heading" className="p-5 bg-white border border-gray-200 rounded-lg shadow-sm">
                <h2 id="provenance-heading" className="text-base font-bold text-gray-900 mb-1">
                    Supporting Ingestion Provenance ({e.event_sources?.length ?? 0} sources)
                </h2>
                <p className="text-xs text-gray-600 mb-3">
                    Validated observation and field-level evidence snapshots from upstream sources. Raw storage references and connector secrets are omitted.
                </p>

                {!e.event_sources || e.event_sources.length === 0 ? (
                    <p className="text-xs text-gray-500 italic p-3 bg-gray-50 rounded border text-center">
                        No external sources associated with this event.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {e.event_sources.map(src => {
                            const fieldEvidence = (src.field_evidence as Record<string, { status?: string }>) ?? {};
                            const observations = (src.validated_observation as Record<string, unknown>) ?? {};
                            return (
                                <div key={src.id} className="p-3 bg-gray-50 border border-gray-200 rounded text-xs space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                        <div className="font-semibold text-blue-700 break-all">
                                            <a href={src.source_url} target="_blank" rel="noreferrer" className="hover:underline">
                                                {src.source_url} ↗
                                            </a>
                                        </div>
                                        <div className="text-[11px] text-gray-400 whitespace-nowrap">
                                            Last checked: {src.last_checked_at ? new Date(src.last_checked_at).toLocaleString() : "Never"}
                                        </div>
                                    </div>

                                    {/* Per-field Evidence Status */}
                                    {Object.keys(fieldEvidence).length > 0 && (
                                        <div>
                                            <span className="font-semibold text-gray-700">Field Evidence: </span>
                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                                {Object.entries(fieldEvidence).map(([field, ev]) => (
                                                    <span
                                                        key={field}
                                                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${ev.status === "checked" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : ev.status === "conflicted" ? "bg-red-50 text-red-800 border-red-200" : "bg-gray-100 text-gray-700 border-gray-200"}`}
                                                    >
                                                        {field}: {ev.status ?? "unknown"}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Validated Observation Details */}
                                    {Object.keys(observations).length > 0 && (
                                        <details className="pt-1">
                                            <summary className="text-[11px] text-gray-600 cursor-pointer font-medium hover:text-black">
                                                View Validated Observations ({Object.keys(observations).length} fields)
                                            </summary>
                                            <pre className="mt-1.5 p-2 bg-gray-900 text-gray-200 rounded text-[11px] font-mono overflow-x-auto">
                                                {JSON.stringify(observations, null, 2)}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Event Editor Form */}
            {e.publication_status !== "archived" && (
                <section aria-labelledby="editor-heading">
                    <h2 id="editor-heading" className="text-xl font-bold text-gray-900 mb-4">
                        Edit Event Details
                    </h2>
                    {organizersRes.error || categoriesRes.error ? (
                        <p role="alert" className="text-xs text-red-600 p-4 bg-red-50 rounded border border-red-200">
                            Reference data unavailable. Please reload the page.
                        </p>
                    ) : (
                        <EventEditor
                            event={e}
                            organizers={organizersRes.data ?? []}
                            categories={categoriesRes.data ?? []}
                            interests={interestsRes.data ?? []}
                            skills={skillsRes.data ?? []}
                            tags={tags}
                            deadlines={deadlines}
                        />
                    )}
                </section>
            )}

            {/* Audit History Timeline */}
            <section aria-labelledby="audit-heading" className="pt-8 border-t border-gray-200 space-y-4">
                <h2 id="audit-heading" className="text-xl font-bold text-gray-900">
                    Audit Log & Version History ({e.event_changes?.length ?? 0} revisions)
                </h2>
                <p className="text-xs text-gray-600">
                    Append-only immutable record of all changes, transitions, and before/after diffs.
                </p>

                <div className="space-y-3">
                    {[...(e.event_changes ?? [])]
                        .sort((a, b) => b.event_version - a.event_version)
                        .map(change => {
                            const diff = (change.field_diff as Record<string, { before?: unknown; after?: unknown }>) ?? {};
                            const diffKeys = Object.keys(diff);
                            return (
                                <details
                                    key={change.id}
                                    className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm text-xs space-y-2 group"
                                >
                                    <summary className="font-semibold text-gray-900 cursor-pointer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                        <span>
                                            Version {change.event_version} —{" "}
                                            <span className="font-normal text-gray-700">{change.reason}</span>
                                        </span>
                                        <span className="text-[11px] text-gray-400 font-normal">
                                            {new Date(change.created_at).toLocaleString()}
                                        </span>
                                    </summary>

                                    <div className="pt-3 border-t border-gray-100 space-y-2">
                                        <div className="text-[11px] text-gray-500 font-mono">
                                            Actor: {change.actor_id ? `Staff (${change.actor_id})` : "System / Deleted user"}
                                        </div>

                                        {diffKeys.length > 0 ? (
                                            <div className="mt-2 overflow-x-auto">
                                                <table className="min-w-full divide-y divide-gray-200 text-left text-[11px]">
                                                    <thead className="bg-gray-50 font-semibold text-gray-700">
                                                        <tr>
                                                            <th className="px-2 py-1">Field</th>
                                                            <th className="px-2 py-1">Before</th>
                                                            <th className="px-2 py-1">After</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100 font-mono">
                                                        {diffKeys.map(k => (
                                                            <tr key={k}>
                                                                <td className="px-2 py-1 font-semibold text-gray-800">{k}</td>
                                                                <td className="px-2 py-1 text-red-600 max-w-xs truncate">
                                                                    {JSON.stringify(diff[k]?.before) ?? "—"}
                                                                </td>
                                                                <td className="px-2 py-1 text-emerald-600 max-w-xs truncate">
                                                                    {JSON.stringify(diff[k]?.after) ?? "—"}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="text-[11px] text-gray-500 italic">No scalar fields changed in this revision.</div>
                                        )}
                                    </div>
                                </details>
                            );
                        })}
                </div>
            </section>
        </main>
    );
}
