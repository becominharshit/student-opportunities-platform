import Link from "next/link";

export default function Home() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-6 py-20">
      <p className="text-sm font-semibold text-primary">Student Opportunities Platform</p>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">Student opportunities, coming soon.</h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        We’re building a place to discover student technology events and understand
        their requirements. Browse the current opportunity catalogue.
      </p>
      <nav aria-label="Main" className="mt-8 flex flex-wrap gap-6 underline">
        <Link href="/explore">Explore events</Link>
        <a href="/login">Sign in</a><a href="/signup">Create account</a>
      </nav>
    </main>
  );
}

