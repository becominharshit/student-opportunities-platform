import Link from "next/link";
import { requireAdministrator } from "@/lib/auth/identity";
import { listAdminSubmissions } from "@/lib/submissions/service";
import { SUBMITTER_RELATIONSHIP_LABELS, type SubmissionStatus } from "@/lib/submissions/types";

export const metadata = {
  title: "Community Submissions Queue | Administrator Operations",
  robots: { index: false, follow: false },
};

function statusBadge(status: SubmissionStatus) {
  const styles: Record<SubmissionStatus, string> = {
    submitted: "bg-blue-50 text-blue-700 border-blue-200",
    under_review: "bg-amber-50 text-amber-700 border-amber-200",
    accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    withdrawn: "bg-gray-100 text-gray-700 border-gray-300",
  };
  const labels: Record<SubmissionStatus, string> = {
    submitted: "Submitted",
    under_review: "Under Review",
    accepted: "Accepted",
    rejected: "Not Accepted",
    withdrawn: "Withdrawn",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
        styles[status] ?? "bg-gray-100 text-gray-700 border-gray-200"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    after?: string;
  }>;
}) {
  const { client } = await requireAdministrator();
  const params = await searchParams;

  const currentStatus = params.status || "";

  let cursorCreatedAt: string | undefined;
  let cursorId: string | undefined;

  if (params.after) {
    try {
      const decoded = Buffer.from(params.after, "base64url").toString("utf8");
      const parsed = JSON.parse(decoded);
      if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
        cursorCreatedAt = parsed.createdAt;
        cursorId = parsed.id;
      }
    } catch {
      // Ignore malformed cursor
    }
  }

  const { items, nextCursor } = await listAdminSubmissions(client, {
    status: currentStatus || undefined,
    cursorCreatedAt,
    cursorId,
  });

  const statusFilters: Array<{ label: string; value: string }> = [
    { label: "All Submissions", value: "" },
    { label: "Needs Review", value: "submitted" },
    { label: "Under Review", value: "under_review" },
    { label: "Accepted", value: "accepted" },
    { label: "Not Accepted", value: "rejected" },
    { label: "Withdrawn", value: "withdrawn" },
  ];

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-gray-200 gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/admin" className="hover:underline">
              ← Administrator Operations
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Community Event Submissions
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Review untrusted event submissions from students and community organizers before converting to canonical drafts.
          </p>
        </div>
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Canonical Events Dashboard
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-gray-200 pb-4">
        {statusFilters.map((tab) => {
          const isActive = currentStatus === tab.value;
          const href = tab.value ? `/admin/submissions?status=${tab.value}` : "/admin/submissions";
          return (
            <Link
              key={tab.value}
              href={href}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Submissions List */}
      <div className="mt-6">
        {items.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-sm text-gray-500">No submissions found in this queue.</p>
            {currentStatus && (
              <div className="mt-2">
                <Link href="/admin/submissions" className="text-xs text-blue-600 underline">
                  Clear status filter
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden border border-gray-200 sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {items.map((sub) => (
                <li key={sub.id}>
                  <Link
                    href={`/admin/submissions/${sub.id}`}
                    className="block hover:bg-gray-50 transition duration-150 ease-in-out px-4 py-4 sm:px-6"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {statusBadge(sub.status)}
                          <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                            {sub.category_slug}
                          </span>
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-xs text-gray-500 capitalize">
                            {sub.mode}
                          </span>
                        </div>
                        <h2 className="mt-1 text-base font-semibold text-gray-900 truncate">
                          {sub.title}
                        </h2>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span>Organizer: <strong className="font-medium text-gray-700">{sub.organizer_name}</strong></span>
                          <span>Submitter: {sub.submitter_email || "Anonymous/Unlinked"} ({SUBMITTER_RELATIONSHIP_LABELS[sub.submitter_relationship] || sub.submitter_relationship})</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-right shrink-0">
                        <span className="text-xs text-gray-500">
                          {new Date(sub.created_at).toLocaleDateString()}
                        </span>
                        <span className="text-xs text-blue-600 font-medium">
                          Review →
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Pagination */}
      {nextCursor && (
        <div className="mt-6 flex justify-end">
          <Link
            href={`/admin/submissions?${currentStatus ? `status=${currentStatus}&` : ""}after=${encodeURIComponent(nextCursor)}`}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Next submissions →
          </Link>
        </div>
      )}
    </main>
  );
}
