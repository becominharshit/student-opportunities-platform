import { ResponsiveDisclosure } from "./ui/responsive-disclosure";
import type { SaveState } from "../lib/saves/policy";
import Link from "next/link";
import { DiscoveryShell, EventCard } from "./public-events";
import { choices, exploreUrl, type ExploreFilters, type FilterKey } from "@/lib/events/explore-query";
import type { PublicEventCard } from "@/lib/events/public";
const names: Record<FilterKey, string> = {
  q: "Search", category: "Category", domain: "Domain / topic", mode: "Participation mode", city: "City",
  country: "Country code", date_from: "Event starts on or after", date_to: "Event starts on or before",
  deadline_from: "Registration deadline on or after", deadline_to: "Registration deadline on or before",
  fee: "Fee", team: "Team size", year: "Listed study year", degree: "Listed degree / course",
  prize: "Prize availability", registration: "Registration status", sort: "Sort by",
};
const display = (value: string) => value.replaceAll("_", " ");
const control = "control mt-2";
export function SearchExploreContent({ filters, warnings, items, nextCursor, after, saveState, invalidCursor = false }: {
  filters: ExploreFilters; warnings: string[]; items: PublicEventCard[]; nextCursor: string | null; after?: string; invalidCursor?: boolean; saveState?:SaveState;
}) {
  const active = Object.entries(filters).filter(([key, value]) => value && !(key === "sort" && value === "relevance"));
  const constrained = active.some(([key]) => key !== "sort");
  function field(key: FilterKey) {
    const options = key in choices ? choices[key as keyof typeof choices] : undefined;
    const numeric = key === "team" || key === "year";
    return <div key={key} className="min-w-0 text-sm font-medium"><label htmlFor={key}>{names[key]}</label>
      {options ? <select id={key} name={key} defaultValue={filters[key] ?? ""} className={control}>
        {key !== "sort" && <option value="">Any</option>}
        {options.map(value => <option key={value} value={value}>{key === "prize" ? ({ yes: "Prize stated", no: "Explicit zero prize", unknown: "Not specified" } as Record<string, string>)[value] : display(value)}</option>)}
      </select> : <input id={key} name={key} defaultValue={filters[key] ?? ""} className={control}
        type={key.includes("_from") || key.includes("_to") ? "date" : numeric ? "number" : key === "q" ? "search" : "text"}
        min={numeric ? 1 : key.includes("_") ? "1900-01-01" : undefined}
        max={numeric ? 999 : key.includes("_") ? "2200-12-31" : undefined}
        maxLength={key === "q" ? 200 : key === "country" ? 2 : 100}
        placeholder={key === "country" ? "e.g. IN" : key === "domain" ? "e.g. robotics" : undefined} />}
    </div>;
  }
  return <DiscoveryShell authenticated={saveState?.kind==="ready"} activePath="/explore">
    <p className="eyebrow mb-3">The opportunity index</p><h1 className="page-title">Explore events</h1>
    <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">Search published student events. Filters describe recorded event information; they do not confirm your eligibility.</p>
    <form action="/explore" method="get" key={exploreUrl(filters)} className="discovery-toolbar">
      <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">{field("q")}<button className="primary-action">Search events</button></div>
      <ResponsiveDisclosure label={`Filters and sorting${active.length ? ` (${active.length} active)` : ""}`} className="filter-panel">
        {([
          ["Participation", ["category", "domain", "mode"]],
          ["Location", ["city", "country"]],
          ["Dates & deadlines", ["date_from", "date_to", "deadline_from", "deadline_to"]],
          ["Requirements & fees", ["fee", "team", "year", "degree"]],
          ["Availability & order", ["prize", "registration", "sort"]],
        ] as [string, FilterKey[]][]).map(([title, fields]) => <fieldset className="filter-group" key={title}><legend>{title}</legend><div className="filter-fields">{fields.map(field)}</div></fieldset>)}
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">Dates use each event’s local calendar day. Year and degree match only directly listed structured values, not complete eligibility rules. Missing values do not match known-value filters. “Explicit zero prize” excludes missing amounts and stated noncash prizes.</p>
        <button className="primary-action mt-5">Apply filters</button>
      </ResponsiveDisclosure>
    </form>
    {warnings.length > 0 && <p role="status" className="mt-4">Some unsupported or invalid query values were ignored. Review the filters below.</p>}
    <section aria-label="Active filters" className="query-state">
      <div className="results-heading"><h2 className="section-title">Results</h2>{!invalidCursor && <p role="status" className="text-sm text-muted-foreground">{items.length} opportunities on this page{nextCursor ? " · More results available" : ""}</p>}</div>
      <p className="query-order">Sorted by {display(filters.sort)}{filters.sort === "relevance" && !filters.q ? " · Catalogue order without a search term" : ""}</p>
      {active.length ? <><ul className="mt-2 flex flex-wrap gap-2">{active.map(([key, value]) => {
        const remaining = { ...filters }; if (key === "sort") remaining.sort = "relevance"; else delete remaining[key as FilterKey];
        return <li key={key} className="max-w-full"><Link href={exploreUrl(remaining)} className="filter-chip" aria-label={`Remove ${names[key as FilterKey]}: ${value}`}>{names[key as FilterKey]}: {display(value)} ×</Link></li>;
      })}</ul><Link href="/explore" className="inline-flex min-h-11 items-center text-sm underline">Clear all filters</Link></> : <p className="mt-2 text-sm text-muted-foreground">All published events</p>}
    </section>
    {invalidCursor ? <section className="empty-panel"><h2 className="text-2xl font-semibold">This page link is invalid or belongs to another search</h2><Link href={exploreUrl(filters)} className="mt-3 inline-flex min-h-11 items-center underline">Return to first results</Link></section> : <>
      {items.length ? <ul className="mt-4 grid gap-4 md:grid-cols-2">{items.map(event => <li key={event.id} className="min-w-0"><EventCard event={event} saveState={saveState} returnTo={exploreUrl(filters,after)} /></li>)}</ul> :
        <section className="empty-panel"><h2 className="text-2xl font-semibold">{after ? "No more results on this page" : constrained ? "No events match these filters" : "No published opportunities are available yet"}</h2><p className="mt-3">{constrained ? "Try fewer filters or another search term. Missing facts are not inferred." : "Events will appear after administrator review and publication."}</p></section>}
      <nav aria-label="Event pages" className="mt-8 flex flex-wrap justify-between gap-4">
        {after && <Link href={exploreUrl(filters)} className="inline-flex min-h-11 items-center underline">Back to first page</Link>}
        {nextCursor && <Link href={exploreUrl(filters, nextCursor)} rel="next" className="ml-auto inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-3 text-primary-foreground">Next opportunities →</Link>}
      </nav>
    </>}
  </DiscoveryShell>;
}
