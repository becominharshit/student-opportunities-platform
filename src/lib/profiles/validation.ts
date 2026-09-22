export const sections = ["about", "education", "interests", "skills", "preferences", "links"] as const;
export type Section = typeof sections[number];
export const categories = { hackathon: "Hackathons", coding_competition: "Coding competitions", workshop: "Workshops", conference: "Conferences", student_technology_event: "Student technology events" };
export const modes = { online: "Online", offline: "Offline", hybrid: "Hybrid" };
export class ProfileInputError extends Error {}
const fail = (message: string): never => { throw new ProfileInputError(message); };
export function validProfileUrl(value: string) {
  if (value.length > 2048 || /[\s<>\\\u0000-\u001f\u007f]/.test(value) || !/^https?:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#].*)?$/.test(value)) return false;
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) && !!u.hostname && !u.username && !u.password; } catch { return false; }
}
export function parseProfileForm(form: URLSearchParams) {
  const section = form.get("section") as Section;
  if (!sections.includes(section)) fail("Choose a valid profile section.");
  const fields: Record<Section, string[]> = { about: ["name","city","country"], education: ["institution","degree","study_year"], interests: ["ids"], skills: ["ids"], preferences: ["preferred_categories","any_category","preferred_modes","willingness_to_travel","preferred_team_min","preferred_team_max"], links: ["portfolio_links"] };
  const multi = ["ids","preferred_categories","preferred_modes"];
  for (const key of form.keys()) if (!["section", ...fields[section]].includes(key) || (!multi.includes(key) && form.getAll(key).length !== 1)) fail("This form is invalid. Reload the page and try again.");
  const text = (key: string, max: number) => { const value = (form.get(key) ?? "").trim(); if (value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail("Text contains unsupported characters or is too long."); return value || null; };
  const number = (key: string, max: number) => { const value = text(key, 3); if (value === null) return null; if (!/^[1-9][0-9]*$/.test(value) || Number(value) > max) fail(`Use whole numbers from 1 to ${max}, or leave the field blank.`); return Number(value); };
  const boolean = (key: string) => { const value = text(key, 5); if (value === null) return null; if (!["true","false"].includes(value)) fail("Choose a listed preference or leave it unspecified."); return value === "true"; };
  const selection = (key: string, allowed?: string[]) => { const values = form.getAll(key); if (values.length > 30 || values.some(v => allowed ? !allowed.includes(v) : !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))) fail("Choose values from the available list."); return [...new Set(values)]; };
  let values: Record<string, string | number | boolean | null | string[]>;
  if (section === "about") { const country = text("country", 2)?.toUpperCase() ?? null; if (country !== null && !/^[A-Z]{2}$/.test(country)) fail("Use a two-letter country code, such as IN, or leave it blank."); values = { name: text("name",100), city: text("city",100), country }; }
  else if (section === "education") values = { institution: text("institution",200), degree: text("degree",100), study_year: number("study_year",20) };
  else if (section === "interests" || section === "skills") values = { ids: selection("ids") };
  else if (section === "preferences") {
    const cats = selection("preferred_categories",Object.keys(categories)), mode = selection("preferred_modes",Object.keys(modes));
    const any = boolean("any_category"), min = number("preferred_team_min",100), max = number("preferred_team_max",100);
    if (any === true && cats.length) fail("Choose either any category or specific categories, not both.");
    if (min !== null && max !== null && min > max) fail("Minimum team size must not exceed maximum team size.");
    values = { preferred_categories: cats.length ? cats : null, any_category: any, preferred_modes: mode.length ? mode : null, willingness_to_travel: boolean("willingness_to_travel"), preferred_team_min: min, preferred_team_max: max };
  } else {
    const links = (form.get("portfolio_links") ?? "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (links.length > 5 || links.some(v => !validProfileUrl(v))) fail("Use up to five HTTP or HTTPS links, one per line, without embedded credentials.");
    values = { portfolio_links: links.length ? [...new Set(links)] : null };
  }
  return { section, values };
}
export type ProfileFields = {
  name: string | null; city: string | null; country: string | null; institution: string | null; degree: string | null; study_year: number | null;
  preferred_categories: string[] | null; any_category: boolean | null; preferred_modes: string[] | null; willingness_to_travel: boolean | null;
  preferred_team_min: number | null; preferred_team_max: number | null; portfolio_links: string[] | null;
};
export function completeness(p: ProfileFields, interests: string[], skills: string[]) {
  const groups = [
    { name: "Basic information", complete: !!(p.name && p.city && p.country) },
    { name: "Education", complete: !!(p.institution && p.degree && p.study_year) },
    { name: "Interests", complete: interests.length > 0 },
    { name: "Skills", complete: skills.length > 0 },
    { name: "Preferences", complete: !!((p.any_category === true || p.preferred_categories?.length) && p.preferred_modes?.length && p.willingness_to_travel !== null && p.preferred_team_min !== null && p.preferred_team_max !== null) },
  ];
  return { groups, completed: groups.filter(g => g.complete).length, total: groups.length };
}
