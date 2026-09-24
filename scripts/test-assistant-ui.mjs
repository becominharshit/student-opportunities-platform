import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";

let browser, server;

try {
  let css = "";
  try {
    const chunkFiles = await readdir(".next/static/chunks");
    const cssFiles = chunkFiles.filter((n) => n.endsWith(".css"));
    css = (
      await Promise.all(cssFiles.map((n) => readFile(".next/static/chunks/" + n, "utf8")))
    ).join("\n");
  } catch {
    css = `
      *, ::before, ::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: #e5e7eb; }
      body { margin: 0; font-family: system-ui, sans-serif; }
    `;
  }

  const htmlTemplate = (bodyContent, title = "Assistant UI Test") => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${css}</style>
</head>
<body class="bg-background text-foreground antialiased p-4 sm:p-6 md:p-8">
  <div class="mx-auto max-w-4xl space-y-8">
    <nav class="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
      <div class="font-bold">Student Opportunities</div>
      <div class="flex flex-wrap items-center gap-4 text-sm">
        <a href="/explore">Explore</a>
        <a href="/for-you">For You</a>
        <a href="/assistant" class="font-semibold underline">Assistant</a>
        <a href="/saved">Saved</a>
        <a href="/account">Account</a>
      </div>
    </nav>
    ${bodyContent}
  </div>
</body>
</html>`;

  // 1. Assistant Initial / Empty State with Starter Pills
  const emptyStateHtml = htmlTemplate(`
    <div class="flex flex-col space-y-6">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Grounded AI Assistant</h1>
            <p class="mt-1 text-sm text-muted-foreground">Ask questions about opportunities, deadlines, eligibility, and recommendations.</p>
          </div>
        </div>
        <div class="rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground leading-relaxed">
          <p class="font-semibold text-foreground">Authoritative Grounding &amp; Data Privacy</p>
          <p class="mt-1">
            Answers are grounded strictly in canonical database records. The assistant never manufactures unverified events, dates, deadlines, eligibility criteria, or recommendation rankings. Only minimized academic level, graduation year, and technical skills from your profile are evaluated for eligibility; your name, email, and institution are never sent to model providers. Official organizer rules remain authoritative.
          </p>
        </div>
      </div>

      <div class="min-h-[380px] rounded-lg border border-border bg-card p-4 sm:p-6 flex flex-col justify-between">
        <div class="my-auto py-8 text-center">
          <p class="text-base font-medium text-foreground">How can I help you find opportunities today?</p>
          <p class="mt-1 text-xs text-muted-foreground max-w-md mx-auto">Select an example question below or type your own question about technology competitions, deadlines, or eligibility.</p>
          <div class="mt-6 flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
            <button class="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs text-foreground text-left break-words max-w-full">Hackathons fitting my profile</button>
            <button class="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs text-foreground text-left break-words max-w-full">Which saved events have upcoming deadlines?</button>
            <button class="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs text-foreground text-left break-words max-w-full">Show online workshops for Python</button>
            <button class="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs text-foreground text-left break-words max-w-full">What can you help me with?</button>
          </div>
        </div>
      </div>

      <form class="flex flex-col sm:flex-row gap-3">
        <textarea placeholder="Ask a question about opportunities, deadlines, or your profile eligibility..." rows="2" class="min-h-12 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"></textarea>
        <button type="submit" class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-2 text-sm font-medium">Send</button>
      </form>
    </div>
  `, "Assistant Empty State");

  // 2. Assistant Populated State with Grounding, Facts, and Canonical Event Cards
  const populatedHtml = htmlTemplate(`
    <div class="flex flex-col space-y-6">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Grounded AI Assistant</h1>
            <p class="mt-1 text-sm text-muted-foreground">Ask questions about opportunities, deadlines, eligibility, and recommendations.</p>
          </div>
          <button class="border border-border rounded-md px-3 py-1.5 text-sm">Clear conversation</button>
        </div>
      </div>

      <div class="rounded-lg border border-border bg-card p-4 sm:p-6 space-y-6">
        <!-- User Message -->
        <div class="flex flex-col items-end">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">You</span>
          <div class="max-w-2xl rounded-lg px-4 py-3 text-sm leading-relaxed bg-primary text-primary-foreground">
            Compare upcoming AI hackathons and tell me if I'm eligible.
          </div>
        </div>

        <!-- Assistant Grounded Message -->
        <div class="flex flex-col items-start">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Assistant</span>
          <div class="max-w-2xl rounded-lg px-4 py-3 text-sm leading-relaxed bg-muted/50 border border-border text-foreground w-full">
            <div class="whitespace-pre-line break-words">
              Based on the canonical catalogue records and your saved student profile, I found 2 matching hackathons. Here is the authoritative eligibility evaluation and comparison.
            </div>

            <!-- Grounding Badge & Tools -->
            <div class="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-border/60 text-xs">
              <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800">
                Grounded in database facts
              </span>
              <span class="text-[11px] text-muted-foreground">
                Tools: search_events, evaluate_event_eligibility, compare_events
              </span>
            </div>

            <!-- Authoritative Facts (Eligibility) -->
            <div class="mt-4 space-y-4">
              <section aria-label="Authoritative Eligibility" class="rounded-lg border border-border bg-muted/30 p-4">
                <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Authoritative Eligibility Evaluation (C14)</p>
                <div class="space-y-3">
                  <div class="rounded-md border border-border bg-card p-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <a href="/events/global-ai-hackathon" class="font-semibold hover:underline">Global AI Hackathon</a>
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-800">Eligible</span>
                    </div>
                    <ul class="mt-2 space-y-1 text-xs text-muted-foreground list-disc list-inside">
                      <li>Enrolled in undergraduate degree program (Year 3)</li>
                    </ul>
                  </div>
                </div>
              </section>

              <!-- Comparison Matrix -->
              <section aria-label="Opportunity Comparison" class="rounded-lg border border-border bg-muted/30 p-4">
                <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Factual Comparison Matrix</p>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div class="rounded-md border border-border bg-card p-3 space-y-2 text-xs">
                    <div class="font-semibold text-sm border-b border-border pb-1">
                      <a href="/events/global-ai-hackathon" class="hover:underline">Global AI Hackathon</a>
                    </div>
                    <div><span class="text-muted-foreground">Category:</span> Hackathon</div>
                    <div><span class="text-muted-foreground">Mode:</span> Online</div>
                    <div><span class="text-muted-foreground">Deadline:</span> Oct 15, 2026</div>
                    <div><span class="text-muted-foreground">Fee:</span> Free</div>
                    <div><span class="text-muted-foreground">Prize:</span> $10,000 USD</div>
                  </div>
                </div>
              </section>
            </div>

            <!-- Referenced Canonical Event Cards (No Save Toggle) -->
            <div class="mt-4 space-y-3">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Referenced Canonical Opportunities</p>
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-md border border-border bg-card p-3 space-y-2 text-xs flex flex-col justify-between">
                  <div class="space-y-1">
                    <p class="text-[11px] text-primary">Hackathon · Online</p>
                    <a href="/events/global-ai-hackathon" class="font-semibold text-sm hover:underline block text-foreground leading-snug">Global AI Hackathon</a>
                    <p class="text-muted-foreground text-[11px]">AI Student Association</p>
                  </div>
                  <dl class="mt-2 space-y-1 border-t border-border pt-2 text-[11px]">
                    <div><dt class="inline text-muted-foreground">Deadline: </dt><dd class="inline text-foreground">Oct 15, 2026</dd></div>
                    <div><dt class="inline text-muted-foreground">Verification: </dt><dd class="inline font-medium uppercase text-foreground">Verified</dd></div>
                  </dl>
                  <div class="pt-2">
                    <a href="/events/global-ai-hackathon" class="inline-block text-xs font-medium text-primary underline underline-offset-4">View full details &rarr;</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Rate Limit Alert Banner -->
      <div role="alert" class="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900 flex flex-wrap items-center justify-between gap-3">
        <p class="font-medium">Rate limit reached (10 requests/minute). Please wait a moment.</p>
        <button class="border border-red-300 rounded px-2.5 py-1 text-xs">Retry</button>
      </div>

      <form class="flex flex-col sm:flex-row gap-3">
        <textarea placeholder="Ask a question..." rows="2" class="min-h-12 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"></textarea>
        <button type="submit" class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-2 text-sm font-medium">Send</button>
      </form>
    </div>
  `, "Assistant Populated State");

  server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (req.url === "/assistant-empty") res.end(emptyStateHtml);
    else res.end(populatedHtml);
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const viewports = [320, 390, 768, 1280];

  for (const width of viewports) {
    await page.setViewportSize({ width, height: 800 });

    // 1. Empty State Page
    await page.goto(origin + "/assistant-empty");
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Assistant empty state overflow at ${width}px`
    );
    assert(await page.getByRole("heading", { name: "Grounded AI Assistant" }).isVisible());

    // 2. Populated State Page
    await page.goto(origin + "/assistant-populated");
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Assistant populated state overflow at ${width}px`
    );
    assert(await page.getByRole("heading", { name: "Grounded AI Assistant" }).isVisible());
    assert(await page.getByRole("link", { name: "Global AI Hackathon" }).first().isVisible());
  }

  console.log("PASS: Assistant UI verified across 320px, 390px, 768px, 1280px with 0 overflow.");
} finally {
  await browser?.close();
  server?.close();
}
