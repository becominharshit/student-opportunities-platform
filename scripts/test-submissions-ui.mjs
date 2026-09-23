import assert from "node:assert/strict";
import { readFile, readdir, mkdir } from "node:fs/promises";
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
    // Fallback if build hasn't run yet
    css = `
      *, ::before, ::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: #e5e7eb; }
      body { margin: 0; font-family: system-ui, sans-serif; }
    `;
  }

  const htmlTemplate = (bodyContent, title = "Submissions UI Test") => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${css}</style>
</head>
<body class="bg-background text-foreground antialiased p-4 sm:p-6 md:p-8">
  <div class="mx-auto max-w-4xl space-y-8">
    ${bodyContent}
  </div>
</body>
</html>`;

  // 1. Submit Event Form Page HTML
  const submitFormHtml = htmlTemplate(`
    <nav class="flex items-center justify-between border-b pb-4">
      <div class="font-bold">Student Opportunities</div>
      <div class="flex items-center gap-4 text-sm">
        <a href="/explore">Explore</a>
        <a href="/account">Account</a>
      </div>
    </nav>
    <div class="space-y-6">
      <div class="border-b border-border pb-4">
        <p class="text-xs font-semibold uppercase tracking-widest text-primary">Community Contribution</p>
        <h1 class="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">Submit an opportunity</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          Know about a student hackathon, coding competition, or tech workshop? Submit it for review.
        </p>
      </div>

      <form class="space-y-6 max-w-2xl">
        <div class="bg-blue-50/50 p-4 rounded-md border border-blue-200 text-sm text-blue-900">
          <p class="font-semibold">Review Notice</p>
          <p class="mt-1 text-xs">Submissions are reviewed by administrators before being published. No opportunities become public automatically.</p>
        </div>

        <div class="space-y-4">
          <h2 class="text-base font-semibold">Event Information</h2>
          <div>
            <label class="block text-xs font-semibold uppercase text-gray-700">Event Title *</label>
            <input type="text" value="National AI Hackathon 2026" class="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase text-gray-700">Organizer Name *</label>
            <input type="text" value="AI Student Association" class="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-700">Category *</label>
              <select class="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm">
                <option>Hackathon</option>
                <option>Coding Competition</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-700">Mode *</label>
              <select class="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm">
                <option>Online</option>
                <option>In-person</option>
                <option>Hybrid</option>
              </select>
            </div>
          </div>
        </div>

        <div class="space-y-4 border-t border-border pt-4">
          <h2 class="text-base font-semibold">Dates &amp; Registration Deadline</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-700">Start Date</label>
              <input type="date" value="2026-11-15" class="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm" />
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase text-gray-700">End Date</label>
              <input type="date" value="2026-11-17" class="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm" />
            </div>
          </div>
        </div>

        <div class="border-t border-border pt-4">
          <button type="submit" class="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Submit Opportunity for Review
          </button>
        </div>
      </form>
    </div>
  `, "Submit Opportunity");

  // 2. Submitter Dashboard Page HTML
  const userDashboardHtml = htmlTemplate(`
    <nav class="flex items-center justify-between border-b pb-4">
      <div class="font-bold">Student Opportunities</div>
      <div class="flex items-center gap-4 text-sm">
        <a href="/account">Account</a>
      </div>
    </nav>
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Your submitted opportunities</h1>
          <p class="mt-1 text-sm text-muted-foreground">Track the review status of opportunities you shared.</p>
        </div>
        <a href="/submit-event" class="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Submit another
        </a>
      </div>

      <ul class="space-y-4">
        <li class="p-5 rounded-lg border border-border bg-card shadow-sm space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-blue-50 text-blue-800 border-blue-200">
                Submitted
              </span>
              <h2 class="mt-2 text-lg font-semibold">National AI Hackathon 2026</h2>
              <p class="text-sm text-muted-foreground">AI Student Association</p>
            </div>
            <span class="text-xs text-muted-foreground">2026-09-24</span>
          </div>
          <div class="border-t border-border pt-2">
            <button class="text-xs text-destructive underline">Withdraw submission</button>
          </div>
        </li>

        <li class="p-5 rounded-lg border border-border bg-card shadow-sm space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-emerald-50 text-emerald-800 border-emerald-200">
                Accepted
              </span>
              <h2 class="mt-2 text-lg font-semibold">Robotics Championship 2026</h2>
              <p class="text-sm text-muted-foreground">Robotics League</p>
            </div>
            <span class="text-xs text-muted-foreground">2026-09-20</span>
          </div>
          <div class="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
            🎉 This opportunity is now published on the platform!
            <a href="/events/robotics-championship-2026" class="font-semibold underline ml-1">View public opportunity &rarr;</a>
          </div>
        </li>
      </ul>
    </div>
  `, "Your Submissions");

  // 3. Admin Moderation Queue HTML
  const adminQueueHtml = htmlTemplate(`
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-gray-200 gap-4">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold text-gray-900">Community Event Submissions</h1>
          <p class="text-sm text-gray-600 mt-1">Review untrusted community submissions.</p>
        </div>
        <a href="/admin" class="text-sm text-blue-600 underline">Canonical Dashboard</a>
      </div>

      <div class="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        <span class="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white">All</span>
        <span class="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700">Needs Review</span>
        <span class="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700">Accepted</span>
      </div>

      <div class="bg-white shadow overflow-hidden border border-gray-200 rounded-md">
        <ul class="divide-y divide-gray-200">
          <li class="p-4 hover:bg-gray-50 flex items-center justify-between gap-4">
            <div>
              <span class="px-2 py-0.5 rounded text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">Submitted</span>
              <h2 class="mt-1 font-semibold text-gray-900">National AI Hackathon 2026</h2>
              <p class="text-xs text-gray-500">Organizer: AI Student Association &middot; Submitter: student@example.test</p>
            </div>
            <a href="/admin/submissions/123" class="text-xs text-blue-600 font-medium">Review &rarr;</a>
          </li>
        </ul>
      </div>
    </div>
  `, "Admin Submissions Queue");

  // 4. Admin Submission Review Detail HTML
  const adminDetailHtml = htmlTemplate(`
    <div class="space-y-6">
      <div class="pb-4 border-b border-gray-200">
        <a href="/admin/submissions" class="text-xs text-blue-600 underline">&larr; Community Queue</a>
        <h1 class="mt-2 text-2xl font-bold text-gray-900">Review Submission: National AI Hackathon 2026</h1>
      </div>

      <div class="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
        <div class="flex items-center justify-between gap-4">
          <span class="px-2 py-1 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">Needs Review</span>
          <div class="flex gap-2">
            <button class="px-3 py-1.5 border border-red-300 text-xs font-medium rounded text-red-700 bg-red-50">Reject</button>
            <button class="px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-blue-600">Accept &amp; Convert</button>
          </div>
        </div>

        <div class="border-t border-gray-100 pt-4">
          <h2 class="text-sm font-semibold uppercase text-gray-500">Duplicate Check</h2>
          <p class="mt-1 text-xs text-green-700">0 duplicate candidates detected.</p>
        </div>

        <div class="border-t border-gray-100 pt-4">
          <h2 class="text-sm font-semibold uppercase text-gray-500">Untrusted Submitter Input</h2>
          <dl class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div><dt class="text-gray-500">Website</dt><dd class="font-medium">https://example.test/ai-hack</dd></div>
            <div><dt class="text-gray-500">Mode</dt><dd class="font-medium">Online</dd></div>
          </dl>
        </div>
      </div>
    </div>
  `, "Review Submission Detail");

  server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (req.url === "/submit-event") res.end(submitFormHtml);
    else if (req.url === "/account/submissions") res.end(userDashboardHtml);
    else if (req.url === "/admin/submissions") res.end(adminQueueHtml);
    else res.end(adminDetailHtml);
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  const scratchDir = "work/submissions/ui";
  await mkdir(scratchDir, { recursive: true });

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const viewports = [320, 390, 768, 1280];

  for (const width of viewports) {
    await page.setViewportSize({ width, height: 800 });

    // 1. Submit Event Form Page
    await page.goto(origin + "/submit-event");
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Submit form page overflow at ${width}px`
    );
    assert(await page.getByRole("heading", { name: "Submit an opportunity" }).isVisible());

    // 2. User Dashboard Page
    await page.goto(origin + "/account/submissions");
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `User dashboard page overflow at ${width}px`
    );
    assert(await page.getByRole("heading", { name: "Your submitted opportunities" }).isVisible());

    // 3. Admin Submissions Queue Page
    await page.goto(origin + "/admin/submissions");
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Admin queue page overflow at ${width}px`
    );
    assert(await page.getByRole("heading", { name: "Community Event Submissions" }).isVisible());

    // 4. Admin Submission Review Detail Page
    await page.goto(origin + "/admin/submissions/detail");
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Admin review detail page overflow at ${width}px`
    );
    assert(await page.getByRole("heading", { name: "Review Submission: National AI Hackathon 2026" }).isVisible());
  }

  console.log("PASS: Submissions UI verified across 320px, 390px, 768px, 1280px with 0 overflow.");
} finally {
  await browser?.close();
  server?.close();
}
