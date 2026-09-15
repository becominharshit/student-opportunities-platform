"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main-content" className="mx-auto max-w-md space-y-6 px-6 py-16">
    <h1 className="text-2xl font-semibold">Temporarily unavailable</h1>
    <p>We could not load this page. Please try again shortly.</p>
    <button onClick={reset} className="rounded border px-4 py-2">Try again</button>
  </main>;
}
