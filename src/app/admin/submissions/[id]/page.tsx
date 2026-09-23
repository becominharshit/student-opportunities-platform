import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdministrator } from "@/lib/auth/identity";
import {
  getAdminSubmission,
  getAdminSubmissionHistory,
  findDuplicateCandidates,
} from "@/lib/submissions/service";
import { AdminSubmissionView } from "@/components/admin-submission-view";

export const metadata = {
  title: "Review Submission | Administrator Operations",
  robots: { index: false, follow: false },
};

export default async function AdminSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { client } = await requireAdministrator();

  const [submission, history, categoriesRes, organizersRes] = await Promise.all([
    getAdminSubmission(client, id),
    getAdminSubmissionHistory(client, id),
    client.from("event_categories").select("id, name, slug").order("name"),
    client.from("organizers").select("id, name").order("name").limit(500),
  ]);

  if (!submission) {
    notFound();
  }

  const duplicates = await findDuplicateCandidates(
    client,
    submission.submission.official_url,
    submission.submission.registration_url,
    submission.submission.title
  );

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
      <div>
        <Link
          href="/admin/submissions"
          className="inline-flex items-center text-xs font-semibold text-blue-600 hover:underline"
        >
          ← Community Submissions Queue
        </Link>
      </div>

      <div className="pb-4 border-b border-gray-200">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Review Event Submission
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Verify submitter claims and evidence against official organizer channels before accepting into canonical events.
        </p>
      </div>

      <AdminSubmissionView
        submission={submission}
        history={history}
        duplicates={duplicates}
        categories={categoriesRes.data ?? []}
        organizers={organizersRes.data ?? []}
      />
    </main>
  );
}
