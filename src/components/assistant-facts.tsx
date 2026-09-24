"use client";

import Link from "next/link";
import type { AuthoritativeFacts } from "@/lib/assistant/types";

export function AssistantFacts({ facts }: { facts: AuthoritativeFacts }) {
  const hasEligibility = facts.eligibility && facts.eligibility.length > 0;
  const hasComparisons = facts.comparisons && facts.comparisons.length > 0;
  const hasDeadlines = facts.deadlines && facts.deadlines.length > 0;
  const hasRecommendations = facts.recommendations && facts.recommendations.items.length > 0;

  if (!hasEligibility && !hasComparisons && !hasDeadlines && !hasRecommendations) {
    return null;
  }

  return (
    <div className="mt-4 space-y-4">
      {/* 1. Authoritative Eligibility Facts */}
      {hasEligibility && (
        <section aria-label="Authoritative Eligibility" className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Authoritative Eligibility Evaluation (C14)
          </p>
          <div className="space-y-3">
            {facts.eligibility!.map((elig) => (
              <div key={elig.eventId} className="rounded-md border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/events/${elig.eventSlug}`}
                    className="font-semibold hover:underline text-foreground"
                  >
                    {elig.eventTitle}
                  </Link>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${
                      elig.state === "eligible"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : elig.state === "ineligible"
                        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    {elig.state}
                  </span>
                </div>
                {elig.reasons.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc list-inside">
                    {elig.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. Authoritative Comparison Facts */}
      {hasComparisons && (
        <section aria-label="Opportunity Comparison" className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Factual Comparison Matrix
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {facts.comparisons!.map((comp) => (
              <div key={comp.eventId} className="rounded-md border border-border bg-card p-3 space-y-2 text-xs">
                <div className="font-semibold text-sm border-b border-border pb-1">
                  <Link href={`/events/${comp.eventSlug}`} className="hover:underline">
                    {comp.eventTitle}
                  </Link>
                </div>
                <div><span className="text-muted-foreground">Category:</span> {comp.category || "Not specified"}</div>
                <div><span className="text-muted-foreground">Mode:</span> {comp.mode || "Not specified"}</div>
                <div><span className="text-muted-foreground">Dates:</span> {comp.dates || "Not specified"}</div>
                <div><span className="text-muted-foreground">Deadline:</span> {comp.deadline || "Not specified in platform data"}</div>
                <div><span className="text-muted-foreground">Fee:</span> {comp.fee || "Not specified"}</div>
                <div><span className="text-muted-foreground">Prize:</span> {comp.prize || "Not specified"}</div>
                {comp.eligibilityState && (
                  <div>
                    <span className="text-muted-foreground">Eligibility:</span>{" "}
                    <span className="font-semibold uppercase">{comp.eligibilityState}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Authoritative Deadlines */}
      {hasDeadlines && (
        <section aria-label="Upcoming Deadlines" className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Active Registration Deadlines (Chronological)
          </p>
          <div className="space-y-2">
            {facts.deadlines!.map((d) => (
              <div
                key={d.eventId}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-md border border-border bg-card p-3 gap-2 text-xs"
              >
                <div>
                  <Link href={`/events/${d.eventSlug}`} className="font-semibold text-sm hover:underline">
                    {d.eventTitle}
                  </Link>
                  <p className="text-muted-foreground mt-0.5">
                    {d.deadlineLabel} · {d.precision === "datetime" ? "Exact Cutoff" : "Date-Only (Time Unspecified)"}
                  </p>
                </div>
                <div className="sm:text-right font-medium">
                  {d.localDate || d.dueAt ? (
                    <span className="text-primary">
                      {d.localDate || d.dueAt?.slice(0, 10)} {d.timezone ? `(${d.timezone})` : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not specified in platform data</span>
                  )}
                  <div>
                    <span
                      className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        d.isOpen ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {d.isOpen ? "Registration Open" : "Registration Closed"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Authoritative Recommendations */}
      {hasRecommendations && (
        <section aria-label="Authoritative Recommendations" className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Deterministic Recommendations (C15 Engine)
          </p>
          <div className="space-y-2">
            {facts.recommendations!.items.map((rec) => (
              <div key={rec.eventId} className="rounded-md border border-border bg-card p-3 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/events/${rec.slug}`} className="font-semibold text-sm hover:underline">
                    {rec.title}
                  </Link>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                      rec.tier === "best"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                    }`}
                  >
                    {rec.tier === "best" ? "Best Match" : "Worth Reviewing"}
                  </span>
                </div>
                {rec.score !== null && (
                  <p className="text-muted-foreground text-[11px]">
                    Match Score: {Math.round(rec.score * 100)}%
                  </p>
                )}
                {rec.matchFactors.length > 0 && (
                  <ul className="text-muted-foreground list-disc list-inside space-y-0.5">
                    {rec.matchFactors.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
