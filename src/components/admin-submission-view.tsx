"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type {
  AdminSubmissionDetail,
  SubmissionModerationEvent,
  DuplicateCandidate,
  RejectionReasonCode,
  SubmitterRelationship,
} from "@/lib/submissions/types";
import {
  SUBMITTER_RELATIONSHIP_LABELS,
  REJECTION_REASON_LABELS,
} from "@/lib/submissions/types";

interface AdminSubmissionViewProps {
  submission: AdminSubmissionDetail;
  history: SubmissionModerationEvent[];
  duplicates: DuplicateCandidate[];
  categories: Array<{ id: string; name: string; slug: string }>;
  organizers: Array<{ id: string; name: string }>;
}

export function AdminSubmissionView({
  submission: detail,
  history,
  duplicates,
  categories,
  organizers,
}: AdminSubmissionViewProps) {
  const router = useRouter();
  const submission = detail.submission;
  const moderation = detail.moderation;

  // Action states
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "accept" | "reject">("details");

  // Reject form state
  const [rejectReason, setRejectReason] = useState<RejectionReasonCode>("insufficient_information");
  const [rejectDetails, setRejectDetails] = useState("");
  const [rejectInternalNotes, setRejectInternalNotes] = useState("");

  // Accept form state
  const defaultSlug = submission.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "community-event";

  const matchedCategory = categories.find((c) => c.slug === submission.category_slug) || categories[0];

  const [acceptTitle, setAcceptTitle] = useState(submission.title);
  const [acceptSlug, setAcceptSlug] = useState(defaultSlug);
  const [acceptCategoryId, setAcceptCategoryId] = useState(matchedCategory?.id || "");
  const [acceptOrganizerId, setAcceptOrganizerId] = useState("");
  const [acceptMode, setAcceptMode] = useState<string>(submission.mode);
  const [acceptOfficialUrl, setAcceptOfficialUrl] = useState(submission.official_url || "");
  const [acceptRegistrationUrl, setAcceptRegistrationUrl] = useState(submission.registration_url || "");
  const [acceptStartDate, setAcceptStartDate] = useState(submission.start_date || "");
  const [acceptEndDate, setAcceptEndDate] = useState(submission.end_date || "");
  const [acceptTimezone, setAcceptTimezone] = useState(submission.registration_deadline_timezone || "UTC");
  const [acceptVenue] = useState(submission.venue || "");
  const [acceptCity] = useState(submission.city || "");
  const [acceptState] = useState(submission.state || "");
  const [acceptCountry] = useState(submission.country || "");
  const [acceptShortDescription, setAcceptShortDescription] = useState(
    submission.description ? submission.description.slice(0, 200) : ""
  );
  const [acceptFullDescription, setAcceptFullDescription] = useState(submission.description || "");
  const [acceptEligibilityText] = useState(submission.eligibility_summary || "");
  const [acceptMinTeam] = useState<number | "">(submission.min_team_size ?? "");
  const [acceptMaxTeam] = useState<number | "">(submission.max_team_size ?? "");
  const [acceptFeeStatus] = useState(submission.fee_status);
  const [acceptFeeAmount] = useState<number | "">(submission.fee_amount ?? "");
  const [acceptCurrency] = useState(submission.currency || "USD");
  const [acceptPrizeDescription] = useState(submission.prize_description || "");
  const [acceptInternalNotes, setAcceptInternalNotes] = useState(moderation.internal_notes || "");
  const [acceptPublicNotes] = useState("");

  async function handleStartReview() {
    setIsProcessing(true);
    setErrorNotice(null);

    try {
      const res = await fetch("/admin/submissions/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_review",
          id: submission.id,
          expected_version: submission.version,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorNotice(json.message || "Failed to start review. Please reload and retry.");
        setIsProcessing(false);
        return;
      }

      router.refresh();
    } catch {
      setErrorNotice("Network error occurred. Please retry.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    setIsProcessing(true);
    setErrorNotice(null);

    try {
      const res = await fetch("/admin/submissions/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          id: submission.id,
          expected_version: submission.version,
          rejection_reason_code: rejectReason,
          rejection_reason_details: rejectDetails || null,
          internal_notes: rejectInternalNotes || null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorNotice(json.message || "Failed to reject submission.");
        setIsProcessing(false);
        return;
      }

      router.refresh();
      setActiveTab("details");
    } catch {
      setErrorNotice("Network error occurred. Please retry.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setIsProcessing(true);
    setErrorNotice(null);

    // Build event object for C05 mutate_event
    const eventPatch: Record<string, unknown> = {
      title: acceptTitle,
      slug: acceptSlug,
      category_id: acceptCategoryId || null,
      organizer_id: acceptOrganizerId || null,
      mode: acceptMode,
      official_url: acceptOfficialUrl || null,
      registration_url: acceptRegistrationUrl || null,
      start_date: acceptStartDate || null,
      end_date: acceptEndDate || null,
      date_precision: acceptStartDate || acceptEndDate ? "date_only" : "unknown",
      timezone: acceptTimezone || null,
      venue: acceptVenue || null,
      city: acceptCity || null,
      state: acceptState || null,
      country: acceptCountry || null,
      short_description: acceptShortDescription || null,
      full_description: acceptFullDescription || null,
      eligibility_text: acceptEligibilityText || null,
      min_team_size: typeof acceptMinTeam === "number" ? acceptMinTeam : null,
      max_team_size: typeof acceptMaxTeam === "number" ? acceptMaxTeam : null,
      fee_status: acceptFeeStatus,
      fee: typeof acceptFeeAmount === "number" ? acceptFeeAmount : null,
      currency: acceptCurrency || null,
      prize_description: acceptPrizeDescription || null,
    };

    const deadlines: Array<Record<string, unknown>> = [];
    if (submission.registration_deadline_precision !== "unknown") {
      deadlines.push({
        kind: "registration",
        label: "Registration Deadline",
        precision: submission.registration_deadline_precision,
        local_date: submission.registration_deadline_local_date,
        due_at: submission.registration_deadline_due_at,
        timezone: submission.registration_deadline_timezone || acceptTimezone || "UTC",
        active: true,
        is_primary: true,
      });
    }

    const eventCommand = {
      action: "create",
      reason: `Accepted community submission ${submission.id}`,
      event: eventPatch,
      deadlines: deadlines.length > 0 ? deadlines : undefined,
    };

    try {
      const res = await fetch("/admin/submissions/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          id: submission.id,
          expected_version: submission.version,
          event_command: eventCommand,
          internal_notes: acceptInternalNotes || null,
          public_notes: acceptPublicNotes || null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorNotice(json.message || "Failed to accept submission.");
        setIsProcessing(false);
        return;
      }

      // Accepted successfully - navigate to the created canonical event in admin dashboard
      router.push(`/admin/events/${json.value.canonicalEventId}?saved=1`);
    } catch {
      setErrorNotice("Network error occurred. Please retry.");
      setIsProcessing(false);
    }
  }

  const canModerate = submission.status === "submitted" || submission.status === "under_review";

  return (
    <div className="space-y-8">
      {errorNotice && (
        <div role="alert" className="p-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorNotice}
        </div>
      )}

      {/* Moderation Controls Header */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</span>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-lg font-bold text-gray-900 capitalize">
              {submission.status.replace("_", " ")}
            </span>
            <span className="text-xs text-gray-500">Version: {submission.version}</span>
          </div>
        </div>

        {canModerate && (
          <div className="flex flex-wrap items-center gap-3">
            {submission.status === "submitted" && (
              <Button
                type="button"
                variant="outline"
                disabled={isProcessing}
                onClick={handleStartReview}
              >
                Start Review
              </Button>
            )}

            <Button
              type="button"
              variant={activeTab === "reject" ? "default" : "outline"}
              onClick={() => setActiveTab(activeTab === "reject" ? "details" : "reject")}
            >
              Reject Submission
            </Button>

            <Button
              type="button"
              variant={activeTab === "accept" ? "outline" : "default"}
              onClick={() => setActiveTab(activeTab === "accept" ? "details" : "accept")}
            >
              Accept &amp; Convert to Draft
            </Button>
          </div>
        )}

        {submission.status === "accepted" && moderation.canonical_event_id && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-emerald-700">Accepted into Canonical Events</span>
            <Link
              href={`/admin/events/${moderation.canonical_event_id}`}
              className="inline-flex items-center px-4 py-2 border border-emerald-300 text-sm font-medium rounded-md text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
            >
              View Canonical Event Draft →
            </Link>
          </div>
        )}
      </div>

      {/* Reject Form */}
      {activeTab === "reject" && canModerate && (
        <form
          onSubmit={handleReject}
          className="p-6 bg-red-50 border border-red-200 rounded-lg space-y-4"
        >
          <h2 className="text-lg font-bold text-red-900">Reject Submission</h2>
          <p className="text-sm text-red-700">
            Rejecting this submission records the reason and notifies the submitter on their submission dashboard.
          </p>

          <div className="space-y-1">
            <label htmlFor="rejection-reason" className="block text-xs font-semibold text-red-900 uppercase">
              Rejection Reason Code *
            </label>
            <select
              id="rejection-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value as RejectionReasonCode)}
              className="w-full sm:w-80 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              required
            >
              {Object.entries(REJECTION_REASON_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="rejection-details" className="block text-xs font-semibold text-red-900 uppercase">
              Submitter-Visible Explanation (optional)
            </label>
            <textarea
              id="rejection-details"
              rows={3}
              value={rejectDetails}
              onChange={(e) => setRejectDetails(e.target.value)}
              placeholder="Explain why this opportunity was not accepted so the submitter has clear feedback..."
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              maxLength={1000}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="reject-internal-notes" className="block text-xs font-semibold text-red-900 uppercase">
              Internal Admin Notes (private, not visible to submitter)
            </label>
            <textarea
              id="reject-internal-notes"
              rows={2}
              value={rejectInternalNotes}
              onChange={(e) => setRejectInternalNotes(e.target.value)}
              placeholder="Internal verification notes, check details, or fraud notes..."
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              maxLength={5000}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              variant="default"
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={isProcessing}
            >
              Confirm Rejection
            </Button>
            <Button type="button" variant="outline" onClick={() => setActiveTab("details")}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Accept & Convert Form */}
      {activeTab === "accept" && canModerate && (
        <form
          onSubmit={handleAccept}
          className="p-6 bg-emerald-50 border border-emerald-200 rounded-lg space-y-6"
        >
          <div>
            <h2 className="text-lg font-bold text-emerald-900">Accept and Convert to Canonical Draft</h2>
            <p className="text-sm text-emerald-800 mt-1">
              <strong>Cardinal Safety Rule:</strong> Accepting creates an unpublished <code>draft</code> canonical event
              with <code>verification_level = &apos;community_submitted&apos;</code> and <code>verification_status = &apos;pending&apos;</code>.
              It will NOT appear on Explore until you verify and publish it in the Canonical Events dashboard.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="accept-title" className="block text-xs font-semibold text-gray-700 uppercase">
                Event Title *
              </label>
              <input
                id="accept-title"
                type="text"
                value={acceptTitle}
                onChange={(e) => setAcceptTitle(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="accept-slug" className="block text-xs font-semibold text-gray-700 uppercase">
                URL Slug * (immutable once created)
              </label>
              <input
                id="accept-slug"
                type="text"
                value={acceptSlug}
                onChange={(e) => setAcceptSlug(e.target.value)}
                pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="accept-category" className="block text-xs font-semibold text-gray-700 uppercase">
                Category *
              </label>
              <select
                id="accept-category"
                value={acceptCategoryId}
                onChange={(e) => setAcceptCategoryId(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="accept-organizer" className="block text-xs font-semibold text-gray-700 uppercase">
                Canonical Organizer (optional)
              </label>
              <select
                id="accept-organizer"
                value={acceptOrganizerId}
                onChange={(e) => setAcceptOrganizerId(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">-- No linked organizer --</option>
                {organizers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="accept-mode" className="block text-xs font-semibold text-gray-700 uppercase">
                Mode *
              </label>
              <select
                id="accept-mode"
                value={acceptMode}
                onChange={(e) => setAcceptMode(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                required
              >
                <option value="online">Online</option>
                <option value="offline">In-person</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="accept-timezone" className="block text-xs font-semibold text-gray-700 uppercase">
                Timezone
              </label>
              <input
                id="accept-timezone"
                type="text"
                value={acceptTimezone}
                onChange={(e) => setAcceptTimezone(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="accept-official-url" className="block text-xs font-semibold text-gray-700 uppercase">
                Official Website URL
              </label>
              <input
                id="accept-official-url"
                type="url"
                value={acceptOfficialUrl}
                onChange={(e) => setAcceptOfficialUrl(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="accept-reg-url" className="block text-xs font-semibold text-gray-700 uppercase">
                Registration URL
              </label>
              <input
                id="accept-reg-url"
                type="url"
                value={acceptRegistrationUrl}
                onChange={(e) => setAcceptRegistrationUrl(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="accept-start-date" className="block text-xs font-semibold text-gray-700 uppercase">
                Start Date (YYYY-MM-DD)
              </label>
              <input
                id="accept-start-date"
                type="date"
                value={acceptStartDate}
                onChange={(e) => setAcceptStartDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="accept-end-date" className="block text-xs font-semibold text-gray-700 uppercase">
                End Date (YYYY-MM-DD)
              </label>
              <input
                id="accept-end-date"
                type="date"
                value={acceptEndDate}
                onChange={(e) => setAcceptEndDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="accept-short-desc" className="block text-xs font-semibold text-gray-700 uppercase">
              Short Description (max 2000 chars)
            </label>
            <textarea
              id="accept-short-desc"
              rows={2}
              value={acceptShortDescription}
              onChange={(e) => setAcceptShortDescription(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              maxLength={2000}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="accept-full-desc" className="block text-xs font-semibold text-gray-700 uppercase">
              Full Description (max 20000 chars)
            </label>
            <textarea
              id="accept-full-desc"
              rows={4}
              value={acceptFullDescription}
              onChange={(e) => setAcceptFullDescription(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              maxLength={20000}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="accept-notes" className="block text-xs font-semibold text-gray-700 uppercase">
              Internal Moderation Notes (admin-only)
            </label>
            <textarea
              id="accept-notes"
              rows={2}
              value={acceptInternalNotes}
              onChange={(e) => setAcceptInternalNotes(e.target.value)}
              placeholder="Notes on verified organizer credentials, review steps, or sources..."
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isProcessing}>
              Create Canonical Event Draft
            </Button>
            <Button type="button" variant="outline" onClick={() => setActiveTab("details")}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Duplicate Candidates Warning / Box */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span>Duplicate Detection</span>
          {duplicates.length > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
              {duplicates.length} potential duplicate{duplicates.length > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
              0 duplicates detected
            </span>
          )}
        </h2>

        {duplicates.length > 0 ? (
          <ul className="mt-4 divide-y divide-gray-100 border border-amber-200 rounded-md bg-amber-50/50">
            {duplicates.map((dup) => (
              <li key={dup.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase text-amber-900">
                      {dup.publication_status}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{dup.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-amber-800">
                    Reasons: {dup.match_reasons.join(", ")}
                  </p>
                </div>
                <Link
                  href={`/admin/events/${dup.id}`}
                  className="text-xs text-blue-600 underline font-medium hover:text-blue-800"
                >
                  Inspect existing event →
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-gray-500">
            No existing canonical events matched the title, official website, or registration link.
          </p>
        )}
      </div>

      {/* Untrusted Submitted Content Card */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Untrusted Submitter Input
          </span>
          <h2 className="mt-1 text-2xl font-bold text-gray-900">{submission.title}</h2>
          <p className="text-sm text-gray-600 mt-1">
            Claimed Organizer: <strong>{submission.organizer_name}</strong>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-sm">
          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Category</dt>
            <dd className="mt-1 text-gray-900 font-medium">{submission.category_slug}</dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Mode</dt>
            <dd className="mt-1 text-gray-900 font-medium capitalize">{submission.mode}</dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Submitter Relationship</dt>
            <dd className="mt-1 text-gray-900 font-medium">
              {SUBMITTER_RELATIONSHIP_LABELS[submission.submitter_relationship as SubmitterRelationship] || submission.submitter_relationship}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Submitter Account</dt>
            <dd className="mt-1 text-gray-900 font-medium">{submission.submitter_email || "Anonymous"}</dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Submitted At</dt>
            <dd className="mt-1 text-gray-900 font-medium">{new Date(submission.created_at).toLocaleString()}</dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Last Updated</dt>
            <dd className="mt-1 text-gray-900 font-medium">{new Date(submission.updated_at).toLocaleString()}</dd>
          </div>
        </div>

        {/* URLs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4 text-sm">
          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Official Website</dt>
            <dd className="mt-1 truncate">
              {submission.official_url ? (
                <a
                  href={submission.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline text-xs font-medium hover:text-blue-800"
                >
                  {submission.official_url} ↗
                </a>
              ) : (
                <span className="text-gray-400">None provided</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Registration Link</dt>
            <dd className="mt-1 truncate">
              {submission.registration_url ? (
                <a
                  href={submission.registration_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline text-xs font-medium hover:text-blue-800"
                >
                  {submission.registration_url} ↗
                </a>
              ) : (
                <span className="text-gray-400">None provided</span>
              )}
            </dd>
          </div>
        </div>

        {/* Dates & Deadlines */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 border-t border-gray-100 pt-4 text-sm">
          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Event Dates</dt>
            <dd className="mt-1 text-gray-900">
              {submission.start_date || "Unknown"} → {submission.end_date || "Unknown"}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Registration Deadline</dt>
            <dd className="mt-1 text-gray-900">
              {submission.registration_deadline_precision === "unknown" && "Not specified"}
              {submission.registration_deadline_precision === "date_only" && (
                <span>Date: {submission.registration_deadline_local_date}</span>
              )}
              {submission.registration_deadline_precision === "datetime" && (
                <span>
                  Exact: {new Date(submission.registration_deadline_due_at!).toLocaleString()} ({submission.registration_deadline_timezone || "UTC"})
                </span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Location</dt>
            <dd className="mt-1 text-gray-900">
              {[submission.venue, submission.city, submission.state, submission.country].filter(Boolean).join(", ") || "Not specified"}
            </dd>
          </div>
        </div>

        {/* Description & Eligibility */}
        <div className="space-y-4 border-t border-gray-100 pt-4 text-sm">
          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Submitted Description</dt>
            <dd className="mt-1 text-gray-900 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-md border border-gray-200">
              {submission.description || "No description provided."}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold text-gray-500 uppercase">Eligibility Summary</dt>
            <dd className="mt-1 text-gray-900 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-md border border-gray-200">
              {submission.eligibility_summary || "No eligibility summary provided."}
            </dd>
          </div>
        </div>

        {/* Submitter Notes */}
        {submission.submitter_notes && (
          <div className="border-t border-gray-100 pt-4 text-sm">
            <dt className="text-xs font-semibold text-gray-500 uppercase">Notes from Submitter</dt>
            <dd className="mt-1 text-gray-900 whitespace-pre-wrap bg-blue-50/50 p-4 rounded-md border border-blue-100">
              {submission.submitter_notes}
            </dd>
          </div>
        )}
      </div>

      {/* Moderation Audit History */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h2 className="text-base font-bold text-gray-900">Moderation Audit Timeline</h2>
        <div className="mt-4 flow-root">
          <ul className="-mb-8">
            {history.map((event, idx) => (
              <li key={event.id}>
                <div className="relative pb-8">
                  {idx !== history.length - 1 && (
                    <span
                      className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex space-x-3">
                    <div>
                      <span className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ring-8 ring-white text-white text-xs font-bold">
                        {event.action[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900 capitalize">
                          {event.action.replace("_", " ")}{" "}
                          <span className="text-xs text-gray-500 font-normal">
                            by {event.actor_role} ({event.from_status || "start"} → {event.to_status})
                          </span>
                        </p>
                        {event.public_notes && (
                          <p className="mt-1 text-xs text-gray-700 bg-gray-50 p-2 rounded border border-gray-100">
                            Public notes: {event.public_notes}
                          </p>
                        )}
                        {event.internal_notes && (
                          <p className="mt-1 text-xs text-gray-700 bg-amber-50/50 p-2 rounded border border-amber-100">
                            Internal notes: {event.internal_notes}
                          </p>
                        )}
                      </div>
                      <div className="text-right text-xs whitespace-nowrap text-gray-500">
                        {new Date(event.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
