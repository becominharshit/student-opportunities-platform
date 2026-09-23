export type SubmissionStatus =
  | "submitted"
  | "under_review"
  | "accepted"
  | "rejected"
  | "withdrawn";

export type SubmitterRelationship =
  | "organizer"
  | "participant"
  | "community_member"
  | "other";

export type RejectionReasonCode =
  | "duplicate"
  | "source_invalid"
  | "insufficient_information"
  | "not_relevant"
  | "expired_event"
  | "cannot_verify"
  | "spam_abuse"
  | "other";

export type DeadlinePrecision = "unknown" | "date_only" | "datetime";

export type EventMode = "online" | "offline" | "hybrid";

export type FeeStatus = "unknown" | "free" | "paid" | "varies";

export const SUBMITTER_RELATIONSHIP_LABELS: Record<SubmitterRelationship, string> = {
  organizer: "Event Organizer / Host",
  participant: "Student / Prospective Participant",
  community_member: "Community Member",
  other: "Other Relationship",
};

export const REJECTION_REASON_LABELS: Record<RejectionReasonCode, string> = {
  duplicate: "Duplicate Opportunity",
  source_invalid: "Invalid or Broken Source URL",
  insufficient_information: "Insufficient Information Provided",
  not_relevant: "Not a Student Technology Opportunity",
  expired_event: "Event or Deadline Has Already Passed",
  cannot_verify: "Unable to Independently Verify Legitimacy",
  spam_abuse: "Spam or Commercial Promotion",
  other: "Other Editorial Reason",
};

export interface SubmissionPayload {
  title: string;
  organizer_name: string;
  category_slug: string;
  mode: EventMode;
  submitter_relationship: SubmitterRelationship;
  official_url?: string | null;
  registration_url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  registration_deadline_precision?: DeadlinePrecision;
  registration_deadline_local_date?: string | null;
  registration_deadline_due_at?: string | null;
  registration_deadline_timezone?: string | null;
  venue?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  description?: string | null;
  eligibility_summary?: string | null;
  min_team_size?: number | null;
  max_team_size?: number | null;
  fee_status?: FeeStatus;
  fee_amount?: number | null;
  currency?: string | null;
  prize_description?: string | null;
  submitter_notes?: string | null;
}

export interface UserSubmissionItem {
  id: string;
  status: SubmissionStatus;
  submitterRelationship: SubmitterRelationship;
  title: string;
  organizerName: string;
  categorySlug: string;
  mode: EventMode;
  officialUrl: string | null;
  registrationUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  deadlinePrecision: DeadlinePrecision;
  deadlineLocalDate: string | null;
  deadlineDueAt: string | null;
  deadlineTimezone: string | null;
  venue: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  eligibilitySummary: string | null;
  minTeamSize: number | null;
  maxTeamSize: number | null;
  feeStatus: FeeStatus;
  feeAmount: number | null;
  currency: string | null;
  prizeDescription: string | null;
  submitterNotes: string | null;
  rejectionReasonCode: RejectionReasonCode | null;
  rejectionReasonDetails: string | null;
  publishedEventSlug: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSubmissionListItem {
  id: string;
  status: SubmissionStatus;
  title: string;
  organizer_name: string;
  category_slug: string;
  mode: EventMode;
  submitter_relationship: SubmitterRelationship;
  submitter_user_id: string | null;
  submitter_email: string | null;
  canonical_event_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AdminSubmissionDetail {
  submission: {
    id: string;
    submitter_user_id: string | null;
    status: SubmissionStatus;
    submitter_relationship: SubmitterRelationship;
    title: string;
    organizer_name: string;
    category_slug: string;
    mode: EventMode;
    official_url: string | null;
    registration_url: string | null;
    start_date: string | null;
    end_date: string | null;
    registration_deadline_precision: DeadlinePrecision;
    registration_deadline_local_date: string | null;
    registration_deadline_due_at: string | null;
    registration_deadline_timezone: string | null;
    venue: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    description: string | null;
    eligibility_summary: string | null;
    min_team_size: number | null;
    max_team_size: number | null;
    fee_status: FeeStatus;
    fee_amount: number | null;
    currency: string | null;
    prize_description: string | null;
    submitter_notes: string | null;
    rejection_reason_code: RejectionReasonCode | null;
    rejection_reason_details: string | null;
    version: number;
    created_at: string;
    updated_at: string;
    submitter_email: string | null;
  };
  moderation: {
    canonical_event_id: string | null;
    reviewed_by: string | null;
    reviewer_email: string | null;
    reviewed_at: string | null;
    internal_notes: string | null;
  };
  canonical_event: {
    id: string;
    title: string;
    slug: string;
    publication_status: string;
  } | null;
}

export interface SubmissionModerationEvent {
  id: string;
  submission_id: string;
  action: string;
  actor_id: string | null;
  actor_role: "submitter" | "admin";
  actor_email: string | null;
  from_status: SubmissionStatus | null;
  to_status: SubmissionStatus;
  public_notes: string | null;
  internal_notes: string | null;
  created_at: string;
}

export interface DuplicateCandidate {
  id: string;
  title: string;
  slug: string;
  publication_status: string;
  official_url: string | null;
  registration_url: string | null;
  match_reasons: string[];
}
