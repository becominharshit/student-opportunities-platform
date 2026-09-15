export default function Home() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-6 py-20">
      <p className="text-sm font-semibold text-primary">Student Opportunities Platform</p>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">Student opportunities, coming soon.</h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        We’re building a place to discover student technology events and understand
        their requirements. Opportunity listings are not available yet.
      </p>
      <nav aria-label="Account" className="mt-8 flex gap-6 underline">
        <a href="/login">Sign in</a><a href="/signup">Create account</a>
      </nav>
    </main>
  );
}

