"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { SubmissionPayload } from "@/lib/submissions/types";

interface SubmissionFormProps {
  initialData?: Partial<SubmissionPayload> & { id?: string; version?: number };
  isEdit?: boolean;
}

export function SubmissionForm({ initialData, isEdit = false }: SubmissionFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form state
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [organizerName, setOrganizerName] = useState(initialData?.organizer_name ?? "");
  const [relationship, setRelationship] = useState(initialData?.submitter_relationship ?? "community_member");
  const [categorySlug, setCategorySlug] = useState(initialData?.category_slug ?? "hackathon");
  const [mode, setMode] = useState(initialData?.mode ?? "online");
  const [officialUrl, setOfficialUrl] = useState(initialData?.official_url ?? "");
  const [registrationUrl, setRegistrationUrl] = useState(initialData?.registration_url ?? "");
  const [startDate, setStartDate] = useState(initialData?.start_date ?? "");
  const [endDate, setEndDate] = useState(initialData?.end_date ?? "");

  // Deadline precision
  const [deadlinePrecision, setDeadlinePrecision] = useState(initialData?.registration_deadline_precision ?? "unknown");
  const [deadlineLocalDate, setDeadlineLocalDate] = useState(initialData?.registration_deadline_local_date ?? "");
  const [deadlineDueAt, setDeadlineDueAt] = useState(initialData?.registration_deadline_due_at ? initialData.registration_deadline_due_at.slice(0, 16) : "");
  const [deadlineTimezone, setDeadlineTimezone] = useState(initialData?.registration_deadline_timezone ?? "");

  // Location
  const [venue, setVenue] = useState(initialData?.venue ?? "");
  const [city, setCity] = useState(initialData?.city ?? "");
  const [state, setState] = useState(initialData?.state ?? "");
  const [country, setCountry] = useState(initialData?.country ?? "");

  // Details
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [eligibilitySummary, setEligibilitySummary] = useState(initialData?.eligibility_summary ?? "");
  const [minTeamSize, setMinTeamSize] = useState(initialData?.min_team_size ? String(initialData.min_team_size) : "");
  const [maxTeamSize, setMaxTeamSize] = useState(initialData?.max_team_size ? String(initialData.max_team_size) : "");

  // Fee
  const [feeStatus, setFeeStatus] = useState(initialData?.fee_status ?? "unknown");
  const [feeAmount, setFeeAmount] = useState(initialData?.fee_amount ? String(initialData.fee_amount) : "");
  const [currency, setCurrency] = useState(initialData?.currency ?? "");

  // Notes
  const [prizeDescription, setPrizeDescription] = useState(initialData?.prize_description ?? "");
  const [submitterNotes, setSubmitterNotes] = useState(initialData?.submitter_notes ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setFieldErrors({});

    // Client-side quick checks
    const errors: Record<string, string> = {};
    if (!title.trim() || title.trim().length < 3) {
      errors.title = "Title must be at least 3 characters.";
    }
    if (!organizerName.trim() || organizerName.trim().length < 2) {
      errors.organizer_name = "Organizer name must be at least 2 characters.";
    }
    if (!officialUrl.trim() && !registrationUrl.trim()) {
      errors.official_url = "At least one source URL (official website or registration page) is required.";
    }
    if (startDate && endDate && startDate > endDate) {
      errors.end_date = "End date cannot precede start date.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsSubmitting(false);
      return;
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      organizer_name: organizerName.trim(),
      submitter_relationship: relationship,
      category_slug: categorySlug,
      mode,
      official_url: officialUrl.trim() || null,
      registration_url: registrationUrl.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      registration_deadline_precision: deadlinePrecision,
      registration_deadline_local_date: deadlinePrecision === "date_only" ? (deadlineLocalDate || null) : null,
      registration_deadline_due_at: deadlinePrecision === "datetime" && deadlineDueAt ? new Date(deadlineDueAt).toISOString() : null,
      registration_deadline_timezone: deadlinePrecision === "datetime" ? (deadlineTimezone.trim() || null) : null,
      venue: venue.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      country: country.trim().toUpperCase() || null,
      description: description.trim() || null,
      eligibility_summary: eligibilitySummary.trim() || null,
      min_team_size: minTeamSize ? Number(minTeamSize) : null,
      max_team_size: maxTeamSize ? Number(maxTeamSize) : null,
      fee_status: feeStatus,
      fee_amount: feeAmount ? Number(feeAmount) : null,
      currency: currency.trim().toUpperCase() || null,
      prize_description: prizeDescription.trim() || null,
      submitter_notes: submitterNotes.trim() || null,
    };

    try {
      let res: Response;
      if (isEdit && initialData?.id) {
        res = await fetch(`/api/submissions/${initialData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected_version: initialData.version ?? 1,
            patch: payload,
          }),
        });
      } else {
        res = await fetch("/api/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (json.issues && Array.isArray(json.issues)) {
          const map: Record<string, string> = {};
          for (const iss of json.issues) {
            map[iss.field] = iss.message;
          }
          setFieldErrors(map);
        }
        setErrorMessage(json.message || "Failed to submit opportunity. Please check the values below.");
        setIsSubmitting(false);
        return;
      }

      router.push("/account/submissions?submitted=1");
    } catch {
      setErrorMessage("Network error occurred. Please check your connection and retry.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8 max-w-2xl">
      <div className="bg-muted/40 p-4 rounded-md border border-border text-sm leading-relaxed">
        <p className="font-semibold text-foreground">Community Submission Notice</p>
        <p className="mt-1 text-muted-foreground">
          Thank you for sharing an opportunity with students. Submissions are private and reviewed by administrators before being published. Optional fields may be left blank if unknown.
        </p>
      </div>

      {errorMessage && (
        <div role="alert" className="p-4 rounded-md bg-destructive/10 border border-destructive text-destructive text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {/* Basic Event Facts */}
      <fieldset className="space-y-4 border-t border-border pt-6">
        <legend className="text-lg font-semibold tracking-tight text-foreground">Event Information</legend>

        <div>
          <label htmlFor="sub-title" className="block text-sm font-medium text-foreground">
            Opportunity Title <span className="text-destructive">*</span>
          </label>
          <input
            id="sub-title"
            type="text"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. HackMIT 2026 or ACM Summer Coding Challenge"
          />
          {fieldErrors.title && <p className="mt-1 text-xs text-destructive">{fieldErrors.title}</p>}
        </div>

        <div>
          <label htmlFor="sub-org" className="block text-sm font-medium text-foreground">
            Organizer / Organization <span className="text-destructive">*</span>
          </label>
          <input
            id="sub-org"
            type="text"
            required
            maxLength={150}
            value={organizerName}
            onChange={(e) => setOrganizerName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. MIT Tech Club or FOSS Foundation"
          />
          {fieldErrors.organizer_name && <p className="mt-1 text-xs text-destructive">{fieldErrors.organizer_name}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sub-rel" className="block text-sm font-medium text-foreground">
              Your Relationship <span className="text-destructive">*</span>
            </label>
            <select
              id="sub-rel"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as typeof relationship)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="community_member">Community Member</option>
              <option value="organizer">Event Organizer / Host</option>
              <option value="participant">Student / Participant</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="sub-category" className="block text-sm font-medium text-foreground">
              Category <span className="text-destructive">*</span>
            </label>
            <select
              id="sub-category"
              value={categorySlug}
              onChange={(e) => setCategorySlug(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="hackathon">Hackathon</option>
              <option value="coding_competition">Coding Competition</option>
              <option value="workshop">Workshop</option>
              <option value="conference">Conference</option>
              <option value="student_technology_event">Student Technology Event</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="sub-mode" className="block text-sm font-medium text-foreground">
            Mode <span className="text-destructive">*</span>
          </label>
          <select
            id="sub-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="online">Online (Virtual)</option>
            <option value="offline">In-person (Physical venue)</option>
            <option value="hybrid">Hybrid (Both options available)</option>
          </select>
        </div>
      </fieldset>

      {/* Source Links */}
      <fieldset className="space-y-4 border-t border-border pt-6">
        <legend className="text-lg font-semibold tracking-tight text-foreground">Source & Registration Links</legend>
        <p className="text-xs text-muted-foreground">Provide at least one verifiable public link.</p>

        <div>
          <label htmlFor="sub-official-url" className="block text-sm font-medium text-foreground">
            Official Event Website
          </label>
          <input
            id="sub-official-url"
            type="url"
            maxLength={2048}
            value={officialUrl}
            onChange={(e) => setOfficialUrl(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="https://example.org/event"
          />
          {fieldErrors.official_url && <p className="mt-1 text-xs text-destructive">{fieldErrors.official_url}</p>}
        </div>

        <div>
          <label htmlFor="sub-reg-url" className="block text-sm font-medium text-foreground">
            Direct Registration Link (if known)
          </label>
          <input
            id="sub-reg-url"
            type="url"
            maxLength={2048}
            value={registrationUrl}
            onChange={(e) => setRegistrationUrl(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="https://example.org/register"
          />
          {fieldErrors.registration_url && <p className="mt-1 text-xs text-destructive">{fieldErrors.registration_url}</p>}
        </div>
      </fieldset>

      {/* Dates & Deadlines */}
      <fieldset className="space-y-4 border-t border-border pt-6">
        <legend className="text-lg font-semibold tracking-tight text-foreground">Dates & Deadlines</legend>
        <p className="text-xs text-muted-foreground">Leave empty if unknown. Do not guess exact timestamps.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sub-start-date" className="block text-sm font-medium text-foreground">
              Event Start Date
            </label>
            <input
              id="sub-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="sub-end-date" className="block text-sm font-medium text-foreground">
              Event End Date
            </label>
            <input
              id="sub-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {fieldErrors.end_date && <p className="mt-1 text-xs text-destructive">{fieldErrors.end_date}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="sub-deadline-precision" className="block text-sm font-medium text-foreground">
            Registration Deadline Format
          </label>
          <select
            id="sub-deadline-precision"
            value={deadlinePrecision}
            onChange={(e) => setDeadlinePrecision(e.target.value as typeof deadlinePrecision)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="unknown">Unknown or not specified</option>
            <option value="date_only">Date only (no specific time of day)</option>
            <option value="datetime">Specific date and time</option>
          </select>
        </div>

        {deadlinePrecision === "date_only" && (
          <div>
            <label htmlFor="sub-deadline-date" className="block text-sm font-medium text-foreground">
              Registration Closing Date
            </label>
            <input
              id="sub-deadline-date"
              type="date"
              value={deadlineLocalDate}
              onChange={(e) => setDeadlineLocalDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {fieldErrors.registration_deadline_local_date && (
              <p className="mt-1 text-xs text-destructive">{fieldErrors.registration_deadline_local_date}</p>
            )}
          </div>
        )}

        {deadlinePrecision === "datetime" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sub-deadline-time" className="block text-sm font-medium text-foreground">
                Closing Date & Time
              </label>
              <input
                id="sub-deadline-time"
                type="datetime-local"
                value={deadlineDueAt}
                onChange={(e) => setDeadlineDueAt(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {fieldErrors.registration_deadline_due_at && (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.registration_deadline_due_at}</p>
              )}
            </div>

            <div>
              <label htmlFor="sub-deadline-tz" className="block text-sm font-medium text-foreground">
                Timezone (IANA Name)
              </label>
              <input
                id="sub-deadline-tz"
                type="text"
                placeholder="e.g. Asia/Kolkata or UTC"
                value={deadlineTimezone}
                onChange={(e) => setDeadlineTimezone(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {fieldErrors.registration_deadline_timezone && (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.registration_deadline_timezone}</p>
              )}
            </div>
          </div>
        )}
      </fieldset>

      {/* Location (for in-person/hybrid) */}
      {(mode === "offline" || mode === "hybrid") && (
        <fieldset className="space-y-4 border-t border-border pt-6">
          <legend className="text-lg font-semibold tracking-tight text-foreground">Physical Location</legend>

          <div>
            <label htmlFor="sub-venue" className="block text-sm font-medium text-foreground">
              Venue / Campus
            </label>
            <input
              id="sub-venue"
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. Main Auditorium, Building 4"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="sub-city" className="block text-sm font-medium text-foreground">
                City
              </label>
              <input
                id="sub-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="sub-state" className="block text-sm font-medium text-foreground">
                State / Province
              </label>
              <input
                id="sub-state"
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="sub-country" className="block text-sm font-medium text-foreground">
                Country (2-letter ISO)
              </label>
              <input
                id="sub-country"
                type="text"
                maxLength={2}
                placeholder="e.g. IN or US"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary uppercase"
              />
              {fieldErrors.country && <p className="mt-1 text-xs text-destructive">{fieldErrors.country}</p>}
            </div>
          </div>
        </fieldset>
      )}

      {/* Description & Requirements */}
      <fieldset className="space-y-4 border-t border-border pt-6">
        <legend className="text-lg font-semibold tracking-tight text-foreground">Description & Eligibility</legend>

        <div>
          <label htmlFor="sub-desc" className="block text-sm font-medium text-foreground">
            Event Summary / Overview
          </label>
          <textarea
            id="sub-desc"
            rows={4}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Briefly describe what this event is about, activities, topics covered, etc."
          />
        </div>

        <div>
          <label htmlFor="sub-eligibility" className="block text-sm font-medium text-foreground">
            Eligibility Information (Text as shown on official page)
          </label>
          <textarea
            id="sub-eligibility"
            rows={3}
            maxLength={3000}
            value={eligibilitySummary}
            onChange={(e) => setEligibilitySummary(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. Open to undergraduate students worldwide. Must be currently enrolled."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sub-min-team" className="block text-sm font-medium text-foreground">
              Min Team Size (optional)
            </label>
            <input
              id="sub-min-team"
              type="number"
              min={1}
              value={minTeamSize}
              onChange={(e) => setMinTeamSize(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="sub-max-team" className="block text-sm font-medium text-foreground">
              Max Team Size (optional)
            </label>
            <input
              id="sub-max-team"
              type="number"
              min={1}
              value={maxTeamSize}
              onChange={(e) => setMaxTeamSize(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {fieldErrors.max_team_size && <p className="mt-1 text-xs text-destructive">{fieldErrors.max_team_size}</p>}
          </div>
        </div>
      </fieldset>

      {/* Fee & Prizes */}
      <fieldset className="space-y-4 border-t border-border pt-6">
        <legend className="text-lg font-semibold tracking-tight text-foreground">Fees & Prizes</legend>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="sub-fee-status" className="block text-sm font-medium text-foreground">
              Registration Fee
            </label>
            <select
              id="sub-fee-status"
              value={feeStatus}
              onChange={(e) => setFeeStatus(e.target.value as typeof feeStatus)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="unknown">Unknown</option>
              <option value="free">Free of charge</option>
              <option value="paid">Paid registration</option>
              <option value="varies">Varies by participant</option>
            </select>
          </div>

          {feeStatus === "paid" && (
            <>
              <div>
                <label htmlFor="sub-fee-amount" className="block text-sm font-medium text-foreground">
                  Fee Amount
                </label>
                <input
                  id="sub-fee-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label htmlFor="sub-currency" className="block text-sm font-medium text-foreground">
                  Currency (ISO)
                </label>
                <input
                  id="sub-currency"
                  type="text"
                  maxLength={3}
                  placeholder="e.g. INR or USD"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary uppercase"
                />
                {fieldErrors.currency && <p className="mt-1 text-xs text-destructive">{fieldErrors.currency}</p>}
              </div>
            </>
          )}
        </div>

        <div>
          <label htmlFor="sub-prize" className="block text-sm font-medium text-foreground">
            Prizes or Awards (optional)
          </label>
          <input
            id="sub-prize"
            type="text"
            maxLength={1000}
            value={prizeDescription}
            onChange={(e) => setPrizeDescription(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. Certificates, swag, or cash prize pool"
          />
        </div>

        <div>
          <label htmlFor="sub-notes" className="block text-sm font-medium text-foreground">
            Notes for the Review Team (optional)
          </label>
          <textarea
            id="sub-notes"
            rows={2}
            maxLength={2000}
            value={submitterNotes}
            onChange={(e) => setSubmitterNotes(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Any context, schedule links, or details that will help our team verify this event."
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : isEdit ? "Save Changes" : "Submit Opportunity for Review"}
        </Button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
