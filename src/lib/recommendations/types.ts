export type State = "eligible" | "ineligible" | "unknown";
export type Field = "student_status" | "degree" | "study_year" | "institution" | "participation_country" | "team_size";
export type StudentFacts = Record<Field, string | number | boolean | null>;
export type Explanation = { code: string; path: string; state: State; field?: Field; message: string };
export type RuleResult = { state: State; op: string; explanation: Explanation; children: RuleResult[] };
export type EligibilityResult = { state: State; tree: RuleResult; explanations: Explanation[] };
export type ProfileFacts = {
 degree: string | null; study_year: number | null; institution: string | null; city: string | null; country: string | null;
 interests: string[] | null; skills: string[] | null; preferred_categories: string[] | null; any_category: boolean | null;
 preferred_modes: string[] | null; willingness_to_travel: boolean | null; preferred_team_min: number | null; preferred_team_max: number | null;
};
export type EventFacts = {
 eligibility_rules: unknown; verification_status: string | null; last_checked_at: string | null;
 mode: string | null; city: string | null; country: string | null; category: string | null;
 individual_allowed: boolean | null; min_team_size: number | null; max_team_size: number | null;
 status: string | null; registration_status: string | null; tags: {kind:"domain"|"skill";tag:string;skill_id:string|null}[] | null;
};
export type ComponentKey = "eligibility" | "interests" | "skills" | "location" | "academic_year" | "category" | "team";
export type Component = { key: ComponentKey; weight: number; value: number | null; earned: number | null; code: string; message: string };
export type Recommendation = {
 version: "deterministic-v1"; eligibility: EligibilityResult; components: Component[];
 score: number | null; coverage: number; coverageLevel: "high"|"medium"|"low"; knownWeight: number; earnedWeight: number;
 recommendable: boolean; exclusions: string[]; message: string;
};
export type Personalization = { kind:"anonymous"|"unavailable"|"not_found" } | { kind:"ready"; result:Recommendation };
