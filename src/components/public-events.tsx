import { ResponsiveDisclosure } from "./ui/responsive-disclosure";
import { SaveControl } from "./save-control";
import { EventCalendarSection, EventCardCalendarActions } from "./calendar-actions";
import type { SaveState } from "../lib/saves/policy";
import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicEvent, PublicEventCard } from "@/lib/events/public";
import { dateFact, feeLabel, label, prizeLabel, publicHttps, teamLabel, trustLabel } from "@/lib/events/presentation";

export function DiscoveryShell({ children, authenticated=false, unreadCount=0, activePath }: { children: ReactNode; authenticated?:boolean; unreadCount?: number; activePath?: string }) {
  const links = [["/explore", "Explore"], ["/for-you", "For You"], ["/saved", "Saved"], ["/assistant", "Assistant"], ["/notifications", "Notifications"], ["/submit-event", "Submit Opportunity"], ["/account", "Account"]];
  const navigation = <>{links.map(([href, text]) => <Link key={href} href={href} aria-current={activePath === href ? "page" : undefined} className="nav-link">{text}{href === "/notifications" && unreadCount > 0 && <span aria-label={`${unreadCount} unread notifications`} className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}</Link>)}{!authenticated && <Link href="/login" className="nav-sign-in">Sign in</Link>}</>;
  return <div className="student-shell"><header className="site-header"><div className="site-container header-inner"><Link href="/" className="wordmark"><span className="brand-mark" aria-hidden="true">s/o</span><span>Student<br className="brand-break"/> Opportunities<span className="brand-period">.</span></span></Link><nav aria-label="Main" className="desktop-nav">{navigation}</nav><ResponsiveDisclosure label="Menu" className="mobile-navigation"><nav aria-label="Mobile main" className="mobile-nav-links">{navigation}</nav></ResponsiveDisclosure></div></header><main id="main-content" className="site-container discovery-main">{children}</main><footer className="site-footer"><div className="site-container footer-inner"><p className="max-w-xl">Find your next opportunity. Check the official rules before applying.<span className="block mt-1">Registration takes place on the organizer’s website.</span></p><Link href="/submit-event" className="action-link">Submit an opportunity <span aria-hidden="true">↗</span></Link></div></footer></div>;
}
export function FactDate({ date, instant = null, timezone = null }: { date: string | null; instant?: string | null; timezone?: string | null }) {
  const fact = dateFact(date, instant, timezone);
  return <>{fact.dateTime ? <time dateTime={fact.dateTime}>{fact.text}</time> : fact.text}{fact.note && <span className="block text-sm text-muted-foreground">{fact.note}</span>}</>;
}
function EventDates({ event }: { event: PublicEventCard | PublicEvent }) {
  if (!event.start_date && !event.start_at && !event.end_date && !event.end_at) return <>Event dates not specified</>;
  return <>{(event.start_date || event.start_at) && <div>Starts: <FactDate date={event.start_date} instant={event.date_precision === "datetime" ? event.start_at : null} timezone={event.timezone} /></div>}{(event.end_date || event.end_at) && <div className="mt-1">Ends: <FactDate date={event.end_date} instant={event.date_precision === "datetime" ? event.end_at : null} timezone={event.timezone} /></div>}</>;
}
function Deadline({ event }: { event: PublicEventCard | PublicEvent }) {
  const deadline = event.event_deadlines.find(d => d.active && d.is_primary && d.kind === "registration");
  return deadline ? <FactDate date={deadline.local_date} instant={deadline.precision === "datetime" ? deadline.due_at : null} timezone={deadline.timezone} /> : <>Registration deadline not specified</>;
}
function Location({ event }: { event: PublicEventCard | PublicEvent }) {
  return <>{[event.venue, event.city, event.state, event.country].filter(Boolean).join(", ") || "Location not specified"}</>;
}
function Checked({ at }: { at: string | null }) {
  return at ? <>Last checked: <FactDate date={null} instant={at} timezone="UTC" /></> : <>Last checked time not available</>;
}
function Field({ name, children }: { name: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-sm text-muted-foreground">{name}</dt><dd className="mt-1 break-words">{children}</dd></div>;
}
export function EventCard({ event, headingLevel=2, saveState, returnTo, showCalendarActions = false }: { event: PublicEventCard; headingLevel?:2|3; saveState?:SaveState; returnTo?:string; showCalendarActions?: boolean }) {
  const Heading=headingLevel===3?"h3":"h2";
  return <article className="event-card">
    <p className="eyebrow">{event.event_categories?.name ?? "Category not specified"} · {label(event.mode, "Mode not specified")}</p>
    <Heading className="card-title mt-3"><Link href={`/events/${event.slug}`} className="event-title-link">{event.title}</Link></Heading>
    <p className="mt-2 text-sm text-muted-foreground">{event.organizers?.name ?? "Organizer not specified"}</p>
    {event.short_description && <p className="card-summary">{event.short_description}</p>}
    <dl className="event-card-facts"><Field name="Registration deadline"><Deadline event={event} /></Field><Field name="Event dates"><EventDates event={event} /></Field><Field name="Location"><Location event={event} /></Field><Field name="Status">{label(event.status, "Event status unknown")} · Registration: {label(event.registration_status, "Unknown")}</Field></dl>
    <div className="card-provenance"><span>{trustLabel(event)}</span><span><Checked at={event.last_checked_at} /></span></div>
    <div className="card-actions"><Link href={`/events/${event.slug}`} className="card-discovery">View event <span aria-hidden="true">→</span></Link><SaveControl eventId={event.id} state={saveState} returnTo={returnTo??`/events/${event.slug}`}/></div>
    {showCalendarActions && <EventCardCalendarActions event={event} />}
  </article>;
}
export function ExploreContent({ items, nextCursor, after }: { items: PublicEventCard[]; nextCursor: string | null; after?: string }) {
  return <DiscoveryShell activePath="/explore"><p className="text-sm font-semibold uppercase tracking-widest text-primary">The opportunity index</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Explore events</h1><p className="mt-5 max-w-2xl text-lg text-muted-foreground">Discover student technology events. Review the dates, requirements and sources, then apply through the official website.</p>
    <p className="mt-8 text-sm text-muted-foreground">Stable catalogue order · Up to 24 opportunities per page</p>
    {items.length ? <ul className="mt-6 grid gap-x-10 gap-y-4 md:grid-cols-2">{items.map(event => <li key={event.id} className="min-w-0"><EventCard event={event} /></li>)}</ul> : <section className="my-10 border-y border-border py-12"><h2 className="text-2xl font-semibold">{after ? "You’ve reached the end of this page." : "No published opportunities are available yet."}</h2><p className="mt-3 max-w-xl text-muted-foreground">{after ? "The catalogue may have changed. Return to the first page to browse current opportunities." : "Opportunities will appear here after review. Check back for event details and official registration links."}</p></section>}
    {(after || nextCursor) && <nav aria-label="Event pages" className="mt-8 flex flex-wrap justify-between gap-6 border-t border-border pt-6">{after && <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/explore">Back to first page</Link>}{nextCursor && <Link className="ml-auto inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground" href={`/explore?after=${encodeURIComponent(nextCursor)}`} rel="next">Next opportunities →</Link>}</nav>}
  </DiscoveryShell>;
}
function ExternalLink({ url, children, primary = false }: { url: string | null; children: ReactNode; primary?: boolean }) {
  const safe = publicHttps(url);
  if (!safe) return null;
  return <a href={safe} target="_blank" rel="noopener noreferrer" className={primary ? "primary-action" : "action-link"}>{children}<span className="ml-2" aria-hidden="true">↗</span><span className="sr-only"> (external website, opens in new tab)</span></a>;
}
export function EventDetailContent({ event, personalization, saveState }: { event: PublicEvent; personalization?: ReactNode; saveState?:SaveState }) {
  const deadlines = event.event_deadlines.filter(d => d.active).toSorted((a, b) => (a.local_date ?? a.due_at?.slice(0, 10) ?? "9999").localeCompare(b.local_date ?? b.due_at?.slice(0, 10) ?? "9999") || a.id.localeCompare(b.id));
  const registrationOpen = event.registration_status === "open" && !["cancelled", "completed"].includes(event.status);
  return <DiscoveryShell activePath="/explore"><Link href="/explore" className="underline underline-offset-4">← Explore all events</Link>
    <div className="detail-grid"><div className="detail-intro"><header className="detail-heading"><p className="text-sm font-semibold text-primary">{event.event_categories?.name ?? "Category not specified"} · {label(event.mode, "Mode not specified")}</p><h1 className="page-title mt-3">{event.title}</h1><p className="mt-4 text-lg text-muted-foreground">By {event.organizers?.name ?? "organizer not specified"}</p><p className="mt-5 max-w-2xl whitespace-pre-line break-words text-lg leading-relaxed text-muted-foreground">{event.short_description ?? "Summary not provided"}</p><div className="detail-provenance"><span>{trustLabel(event)}</span><span><Checked at={event.last_checked_at} /></span></div></header>
    <div className="detail-actions flex flex-wrap items-center gap-x-6"><SaveControl eventId={event.id} state={saveState} returnTo={`/events/${event.slug}`}/><a href="#participation-heading" className="action-link mt-4">Review eligibility ↓</a></div></div>
    <aside aria-label="Official registration" className="detail-rail"><p className="eyebrow mb-3">Plan your participation</p><h2 className="section-title">Visit the organizer</h2><p className="mt-4 text-sm font-semibold">Registration deadline</p><p className="mt-1"><Deadline event={event} /></p><p className="mt-4 text-sm">Registration: {label(event.registration_status, "status unknown")}</p><div className="mt-5 flex flex-col gap-3"><ExternalLink url={event.registration_url} primary>{registrationOpen ? "Register on official website" : "View official registration page"}</ExternalLink><ExternalLink url={event.official_url}>Official event website</ExternalLink></div><dl className="grid gap-4 mt-5 text-sm"><Field name="Event dates"><EventDates event={event} /></Field><Field name="Mode & location">{label(event.mode, "Mode not specified")}<div><Location event={event}/></div></Field></dl><EventCalendarSection event={event} /><p className="mt-4 text-sm text-muted-foreground">These links leave Student Opportunities and open in a new tab. Registration is handled by the organizer.</p></aside><div className="detail-sections">
      <section aria-labelledby="details-heading"><h2 id="details-heading" className="text-2xl font-semibold">Event details</h2><dl className="detail-facts"><Field name="Event status">{label(event.status, "Unknown")}</Field><Field name="Registration status">{label(event.registration_status, "Unknown")}</Field></dl>{event.full_description && <p className="mt-6 whitespace-pre-line break-words leading-relaxed">{event.full_description}</p>}</section>
      {personalization}
      <section aria-labelledby="participation-heading"><h2 id="participation-heading" className="text-2xl font-semibold">Participation & eligibility</h2><p className="mt-4 whitespace-pre-line break-words leading-relaxed">{event.eligibility_text ?? "Eligibility requirements not specified. Confirm the rules with the organizer."}</p><dl className="detail-facts"><Field name="Team size">{teamLabel(event)}</Field><Field name="Individual participation">{event.individual_allowed === null ? "Not specified" : event.individual_allowed ? "Allowed" : "Not allowed"}</Field><Field name="Fee">{feeLabel(event)}</Field><Field name="Prizes">{prizeLabel(event)}{event.prize_description && <p className="mt-2 whitespace-pre-line">{event.prize_description}</p>}</Field></dl><h3 className="mt-6 font-semibold">How to participate</h3><p className="mt-2 whitespace-pre-line break-words">{event.participation_process ?? "Participation process not specified. Refer to the official website."}</p></section>
      <section aria-labelledby="timeline-heading"><h2 id="timeline-heading" className="text-2xl font-semibold">Timeline & deadlines</h2>{deadlines.length ? <ol className="mt-5 space-y-6 border-l-2 border-border pl-5">{deadlines.map(d => <li key={d.id}><h3 className="font-semibold">{d.label}</h3><p className="text-sm text-muted-foreground">{label(d.kind)}{d.is_primary ? " · Primary deadline" : ""}</p><p className="mt-1"><FactDate date={d.local_date} instant={d.precision === "datetime" ? d.due_at : null} timezone={d.timezone} /></p></li>)}</ol> : <p className="mt-4 text-muted-foreground">Stages and deadlines not specified.</p>}</section>
      {event.event_tags.length > 0 && <section aria-labelledby="tags-heading"><h2 id="tags-heading" className="text-2xl font-semibold">Topics & skills</h2><ul className="mt-4 flex flex-wrap gap-2">{event.event_tags.map(t => <li key={`${t.kind}:${t.tag}`} className="rounded-md border border-border px-3 py-2 text-sm">{t.tag} <span className="text-muted-foreground">({t.kind})</span></li>)}</ul></section>}
      <section aria-labelledby="sources-heading"><h2 id="sources-heading" className="text-2xl font-semibold">Sources</h2><p className="mt-3 text-sm text-muted-foreground">A trust label does not fill in missing facts. Refer to the source for current rules. Source links open external websites in a new tab.</p>{event.sources.length ? <ul className="mt-4 space-y-4">{event.sources.map(s => <li key={s.id}><ExternalLink url={s.source_url}>{s.source_name ?? "Event source"}</ExternalLink><p className="text-xs text-muted-foreground"><Checked at={s.last_checked_at} /></p></li>)}</ul> : <p className="mt-3">Source attribution not available.</p>}</section>
    </div></div>
  </DiscoveryShell>;
}
