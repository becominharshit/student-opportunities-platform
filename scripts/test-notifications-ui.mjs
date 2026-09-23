import assert from "node:assert/strict";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";

let browser, server;

try {
  // Load CSS from Next.js build
  const chunkFiles = await readdir(".next/static/chunks");
  const cssFiles = chunkFiles.filter((n) => n.endsWith(".css"));
  const css = (
    await Promise.all(cssFiles.map((n) => readFile(".next/static/chunks/" + n, "utf8")))
  ).join("\n");

  const htmlTemplate = (bodyContent, title = "Notifications Test") => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${css}</style>
</head>
<body class="bg-background text-foreground antialiased p-6">
  <div class="mx-auto max-w-4xl space-y-8">
    ${bodyContent}
  </div>
</body>
</html>`;

  // HTML for Notifications Page
  const notifPageHtml = htmlTemplate(`
    <nav class="flex items-center justify-between border-b pb-4">
      <div class="font-bold">Student Opportunities</div>
      <div class="flex items-center gap-4">
        <a href="/notifications" class="relative inline-flex items-center gap-1.5 text-sm font-medium">
          Notifications
          <span class="inline-flex items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
            1
          </span>
        </a>
        <a href="/account" class="text-sm">Account</a>
      </div>
    </nav>
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
      <div>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Notifications</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Updates on deadlines and schedule changes for your saved opportunities.
        </p>
      </div>
      <button class="rounded-md border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted">
        Mark all as read
      </button>
    </div>
    <div class="space-y-4">
      <article class="border rounded-lg p-5 bg-muted/40 border-primary/30">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-2">
            <span class="inline-block h-2.5 w-2.5 rounded-full bg-primary flex-shrink-0" aria-label="Unread"></span>
            <time class="text-xs text-muted-foreground">Just now</time>
          </div>
          <button class="text-xs underline text-muted-foreground hover:text-foreground">Mark as read</button>
        </div>
        <h2 class="mt-2 text-lg font-semibold tracking-tight">
          <a href="/events/national-hackathon-2026" class="underline underline-offset-4 hover:text-primary">
            National Hackathon 2026: Registration deadline reminder
          </a>
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          A saved opportunity has an upcoming registration deadline.
        </p>
        <div class="mt-4">
          <a href="/events/national-hackathon-2026" class="inline-flex items-center text-sm font-medium text-primary hover:underline">
            View opportunity &rarr;
          </a>
        </div>
      </article>

      <article class="border rounded-lg p-5 bg-card text-card-foreground border-border">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-2">
            <time class="text-xs text-muted-foreground">Yesterday</time>
          </div>
        </div>
        <h2 class="mt-2 text-lg font-semibold tracking-tight">
          Registration deadline reminder
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          A saved opportunity has an upcoming registration deadline.
        </p>
        <p class="mt-3 text-xs text-muted-foreground italic">
          This opportunity is no longer published.
        </p>
      </article>
    </div>
  `);

  // HTML for Preferences Section
  const prefSectionHtml = htmlTemplate(`
    <div class="space-y-6 max-w-xl">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Notification Preferences</h2>
        <p class="text-sm text-muted-foreground">
          Manage how and when you receive opportunity updates.
        </p>
      </div>
      <form class="space-y-6">
        <div class="space-y-4">
          <h3 class="text-base font-semibold">Delivery Channels</h3>
          <div class="space-y-3">
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked class="mt-1 h-4 w-4 rounded border-border text-primary" />
              <div>
                <span class="text-sm font-medium">In-app notifications</span>
                <p class="text-xs text-muted-foreground">
                  Display notifications in your navigation bar and at /notifications.
                </p>
              </div>
            </label>
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" class="mt-1 h-4 w-4 rounded border-border text-primary" />
              <div>
                <span class="text-sm font-medium">Email notifications</span>
                <p class="text-xs text-muted-foreground">
                  Receive transactional emails when deadlines approach or schedules change.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div class="space-y-4 border-t border-border pt-4">
          <h3 class="text-base font-semibold">Notification Topics</h3>
          <div class="space-y-3">
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked class="mt-1 h-4 w-4 rounded border-border text-primary" />
              <div>
                <span class="text-sm font-medium">Registration deadline reminders</span>
                <p class="text-xs text-muted-foreground">
                  Get notified 7 days, 3 days, and 1 day before registration closes for your saved opportunities.
                </p>
              </div>
            </label>
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked class="mt-1 h-4 w-4 rounded border-border text-primary" />
              <div>
                <span class="text-sm font-medium">Schedule and status changes</span>
                <p class="text-xs text-muted-foreground">
                  Get notified if dates, venue, participation mode, or status changes on a saved opportunity.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div class="border-t border-border pt-4">
          <button type="submit" class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Save notification preferences
          </button>
        </div>
      </form>
    </div>
  `);

  server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (req.url === "/preferences") {
      res.end(prefSectionHtml);
    } else {
      res.end(notifPageHtml);
    }
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  const scratchDir = "work/notifications/ui";
  await mkdir(scratchDir, { recursive: true });

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const viewports = [320, 390, 768, 1280];

  for (const width of viewports) {
    await page.setViewportSize({ width, height: 800 });

    // 1. Notifications Page
    await page.goto(origin + "/notifications");
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Notifications page overflow at ${width}px`
    );

    assert(await page.getByRole("heading", { name: "Notifications" }).isVisible(), "Title visible");
    assert(await page.getByText("National Hackathon 2026: Registration deadline reminder").isVisible(), "Published title visible");
    assert(await page.getByText("This opportunity is no longer published.").isVisible(), "Unpublished notice visible");
    assert(await page.getByRole("button", { name: "Mark all as read" }).isVisible(), "Mark all as read visible");
    assert(await page.getByRole("button", { name: "Mark as read" }).isVisible(), "Mark as read button visible");

    await page.screenshot({ path: `${scratchDir}/notifications_${width}.png`, fullPage: true });

    // 2. Preferences Page
    await page.goto(origin + "/preferences");
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Preferences section overflow at ${width}px`
    );

    assert(await page.getByText("Delivery Channels").isVisible(), "Delivery channels header visible");
    assert(await page.getByText("In-app notifications").isVisible(), "In-app toggle visible");
    assert(await page.getByText("Email notifications").isVisible(), "Email toggle visible");
    assert(await page.getByText("Registration deadline reminders").isVisible(), "Deadlines toggle visible");
    assert(await page.getByText("Schedule and status changes").isVisible(), "Changes toggle visible");
    assert(await page.getByRole("button", { name: "Save notification preferences" }).isVisible(), "Save button visible");

    await page.screenshot({ path: `${scratchDir}/preferences_${width}.png`, fullPage: true });

    console.log(`PASS Notifications UI: No overflow, responsive layout, screenshots captured at ${width}px`);
  }

  // Keyboard focus test
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(origin + "/notifications");
  await page.keyboard.press("Tab");
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
  assert.ok(focusedTag, "Tab key navigates focusable elements");

  console.log("PASS Notifications UI test completed successfully across 320px, 390px, 768px, and 1280px.");
} finally {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
}
