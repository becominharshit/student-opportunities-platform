import Link from "next/link";
import { requireAdministrator } from "@/lib/auth/identity";
import {
    getAdminDashboardSummary,
    listAdminEvents,
    messages,
} from "@/lib/events/service";
import { choices } from "@/lib/events/validation";

export const metadata = {
    title: "Administrator Operations | Student Opportunities",
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
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[status] ?? "bg-gray-100 text-gray-800 border-gray-200"}`}
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
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}
        >
            {status}
        </span>
    );
}

export default async function AdminPage({
    searchParams,
}: {
    searchParams: Promise<{
        page?: string;
        status?: string;
        category?: string;
        verification?: string;
    }>;
}) {
    const { client } = await requireAdministrator();
    const params = await searchParams;
    const page = Math.max(0, Math.min(100000, Number(params.page) || 0));
    const status = params.status || "";
    const categoryId = params.category || "";
    const verificationStatus = params.verification || "";

    const [summaryResult, listResult, categoriesResult] = await Promise.all([
        getAdminDashboardSummary(client),
        listAdminEvents(client, {
            page,
            status: status || undefined,
            categoryId: categoryId || undefined,
            verificationStatus: verificationStatus || undefined,
        }),
        client.from("event_categories").select("id, name, slug").order("name"),
    ]);

    if (!summaryResult.ok) {
        return (
            <main className="max-w-6xl mx-auto p-6 md:p-8">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Administrator Operations</h1>
                <p role="alert" className="text-red-600 bg-red-50 p-4 rounded border border-red-200">
                    {messages[summaryResult.code]}
                </p>
                <div className="mt-4">
                    <Link href="/account" className="text-blue-600 underline text-sm">
                        Back to account
                    </Link>
                </div>
            </main>
        );
    }

    if (!listResult.ok) {
        return (
            <main className="max-w-6xl mx-auto p-6 md:p-8">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Administrator Operations</h1>
                <p role="alert" className="text-red-600 bg-red-50 p-4 rounded border border-red-200">
                    {messages[listResult.code]}
                </p>
                <div className="mt-4">
                    <Link href="/admin" className="text-blue-600 underline text-sm">
                        Reset filters
                    </Link>
                </div>
            </main>
        );
    }

    const summary = summaryResult.value;
    const { items, hasNextPage } = listResult.value;
    const categories = categoriesResult.data ?? [];

    const hasActiveFilters = Boolean(status || categoryId || verificationStatus);

    // Build URL helper for pagination preserving active filters
    function getPageUrl(targetPage: number) {
        const q = new URLSearchParams();
        if (targetPage > 0) q.set("page", String(targetPage));
        if (status) q.set("status", status);
        if (categoryId) q.set("category", categoryId);
        if (verificationStatus) q.set("verification", verificationStatus);
        const str = q.toString();
        return str ? `/admin?${str}` : "/admin";
    }

    return (
        <main className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-gray-200 gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                        Administrator Operations
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                        Operational summaries, lifecycle management, and event curation based on real system records.
                    </p>
                </div>
                <div className="flex items-center space-x-3">
                    <Link
                        href="/admin/submissions"
                        className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Submissions Queue
                    </Link>
                    <Link
                        href="/admin/events/new"
                        className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        + Create Event
                    </Link>
                    <Link
                        href="/account"
                        className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Account
                    </Link>
                </div>
            </div>

            {/* Operational Summaries */}
            <section aria-labelledby="metrics-heading" className="my-8">
                <h2 id="metrics-heading" className="text-lg font-bold text-gray-900 mb-4">
                    Operational Metrics
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
                    <Link
                        href="/admin?status=draft"
                        className={`p-4 rounded-lg border text-center transition ${status === "draft" ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500 ring-opacity-50" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"}`}
                    >
                        <div className="text-2xl font-bold text-gray-900">{summary.counts.draft}</div>
                        <div className="text-xs font-medium text-gray-600 mt-1">Draft</div>
                    </Link>

                    <Link
                        href="/admin?status=review"
                        className={`p-4 rounded-lg border text-center transition ${status === "review" ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500 ring-opacity-50" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"}`}
                    >
                        <div className="text-2xl font-bold text-amber-600">{summary.counts.review}</div>
                        <div className="text-xs font-medium text-gray-600 mt-1">In Review</div>
                    </Link>

                    <Link
                        href="/admin?status=published"
                        className={`p-4 rounded-lg border text-center transition ${status === "published" ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500 ring-opacity-50" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"}`}
                    >
                        <div className="text-2xl font-bold text-emerald-600">{summary.counts.published}</div>
                        <div className="text-xs font-medium text-gray-600 mt-1">Published</div>
                    </Link>

                    <Link
                        href="/admin?status=unpublished"
                        className={`p-4 rounded-lg border text-center transition ${status === "unpublished" ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500 ring-opacity-50" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"}`}
                    >
                        <div className="text-2xl font-bold text-orange-600">{summary.counts.unpublished}</div>
                        <div className="text-xs font-medium text-gray-600 mt-1">Unpublished</div>
                    </Link>

                    <Link
                        href="/admin?status=archived"
                        className={`p-4 rounded-lg border text-center transition ${status === "archived" ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500 ring-opacity-50" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"}`}
                    >
                        <div className="text-2xl font-bold text-gray-500">{summary.counts.archived}</div>
                        <div className="text-xs font-medium text-gray-600 mt-1">Archived</div>
                    </Link>

                    <div className="p-4 rounded-lg border border-red-200 bg-red-50/30 text-center">
                        <div className="text-2xl font-bold text-red-600">{summary.counts.needsAttention}</div>
                        <div className="text-xs font-medium text-red-800 mt-1">Needs Attention</div>
                    </div>

                    <div className="p-4 rounded-lg border border-purple-200 bg-purple-50/30 text-center">
                        <div className="text-2xl font-bold text-purple-700">{summary.counts.duplicateReviews}</div>
                        <div className="text-xs font-medium text-purple-800 mt-1">Pending Dups</div>
                    </div>
                </div>
            </section>

            {/* Event Management & Filters */}
            <section aria-labelledby="events-heading" className="my-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <h2 id="events-heading" className="text-lg font-bold text-gray-900">
                        Event Catalogue Management
                    </h2>
                    {hasActiveFilters && (
                        <Link
                            href="/admin"
                            className="text-xs text-blue-600 hover:text-blue-800 underline self-start sm:self-auto"
                        >
                            Clear all filters
                        </Link>
                    )}
                </div>

                {/* Filter Form */}
                <form
                    action="/admin"
                    method="get"
                    className="p-4 bg-gray-50 border border-gray-200 rounded-lg mb-6 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-end"
                >
                    <div>
                        <label htmlFor="filter-status" className="block text-xs font-semibold text-gray-700 mb-1">
                            Publication Status
                        </label>
                        <select
                            id="filter-status"
                            name="status"
                            defaultValue={status}
                            className="block w-full border border-gray-300 rounded p-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All statuses</option>
                            <option value="draft">Draft</option>
                            <option value="review">In Review</option>
                            <option value="published">Published</option>
                            <option value="unpublished">Unpublished</option>
                            <option value="archived">Archived</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="filter-category" className="block text-xs font-semibold text-gray-700 mb-1">
                            Category
                        </label>
                        <select
                            id="filter-category"
                            name="category"
                            defaultValue={categoryId}
                            className="block w-full border border-gray-300 rounded p-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All categories</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="filter-verification" className="block text-xs font-semibold text-gray-700 mb-1">
                            Verification Status
                        </label>
                        <select
                            id="filter-verification"
                            name="verification"
                            defaultValue={verificationStatus}
                            className="block w-full border border-gray-300 rounded p-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All verification statuses</option>
                            {choices.verification_status.map(v => (
                                <option key={v} value={v}>
                                    {v}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <button
                            type="submit"
                            className="w-full bg-gray-800 hover:bg-gray-900 text-white font-medium p-1.5 rounded text-xs focus:outline-none focus:ring-2 focus:ring-gray-700 transition"
                        >
                            Filter Events
                        </button>
                    </div>
                </form>

                {/* Event Table (Desktop) / Cards (Mobile) */}
                {items.length === 0 ? (
                    <div className="p-8 text-center bg-white border border-gray-200 rounded-lg">
                        <p className="text-sm text-gray-500">
                            {hasActiveFilters
                                ? "No events match the selected filters."
                                : "No events registered in the catalogue yet."}
                        </p>
                        {hasActiveFilters && (
                            <Link href="/admin" className="text-xs text-blue-600 underline mt-2 inline-block">
                                Clear filters
                            </Link>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-lg bg-white shadow-sm">
                            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                                <thead className="bg-gray-50 text-gray-700 font-semibold">
                                    <tr>
                                        <th scope="col" className="px-4 py-3">Event</th>
                                        <th scope="col" className="px-4 py-3">Category</th>
                                        <th scope="col" className="px-4 py-3">State</th>
                                        <th scope="col" className="px-4 py-3">Verification</th>
                                        <th scope="col" className="px-4 py-3">Ver.</th>
                                        <th scope="col" className="px-4 py-3">Created</th>
                                        <th scope="col" className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {items.map(e => (
                                        <tr key={e.id} className="hover:bg-gray-50/60 transition">
                                            <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                                                <Link
                                                    href={`/admin/events/${e.id}`}
                                                    className="text-blue-600 hover:underline font-semibold"
                                                >
                                                    {e.title}
                                                </Link>
                                                <div className="text-[11px] text-gray-500 font-mono mt-0.5">{e.slug}</div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600">
                                                {e.event_categories?.name ?? "—"}
                                            </td>
                                            <td className="px-4 py-3">
                                                {statusBadge(e.publication_status)}
                                            </td>
                                            <td className="px-4 py-3">
                                                {verificationBadge(e.verification_status)}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-gray-600">
                                                v{e.version}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                {new Date(e.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                                                <Link
                                                    href={`/admin/events/${e.id}`}
                                                    className="text-blue-600 hover:text-blue-800 font-medium"
                                                >
                                                    Edit
                                                </Link>
                                                {e.publication_status === "published" && (
                                                    <a
                                                        href={`/events/${e.slug}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-gray-500 hover:text-gray-800"
                                                    >
                                                        View public ↗
                                                    </a>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Cards Stack */}
                        <div className="md:hidden space-y-3">
                            {items.map(e => (
                                <div
                                    key={e.id}
                                    className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm space-y-2.5"
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div>
                                            <Link
                                                href={`/admin/events/${e.id}`}
                                                className="text-sm font-semibold text-blue-600 hover:underline"
                                            >
                                                {e.title}
                                            </Link>
                                            <div className="text-[11px] font-mono text-gray-500">{e.slug}</div>
                                        </div>
                                        <div className="text-[11px] font-mono text-gray-400">v{e.version}</div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        {statusBadge(e.publication_status)}
                                        {verificationBadge(e.verification_status)}
                                        {e.event_categories && (
                                            <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                                                {e.event_categories.name}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-xs">
                                        <span className="text-gray-400">
                                            {new Date(e.created_at).toLocaleDateString()}
                                        </span>
                                        <div className="space-x-3">
                                            <Link
                                                href={`/admin/events/${e.id}`}
                                                className="text-blue-600 font-semibold"
                                            >
                                                Edit
                                            </Link>
                                            {e.publication_status === "published" && (
                                                <a
                                                    href={`/events/${e.slug}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-gray-600"
                                                >
                                                    View public ↗
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Bounded Lookahead Pagination */}
                <nav
                    aria-label="Event pagination"
                    className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 text-sm"
                >
                    <div>
                        {page > 0 ? (
                            <Link
                                href={getPageUrl(page - 1)}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                            >
                                ← Previous
                            </Link>
                        ) : (
                            <span className="inline-flex items-center px-3 py-1.5 border border-gray-200 rounded text-xs font-medium text-gray-300 bg-gray-50 cursor-not-allowed">
                                ← Previous
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 font-medium">Page {page + 1}</div>
                    <div>
                        {hasNextPage ? (
                            <Link
                                href={getPageUrl(page + 1)}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                            >
                                Next →
                            </Link>
                        ) : (
                            <span className="inline-flex items-center px-3 py-1.5 border border-gray-200 rounded text-xs font-medium text-gray-300 bg-gray-50 cursor-not-allowed">
                                Next →
                            </span>
                        )}
                    </div>
                </nav>
            </section>

            {/* Recent Changes Timeline */}
            <section aria-labelledby="history-heading" className="my-10 pt-6 border-t border-gray-200">
                <h2 id="history-heading" className="text-lg font-bold text-gray-900 mb-4">
                    Recent Administrative Changes (Audit History)
                </h2>
                {summary.recentChanges.length === 0 ? (
                    <p className="text-xs text-gray-500 italic p-4 bg-gray-50 rounded border text-center">
                        No recent changes recorded.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {summary.recentChanges.map(change => {
                            const changedFields = Object.keys(
                                (change.field_diff as Record<string, unknown>) ?? {}
                            );
                            return (
                                <div
                                    key={change.id}
                                    className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm text-xs space-y-1.5"
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                        <div className="font-semibold text-gray-900">
                                            {change.events ? (
                                                <Link
                                                    href={`/admin/events/${change.event_id}`}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    {change.events.title}
                                                </Link>
                                            ) : (
                                                <span className="font-mono text-gray-600">
                                                    Event {change.event_id.slice(0, 8)}...
                                                </span>
                                            )}{" "}
                                            <span className="text-gray-500 font-normal">
                                                (version {change.event_version})
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-gray-400">
                                            {new Date(change.created_at).toLocaleString()}
                                        </div>
                                    </div>

                                    <div className="text-gray-700">
                                        <span className="font-medium text-gray-800">Reason:</span> {change.reason}
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100 text-[11px] text-gray-500">
                                        <div>
                                            Actor:{" "}
                                            <span className="font-mono">
                                                {change.actor_id ? `Staff (${change.actor_id.slice(0, 8)}...)` : "System"}
                                            </span>
                                        </div>
                                        {changedFields.length > 0 && (
                                            <div>
                                                Modified: <span className="font-mono">{changedFields.join(", ")}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </main>
    );
}
