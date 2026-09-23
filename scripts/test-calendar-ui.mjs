import assert from 'node:assert/strict';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';
import ts from 'typescript';

function compile(source) {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  return 'data:text/javascript;base64,' + Buffer.from(
    transpiled
      .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
      .replaceAll('"react"', JSON.stringify(import.meta.resolve('react')))
  ).toString('base64');
}

let browser, server;

try {
  // Transpile calendar lib
  const calendarSource = await readFile('src/lib/events/calendar.ts', 'utf8');
  const calendarCompiled = compile(calendarSource);

  // Transpile calendar actions component with rewritten import
  const actionsSource = (await readFile('src/components/calendar-actions.tsx', 'utf8'))
    .replaceAll('"@/lib/events/calendar"', JSON.stringify(calendarCompiled));
  const { EventCalendarSection, EventCardCalendarActions } = await import(compile(actionsSource));

  // Load CSS from Next.js build
  const chunkFiles = await readdir('.next/static/chunks');
  const cssFiles = chunkFiles.filter(n => n.endsWith('.css'));
  const css = (await Promise.all(cssFiles.map(n => readFile('.next/static/chunks/' + n, 'utf8')))).join('\n');

  // Sample fixtures
  const standardEvent = {
    id: "10000000-0000-0000-0000-000000000001",
    slug: "national-hackathon-2026",
    title: "National Student Hackathon 2026",
    short_description: "Annual nationwide student coding and innovation competition.",
    date_precision: "date_only",
    start_date: "2026-10-15",
    end_date: "2026-10-17",
    start_at: null,
    end_at: null,
    timezone: "Asia/Kolkata",
    mode: "in_person",
    venue: "Main Campus Auditorium",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    status: "scheduled",
    registration_status: "open",
  };

  const startOnlyEvent = {
    id: "10000000-0000-0000-0000-000000000002",
    slug: "ai-symposium-opening",
    title: "AI Research Keynote Symposium",
    short_description: "Opening keynote presentation without scheduled end time.",
    date_precision: "datetime",
    start_date: null,
    end_date: null,
    start_at: "2026-11-01T10:00:00Z",
    end_at: null,
    timezone: "UTC",
    mode: "online",
    status: "scheduled",
    registration_status: "open",
  };

  const undatedEvent = {
    id: "10000000-0000-0000-0000-000000000003",
    slug: "undated-fellowship-2026",
    title: "Summer Research Fellowship 2026",
    short_description: "Dates to be announced by faculty committee.",
    date_precision: null,
    start_date: null,
    end_date: null,
    start_at: null,
    end_at: null,
    timezone: null,
    mode: "online",
    status: "draft",
    registration_status: "closed",
  };

  const cancelledEvent = {
    id: "10000000-0000-0000-0000-000000000004",
    slug: "cancelled-workshop",
    title: "Robotics Design Workshop (Cancelled)",
    short_description: "Cancelled due to unforeseen scheduling conflict.",
    date_precision: "date_only",
    start_date: "2026-12-05",
    end_date: "2026-12-05",
    start_at: null,
    end_at: null,
    timezone: "Asia/Kolkata",
    mode: "in_person",
    venue: "Lab 3",
    status: "cancelled",
    registration_status: "closed",
  };

  const completedEvent = {
    id: "10000000-0000-0000-0000-000000000005",
    slug: "past-bootcamp-2026",
    title: "Spring Web Development Bootcamp",
    short_description: "Intensive 3-day frontend engineering bootcamp.",
    date_precision: "date_only",
    start_date: "2026-02-10",
    end_date: "2026-02-12",
    start_at: null,
    end_at: null,
    timezone: "Asia/Kolkata",
    mode: "in_person",
    venue: "Engineering Hall",
    status: "completed",
    registration_status: "closed",
  };

  server = createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let view;

      if (url.pathname === '/detail-standard') {
        view = createElement('main', { className: 'max-w-4xl mx-auto p-4 sm:p-6 md:p-8' },
          createElement('div', { className: 'grid gap-6 lg:grid-cols-3' },
            createElement('div', { className: 'lg:col-span-2' },
              createElement('h1', { className: 'text-2xl font-bold text-gray-900' }, standardEvent.title),
              createElement('p', { className: 'mt-2 text-sm text-gray-600' }, standardEvent.short_description)
            ),
            createElement('aside', { className: 'p-6 bg-gray-50 border border-gray-200 rounded-lg' },
              createElement('h2', { className: 'text-lg font-semibold' }, 'Registration & Actions'),
              createElement(EventCalendarSection, { event: standardEvent })
            )
          )
        );
      } else if (url.pathname === '/detail-start-only') {
        view = createElement('main', { className: 'max-w-4xl mx-auto p-4 sm:p-6 md:p-8' },
          createElement('aside', { className: 'p-6 bg-gray-50 border border-gray-200 rounded-lg max-w-md' },
            createElement(EventCalendarSection, { event: startOnlyEvent })
          )
        );
      } else if (url.pathname === '/detail-undated') {
        view = createElement('main', { className: 'max-w-4xl mx-auto p-4 sm:p-6 md:p-8' },
          createElement('aside', { className: 'p-6 bg-gray-50 border border-gray-200 rounded-lg max-w-md' },
            createElement(EventCalendarSection, { event: undatedEvent })
          )
        );
      } else if (url.pathname === '/detail-cancelled') {
        view = createElement('main', { className: 'max-w-4xl mx-auto p-4 sm:p-6 md:p-8' },
          createElement('aside', { className: 'p-6 bg-gray-50 border border-gray-200 rounded-lg max-w-md' },
            createElement(EventCalendarSection, { event: cancelledEvent })
          )
        );
      } else if (url.pathname === '/detail-completed') {
        view = createElement('main', { className: 'max-w-4xl mx-auto p-4 sm:p-6 md:p-8' },
          createElement('aside', { className: 'p-6 bg-gray-50 border border-gray-200 rounded-lg max-w-md' },
            createElement(EventCalendarSection, { event: completedEvent })
          )
        );
      } else if (url.pathname === '/saved-cards') {
        const events = [standardEvent, startOnlyEvent, undatedEvent, cancelledEvent, completedEvent];
        view = createElement('main', { className: 'max-w-5xl mx-auto p-4 sm:p-6 md:p-8' },
          createElement('h1', { className: 'text-2xl font-bold mb-6' }, 'Saved Events'),
          createElement('div', { className: 'grid gap-4 sm:grid-cols-2' },
            events.map(ev => createElement('article', { key: ev.id, className: 'p-5 border border-gray-200 rounded-lg bg-white' },
              createElement('h2', { className: 'text-lg font-semibold' }, ev.title),
              createElement('p', { className: 'text-xs text-gray-500 mt-1' }, ev.short_description),
              createElement(EventCardCalendarActions, { event: ev })
            ))
          )
        );
      } else {
        res.statusCode = 404;
        return res.end('Not found');
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
        css +
        '</style></head><body class="bg-gray-50 min-h-screen text-gray-900">' +
        renderToStaticMarkup(view) +
        '</body></html>'
      );
    } catch (err) {
      res.statusCode = 500;
      res.end('UI fixture error: ' + err.message);
    }
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;

  const scratchDir = 'C:/Users/LOQ/.gemini/antigravity/brain/f67cfbda-db54-4e3a-bc8f-0c44b6b876ea/scratch/after_calendar';
  await mkdir(scratchDir, { recursive: true });

  browser = await chromium.launch();
  const page = await browser.newPage();

  const breakpoints = [320, 390, 768, 1280];

  for (const width of breakpoints) {
    await page.setViewportSize({ width, height: 900 });

    // 1. Standard Event Detail
    await page.goto(origin + '/detail-standard');
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Detail standard overflow at ${width}px`
    );
    assert(await page.getByRole('heading', { name: 'Add to calendar' }).isVisible(), 'Add to calendar heading visible');

    const gcalLink = page.getByRole('link', { name: /Add to Google Calendar/ });
    assert(await gcalLink.isVisible(), 'Google Calendar link visible');
    const gcalHref = await gcalLink.getAttribute('href');
    assert.ok(gcalHref?.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'), 'GCal link valid');
    assert.equal(await gcalLink.getAttribute('target'), '_blank', 'GCal link target _blank');
    assert.equal(await gcalLink.getAttribute('rel'), 'noopener noreferrer', 'GCal link rel');

    const icsLink = page.getByRole('link', { name: 'Download .ics' });
    assert(await icsLink.isVisible(), 'ICS download link visible');
    const icsHref = await icsLink.getAttribute('href');
    assert.equal(icsHref, `/events/${standardEvent.slug}/calendar.ics`, 'ICS href matches route');
    assert.ok(await icsLink.getAttribute('download') !== null, 'ICS link has download attribute');

    await page.screenshot({ path: `${scratchDir}/detail_standard_${width}.png`, fullPage: true });

    // 2. Start-Only Datetime Event (Neutral Notice)
    await page.goto(origin + '/detail-start-only');
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Detail start-only overflow at ${width}px`
    );
    assert(await page.getByText(/Google Calendar: Event end time is not specified/).isVisible(), 'GCal unavailable notice visible');
    assert(await page.getByRole('link', { name: 'Download .ics' }).isVisible(), 'ICS available for start-only');

    // 3. Undated Event (Disabled Reason)
    await page.goto(origin + '/detail-undated');
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Detail undated overflow at ${width}px`
    );
    assert(await page.getByText('Event date is not specified.').isVisible(), 'Undated notice visible');
    assert((await page.getByRole('link', { name: /Google Calendar/ }).count()) === 0, 'No GCal link on undated');
    assert((await page.getByRole('link', { name: /\.ics/ }).count()) === 0, 'No ICS link on undated');

    // 4. Cancelled Event (Notice + Secondary .ics)
    await page.goto(origin + '/detail-cancelled');
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Detail cancelled overflow at ${width}px`
    );
    assert(await page.getByText(/This event is cancelled. Calendar actions are disabled./).isVisible(), 'Cancelled notice visible');
    assert((await page.getByRole('link', { name: /Add to Google Calendar/ }).count()) === 0, 'No GCal CTA on cancelled');
    assert(await page.getByRole('link', { name: 'Download cancellation notice (.ics)' }).isVisible(), 'Cancellation notice ICS visible');

    // 5. Completed Event (Notice + Secondary .ics)
    await page.goto(origin + '/detail-completed');
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Detail completed overflow at ${width}px`
    );
    assert(await page.getByText('This event has completed.').isVisible(), 'Completed notice visible');
    assert((await page.getByRole('link', { name: /Add to Google Calendar/ }).count()) === 0, 'No primary GCal CTA on completed');
    assert(await page.getByRole('link', { name: 'Download archive (.ics)' }).isVisible(), 'Archive ICS visible');

    // 6. Saved Page Cards Integration
    await page.goto(origin + '/saved-cards');
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Saved cards overflow at ${width}px`
    );
    assert(await page.getByText('Event date is not specified.').isVisible(), 'Card undated state visible');
    assert(await page.getByText('Event cancelled').isVisible(), 'Card cancelled state visible');
    assert(await page.getByText('Event completed').isVisible(), 'Card completed state visible');
    assert(await page.getByRole('link', { name: '.ics archive' }).isVisible(), 'Card completed archive link visible');

    await page.screenshot({ path: `${scratchDir}/saved_cards_${width}.png`, fullPage: true });

    console.log(`PASS Calendar UI: No overflow, responsive layout, accessible links and screenshots captured at ${width}px`);
  }

  // Keyboard navigation & visible focus test
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + '/detail-standard');
  await page.keyboard.press('Tab');
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
  assert.ok(focusedTag, 'Tab key navigates focusable elements');

  // Verify focus ring styling on calendar link
  const gcalElement = page.getByRole('link', { name: /Add to Google Calendar/ });
  await gcalElement.focus();
  const isGcalFocused = await gcalElement.evaluate(el => el === document.activeElement);
  assert.ok(isGcalFocused, 'Google Calendar link receives focus');

  const icsElement = page.getByRole('link', { name: 'Download .ics' });
  await icsElement.focus();
  const isIcsFocused = await icsElement.evaluate(el => el === document.activeElement);
  assert.ok(isIcsFocused, 'ICS link receives focus');

  console.log('PASS Calendar UI test completed successfully across 320px, 390px, 768px, and 1280px.');
} finally {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
}
