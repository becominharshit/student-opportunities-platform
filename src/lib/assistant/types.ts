export type GroundingStatus = "grounded" | "partial" | "no_results" | "not_applicable";

export interface AssistantEventReference {
  id: string;
  slug: string;
  title: string;
  organizerName: string | null;
  categoryName: string | null;
  mode: string | null;
  datesSummary: string | null;
  deadlineSummary: string | null;
  registrationStatus: string | null;
  verificationLevel: string | null;
  officialUrl?: string | null;
  registrationUrl?: string | null;
}

export interface AuthoritativeEligibilityFact {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  state: "eligible" | "ineligible" | "unknown";
  reasons: string[];
  missingFacts: string[];
}

export interface AuthoritativeComparisonFact {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  category: string | null;
  mode: string | null;
  dates: string | null;
  deadline: string | null;
  fee: string | null;
  prize: string | null;
  eligibilityState?: "eligible" | "ineligible" | "unknown";
  verificationLevel: string | null;
}

export interface AuthoritativeDeadlineFact {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  deadlineKind: string;
  deadlineLabel: string;
  localDate: string | null;
  dueAt: string | null;
  timezone: string | null;
  precision: "date_only" | "datetime" | "unknown";
  isOpen: boolean;
}

export interface AuthoritativeRecommendationFact {
  tier: "all" | "best_matches" | "worth_reviewing";
  items: Array<{
    eventId: string;
    title: string;
    slug: string;
    tier: "best" | "review";
    score: number | null; // Null when evidence coverage is low or unknown
    matchFactors: string[];
  }>;
}

export interface AuthoritativeFacts {
  eligibility?: AuthoritativeEligibilityFact[];
  comparisons?: AuthoritativeComparisonFact[];
  deadlines?: AuthoritativeDeadlineFact[];
  recommendations?: AuthoritativeRecommendationFact;
}

export interface AssistantSuccessResponse {
  ok: true;
  answer: string;
  events: AssistantEventReference[];
  facts: AuthoritativeFacts;
  grounding: {
    status: GroundingStatus;
    toolsUsed: string[];
    notice?: string;
  };
}

export interface AssistantErrorResponse {
  ok: false;
  code: "unauthorized" | "rate_limited" | "invalid_payload" | "service_unavailable" | "provider_error";
  message: string;
  retryAfterSeconds?: number;
}

export type AssistantApiResponse = AssistantSuccessResponse | AssistantErrorResponse;

export interface ClientChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export interface ModelToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

export interface ModelGenerateOptions {
  messages: ModelMessage[];
  tools?: ModelToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface ModelGenerateResponse {
  content: string | null;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AssistantModel {
  generate(options: ModelGenerateOptions): Promise<ModelGenerateResponse>;
}
