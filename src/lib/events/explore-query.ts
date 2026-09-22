/** Single URL contract shared by the server page, form and pagination. */
export const choices = {
  category: ["hackathon", "coding_competition", "workshop", "conference", "student_technology_event"],
  mode: ["online", "offline", "hybrid", "unknown"],
  fee: ["free", "paid", "varies", "unknown"],
  prize: ["yes", "no", "unknown"],
  registration: ["not_open", "open", "closed", "unknown"],
  sort: ["relevance", "deadline", "event_date", "newest"],
} as const;
export const keys = ["q", "category", "domain", "mode", "city", "country", "date_from", "date_to", "deadline_from", "deadline_to", "fee", "team", "year", "degree", "prize", "registration", "sort"] as const;
export type FilterKey = typeof keys[number];
export type ExploreFilters = Partial<Record<FilterKey, string>> & { sort: string };
export type QueryInput = Record<string, string | string[] | undefined>;
const dateKeys = new Set(["date_from", "date_to", "deadline_from", "deadline_to"]);
export function parseExploreQuery(input: QueryInput) {
  const filters: ExploreFilters = { sort: "relevance" };
  const warnings: string[] = [];
  for (const key of keys) {
    const raw = input[key];
    if (raw === undefined || raw === "") continue;
    if (typeof raw !== "string") { warnings.push(key); continue; }
    let value = raw.trim();
    if (!value) continue;
    let valid = value.length <= (key === "q" ? 200 : 100) && !/[\u0000-\u001f\u007f]/.test(value);
    if (key in choices) valid &&= (choices[key as keyof typeof choices] as readonly string[]).includes(value);
    if (key === "country") { value = value.toUpperCase(); valid &&= /^[A-Z]{2}$/.test(value); }
    if (["team", "year"].includes(key)) valid &&= /^[1-9]\d{0,2}$/.test(value);
    if (dateKeys.has(key)) valid &&= /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01" && value <= "2200-12-31" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (valid) filters[key] = value; else warnings.push(key);
  }
  for (const [a, b] of [["date_from", "date_to"], ["deadline_from", "deadline_to"]] as const) {
    if (filters[a] && filters[b] && filters[a]! > filters[b]!) { delete filters[a]; delete filters[b]; warnings.push(a, b); }
  }
  for (const key of Object.keys(input)) if (key !== "after" && !keys.includes(key as FilterKey)) warnings.push("unsupported parameter");
  return { filters, warnings: [...new Set(warnings)], after: typeof input.after === "string" ? input.after : input.after === undefined ? undefined : "invalid" };
}
export function exploreUrl(filters: ExploreFilters, after?: string | null) {
  const params = new URLSearchParams();
  for (const key of keys) if (filters[key] && !(key === "sort" && filters[key] === "relevance")) params.set(key, filters[key]!);
  if (after) params.set("after", after);
  return "/explore" + (params.size ? "?" + params.toString() : "");
}
