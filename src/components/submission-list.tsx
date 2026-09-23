"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { UserSubmissionItem } from "@/lib/submissions/types";
import { SUBMITTER_RELATIONSHIP_LABELS, REJECTION_REASON_LABELS } from "@/lib/submissions/types";

interface SubmissionListProps {
  items: UserSubmissionItem[];
  nextCursor: string | null;
}

export function SubmissionList({ items, nextCursor }: SubmissionListProps) {
  const router = useRouter();
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleWithdraw(id: string, expectedVersion: number) {
    if (!confirm("Are you sure you want to withdraw this submission? It will be marked as withdrawn.")) {
      return;
    }

    setIsProcessing(true);
    setWithdrawingId(id);
    setActionError(null);

    try {
      const res = await fetch(`/api/submissions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "withdraw",
          expected_version: expectedVersion,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setActionError(json.message || "Failed to withdraw submission. Please reload and retry.");
        setIsProcessing(false);
        return;
      }

      setWithdrawingId(null);
      router.refresh();
    } catch {
      setActionError("Network error occurred. Please retry.");
    } finally {
      setIsProcessing(false);
    }
  }

  function getStatusBadge(status: UserSubmissionItem["status"]) {
    const config: Record<UserSubmissionItem["status"], { label: string; className: string }> = {
      submitted: {
        label: "Submitted",
        className: "bg-blue-50 text-blue-800 border-blue-200",
      },
      under_review: {
        label: "Under Review",
        className: "bg-amber-50 text-amber-800 border-amber-200",
      },
      accepted: {
        label: "Accepted",
        className: "bg-emerald-50 text-emerald-800 border-emerald-200",
      },
      rejected: {
        label: "Not Accepted",
        className: "bg-red-50 text-red-800 border-red-200",
      },
      withdrawn: {
        label: "Withdrawn",
        className: "bg-gray-100 text-gray-700 border-gray-300",
      },
    };

    const cfg = config[status] || { label: status, className: "bg-gray-100 text-gray-800 border-gray-200" };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.className}`}>
        {cfg.label}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div role="alert" className="p-4 rounded-md bg-destructive/10 border border-destructive text-destructive text-sm font-medium">
          {actionError}
        </div>
      )}

      {items.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-border rounded-lg">
          <p className="text-muted-foreground text-sm">You haven&apos;t submitted any opportunities yet.</p>
          <div className="mt-4">
            <Link href="/submit-event">
              <Button>Submit an Opportunity</Button>
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((sub) => (
            <li
              key={sub.id}
              className="p-5 rounded-lg border border-border bg-card text-card-foreground shadow-sm space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge(sub.status)}
                    <span className="text-xs text-muted-foreground">
                      {SUBMITTER_RELATIONSHIP_LABELS[sub.submitterRelationship] || sub.submitterRelationship}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-foreground break-words">{sub.title}</h3>
                  <p className="text-sm text-muted-foreground break-words">{sub.organizerName}</p>
                </div>

                <div className="text-right text-xs text-muted-foreground">
                  <span>Submitted: {new Date(sub.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Status Notice / Published Link */}
              {sub.status === "accepted" && (
                <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
                  {sub.publishedEventSlug ? (
                    <p>
                      🎉 This opportunity is now published on the platform!{" "}
                      <Link
                        href={`/events/${sub.publishedEventSlug}`}
                        className="font-semibold underline underline-offset-4 hover:text-emerald-950"
                      >
                        View public opportunity →
                      </Link>
                    </p>
                  ) : (
                    <p className="font-medium">
                      Accepted by administrators. The opportunity draft is in pre-publication review and will appear on Explore once verified.
                    </p>
                  )}
                </div>
              )}

              {sub.status === "rejected" && (
                <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-900 space-y-1">
                  <p className="font-semibold">
                    Review Status: {sub.rejectionReasonCode ? REJECTION_REASON_LABELS[sub.rejectionReasonCode] || sub.rejectionReasonCode : "Not Accepted"}
                  </p>
                  {sub.rejectionReasonDetails && (
                    <p className="text-xs text-red-800 leading-relaxed break-words">{sub.rejectionReasonDetails}</p>
                  )}
                </div>
              )}

              {sub.status === "under_review" && (
                <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-900">
                  <p className="font-medium">
                    This submission is currently being reviewed by an administrator. Edits are locked during review.
                  </p>
                </div>
              )}

              {/* Source link info */}
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pt-1">
                {sub.officialUrl && (
                  <span className="truncate max-w-xs">
                    Website:{" "}
                    <a
                      href={sub.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      {sub.officialUrl}
                    </a>
                  </span>
                )}
                {sub.registrationUrl && (
                  <span className="truncate max-w-xs">
                    Registration:{" "}
                    <a
                      href={sub.registrationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      {sub.registrationUrl}
                    </a>
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border text-sm">
                {(sub.status === "submitted" || sub.status === "under_review") && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleWithdraw(sub.id, sub.version)}
                    className="text-xs text-destructive underline underline-offset-4 hover:opacity-80 disabled:opacity-50"
                  >
                    {isProcessing && withdrawingId === sub.id ? "Withdrawing..." : "Withdraw submission"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="pt-4 border-t border-border flex justify-end">
          <Link
            href={`/account/submissions?after=${encodeURIComponent(nextCursor)}`}
            className="inline-flex items-center text-sm font-semibold underline underline-offset-4 hover:text-primary"
          >
            Older submissions →
          </Link>
        </div>
      )}
    </div>
  );
}
