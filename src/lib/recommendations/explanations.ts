import "server-only";
import type { Field, State, Explanation } from "./types";
const labels: Record<Field,string> = {student_status:"student status",degree:"degree/course",study_year:"study year",institution:"institution",participation_country:"participation country",team_size:"actual team size"};
export function explain(state: State, code: string, path: string, field?: Field): Explanation {
 const label=field ? labels[field] : "requirement";
 const messages: Record<string,string> = {
  missing_rules:"Structured eligibility rules are not available. Freeform text alone does not establish eligibility.",
  invalid_rules:"The structured eligibility data cannot be evaluated safely. Confirm the official rules.",
  stale_evidence:"Eligibility evidence is missing, stale or conflicting. Confirm the current official rules.",
  unresolved:"A restriction remains unresolved. Confirm it with the organizer.",
  missing_fact:field === "team_size" ? "Your actual team size is not recorded. A team preference does not prove a team exists." : field === "student_status" ? "Student status is not explicitly recorded. Education details do not establish this requirement." : `Add or confirm your ${label} to evaluate this requirement.`,
  unrestricted:`The structured rules explicitly place no restriction on ${label}.`,
  pass:`Your recorded ${label} satisfies this structured requirement.`,
  fail:`Your recorded ${label} does not satisfy this structured requirement.`,
  all:"All listed requirements must be satisfied.",
  any:"At least one listed alternative must be satisfied; a failed alternative is not by itself disqualifying.",
  malformed:"Some event or profile data cannot be evaluated safely. No match score is available.",
 };
 return {state,code,path,...(field ? {field} : {}),message:messages[code] ?? "This requirement needs confirmation."};
}
