import Link from "next/link";
import { DiscoveryShell } from "@/components/public-events";

export default function Home() {
  return <DiscoveryShell activePath="/">
    <section className="home-hero" aria-labelledby="home-title">
      <div>
        <p className="eyebrow mb-5">A clearer path to what’s next</p>
        <h1 id="home-title">Find an opportunity.<br/><span>Make it your next step.</span></h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">Hackathons, workshops and student technology events. Discover what interests you, understand the requirements, and build your shortlist.</p>
        <form action="/explore" method="get" className="home-search">
          <div><label htmlFor="home-search" className="sr-only">Search opportunities</label><input id="home-search" name="q" type="search" maxLength={200} className="control" placeholder="Search events, topics or organizers"/></div>
          <button className="primary-action" type="submit">Explore events <span aria-hidden="true">→</span></button>
        </form>
        <p className="mt-3 text-sm text-muted-foreground">Explore freely. Create an account to save your shortlist.</p>
      </div>
      <aside className="home-index" aria-label="Your opportunity toolkit">
        <p className="eyebrow">From discovery to a decision</p>
        <ol><li><span className="index-number">01</span><div><h2 className="text-xl font-semibold">Find your direction</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Search by topic, participation mode and the dates that work for you.</p></div></li><li><span className="index-number">02</span><div><h2 className="text-xl font-semibold">Read the details</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">See requirements, deadlines and sources. Missing information stays visible.</p></div></li><li><span className="index-number">03</span><div><h2 className="text-xl font-semibold">Take the next step</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Save an opportunity, check the official rules and apply with the organizer.</p></div></li></ol>
      </aside>
    </section>
    <section className="home-section" aria-labelledby="tools-heading"><p className="eyebrow mb-3">Built around your decisions</p><h2 id="tools-heading" className="section-title">Less searching around. More understanding.</h2><div className="home-feature-grid">
      <article><h3>A focused opportunity index</h3><p>Browse published opportunities with dates, participation details and source links in one place.</p><Link href="/explore" className="action-link mt-3">Browse the catalogue →</Link></article>
      <article><h3>A shortlist you can return to</h3><p>Keep saved opportunities together and export available event dates to your calendar.</p><Link href="/saved" className="action-link mt-3">Open your shortlist →</Link></article>
      <article><h3>Help grounded in event facts</h3><p>Ask the assistant about recorded opportunities. Review its factual details alongside the official rules.</p><Link href="/assistant" className="action-link mt-3">Meet the assistant →</Link></article>
    </div></section>
    <section className="home-section home-split" aria-labelledby="personal-heading"><div><p className="eyebrow mb-3">Personal, with perspective</p><h2 id="personal-heading" className="section-title">Your interests are a starting point.</h2><p className="mt-4 max-w-lg leading-relaxed text-muted-foreground">Add optional profile details to see how opportunities relate to your interests, skills and preferences. A match is a guide to explore, not a promise of admission.</p><Link href="/for-you" className="action-link mt-4">Discover For You →</Link></div><div className="home-callout"><h3 className="text-lg font-semibold">Clear about what we know.</h3><p className="mt-3 leading-relaxed text-muted-foreground">Eligibility, verification and match information are shown separately. Unknown details stay unknown. Check each opportunity’s sources and the organizer’s current rules before applying.</p><Link href="/explore" className="action-link mt-4">Find your next opportunity →</Link></div></section>
  </DiscoveryShell>;
}
