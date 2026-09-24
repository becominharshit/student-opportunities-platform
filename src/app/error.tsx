"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main-content" className="mx-auto max-w-xl space-y-6 px-6 py-16">
    <h1 className="page-title">Temporarily unavailable</h1>
    <p>We could not load this page. Please try again shortly.</p>
    <button onClick={reset} className="secondary-action">Try again</button>
  </main>;
}
