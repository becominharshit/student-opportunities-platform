export function CatalogueLoading() {
  return <main id="main-content" className="site-container py-12" role="status" aria-live="polite"><p className="eyebrow">Student Opportunities</p><p className="section-title mt-4">Loading opportunity information…</p><div className="mt-8 grid gap-6 md:grid-cols-2" aria-hidden="true">{[0, 1].map(i => <div className="loading-lines" key={i}><span/><span/><span/></div>)}</div></main>;
}
