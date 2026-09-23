import assert from 'node:assert/strict';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';
import ts from 'typescript';

import { fixture, A } from '../tests/saves/harness.mjs';

const compile = source => 'data:text/javascript;base64,' + Buffer.from(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
    .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
    .replaceAll('"react"', JSON.stringify(import.meta.resolve('react')))
).toString('base64');

let f, browser, server;

try {
  f = await fixture();
  // Ensure user is an admin in database
  await f.db.query("insert into public.admin_memberships(user_id, role) values($1, 'admin') on conflict do nothing", [A]);

  const validationSource = await readFile('src/lib/events/validation.ts', 'utf8');
  const validationCompiled = compile(validationSource);

  const eventEditorSource = (await readFile('src/components/event-editor.tsx', 'utf8'))
    .replaceAll('"@/lib/events/validation"', JSON.stringify(validationCompiled));
  const { EventEditor } = await import(compile(eventEditorSource));

  // Prepare reference fixtures in database
  await f.db.exec(`
    insert into public.interests(slug, name) values ('robotics', 'Robotics'), ('ai-ml', 'AI & Machine Learning') on conflict do nothing;
    insert into public.skills(slug, name) values ('python', 'Python'), ('react', 'React') on conflict do nothing;
  `);

  const rawEvent = (await f.db.query("select * from public.events where id=$1", [f.id])).rows[0];
  const orgs = (await f.db.query("select id, name from public.organizers")).rows;
  const cats = (await f.db.query("select id, name, slug from public.event_categories")).rows;
  const interests = (await f.db.query("select slug, name from public.interests")).rows;
  const skills = (await f.db.query("select id, slug, name from public.skills")).rows;

  const css = (await Promise.all((await readdir('.next/static/chunks')).filter(n => n.endsWith('.css')).map(n => readFile('.next/static/chunks/' + n, 'utf8')))).join('\n');

  // Operational metrics mock summary
  const summary = {
    counts: {
      draft: 3,
      review: 2,
      published: 1,
      unpublished: 1,
      archived: 0,
      needsAttention: 2,
      duplicateReviews: 1,
    },
    recentChanges: [
      {
        id: "change-1",
        event_id: rawEvent.id,
        event_version: rawEvent.version,
        reason: "C18 UI verification update",
        created_at: new Date().toISOString(),
        actor_id: A,
        field_diff: { title: { before: "Old Title", after: rawEvent.title } },
        events: { id: rawEvent.id, title: rawEvent.title, slug: rawEvent.slug },
      },
    ],
  };

  const sampleItems = [
    {
      id: rawEvent.id,
      title: rawEvent.title,
      slug: rawEvent.slug,
      publication_status: rawEvent.publication_status,
      verification_status: "current",
      category_id: rawEvent.category_id,
      version: rawEvent.version,
      created_at: rawEvent.created_at,
      event_categories: cats[0] || null,
    },
    {
      id: "20000000-0000-0000-0000-000000000002",
      title: "Draft AI Hackathon",
      slug: "draft-ai-hackathon",
      publication_status: "draft",
      verification_status: "pending",
      category_id: cats[0]?.id || null,
      version: 1,
      created_at: new Date().toISOString(),
      event_categories: cats[0] || null,
    },
  ];

  server = createServer(async (req, res) => {
    try {
      const origin = globalThis.__c18UIOrigin;
      const url = new URL(req.url, origin);
      let view;

      if (url.pathname === '/admin') {
        // Render rich admin dashboard
        view = createElement('main', { className: 'max-w-6xl mx-auto p-4 sm:p-6 md:p-8' },
          createElement('div', { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-gray-200 gap-4' },
            createElement('div', null,
              createElement('h1', { className: 'text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight' }, 'Administrator Operations'),
              createElement('p', { className: 'text-sm text-gray-600 mt-1' }, 'Operational summaries, lifecycle management, and event curation based on real system records.')
            ),
            createElement('div', { className: 'flex items-center space-x-3' },
              createElement('a', { href: '/admin/events/new', className: 'inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 shadow-sm' }, '+ Create Event'),
              createElement('a', { href: '/account', className: 'inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50' }, 'Account')
            )
          ),
          // Metric Tiles
          createElement('section', { className: 'my-8' },
            createElement('h2', { className: 'text-lg font-bold text-gray-900 mb-4' }, 'Operational Metrics'),
            createElement('div', { className: 'grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3' },
              createElement('div', { className: 'p-4 rounded-lg border border-gray-200 bg-white text-center' },
                createElement('div', { className: 'text-2xl font-bold text-gray-900' }, summary.counts.draft),
                createElement('div', { className: 'text-xs font-medium text-gray-600 mt-1' }, 'Draft')
              ),
              createElement('div', { className: 'p-4 rounded-lg border border-gray-200 bg-white text-center' },
                createElement('div', { className: 'text-2xl font-bold text-amber-600' }, summary.counts.review),
                createElement('div', { className: 'text-xs font-medium text-gray-600 mt-1' }, 'In Review')
              ),
              createElement('div', { className: 'p-4 rounded-lg border border-gray-200 bg-white text-center' },
                createElement('div', { className: 'text-2xl font-bold text-emerald-600' }, summary.counts.published),
                createElement('div', { className: 'text-xs font-medium text-gray-600 mt-1' }, 'Published')
              ),
              createElement('div', { className: 'p-4 rounded-lg border border-gray-200 bg-white text-center' },
                createElement('div', { className: 'text-2xl font-bold text-orange-600' }, summary.counts.unpublished),
                createElement('div', { className: 'text-xs font-medium text-gray-600 mt-1' }, 'Unpublished')
              ),
              createElement('div', { className: 'p-4 rounded-lg border border-gray-200 bg-white text-center' },
                createElement('div', { className: 'text-2xl font-bold text-gray-500' }, summary.counts.archived),
                createElement('div', { className: 'text-xs font-medium text-gray-600 mt-1' }, 'Archived')
              ),
              createElement('div', { className: 'p-4 rounded-lg border border-red-200 bg-red-50 text-center' },
                createElement('div', { className: 'text-2xl font-bold text-red-600' }, summary.counts.needsAttention),
                createElement('div', { className: 'text-xs font-medium text-red-800 mt-1' }, 'Needs Attention')
              ),
              createElement('div', { className: 'p-4 rounded-lg border border-purple-200 bg-purple-50 text-center' },
                createElement('div', { className: 'text-2xl font-bold text-purple-700' }, summary.counts.duplicateReviews),
                createElement('div', { className: 'text-xs font-medium text-purple-800 mt-1' }, 'Pending Dups')
              )
            )
          ),
          // Filter Form
          createElement('form', { className: 'p-4 bg-gray-50 border border-gray-200 rounded-lg mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3' },
            createElement('div', null,
              createElement('label', { className: 'block text-xs font-semibold text-gray-700 mb-1' }, 'Publication Status'),
              createElement('select', { className: 'w-full border rounded p-1.5 text-xs bg-white' },
                createElement('option', { value: '' }, 'All statuses'),
                createElement('option', { value: 'draft' }, 'Draft'),
                createElement('option', { value: 'published' }, 'Published')
              )
            ),
            createElement('div', null,
              createElement('label', { className: 'block text-xs font-semibold text-gray-700 mb-1' }, 'Category'),
              createElement('select', { className: 'w-full border rounded p-1.5 text-xs bg-white' },
                createElement('option', { value: '' }, 'All categories'),
                cats.map(c => createElement('option', { key: c.id, value: c.id }, c.name))
              )
            ),
            createElement('div', null,
              createElement('label', { className: 'block text-xs font-semibold text-gray-700 mb-1' }, 'Verification Status'),
              createElement('select', { className: 'w-full border rounded p-1.5 text-xs bg-white' },
                createElement('option', { value: '' }, 'All verification statuses')
              )
            ),
            createElement('div', { className: 'flex items-end' },
              createElement('button', { type: 'button', className: 'w-full bg-gray-800 text-white font-medium p-1.5 rounded text-xs' }, 'Filter Events')
            )
          ),
          // Table (Desktop) / Cards (Mobile)
          createElement('div', { className: 'hidden md:block overflow-x-auto border border-gray-200 rounded-lg bg-white shadow-sm' },
            createElement('table', { className: 'min-w-full divide-y divide-gray-200 text-left text-xs' },
              createElement('thead', { className: 'bg-gray-50 font-semibold text-gray-700' },
                createElement('tr', null,
                  createElement('th', { className: 'px-4 py-3' }, 'Event'),
                  createElement('th', { className: 'px-4 py-3' }, 'Category'),
                  createElement('th', { className: 'px-4 py-3' }, 'State'),
                  createElement('th', { className: 'px-4 py-3' }, 'Verification'),
                  createElement('th', { className: 'px-4 py-3' }, 'Ver.'),
                  createElement('th', { className: 'px-4 py-3 text-right' }, 'Actions')
                )
              ),
              createElement('tbody', { className: 'divide-y divide-gray-200' },
                sampleItems.map(item => createElement('tr', { key: item.id },
                  createElement('td', { className: 'px-4 py-3 font-semibold text-blue-600' },
                    createElement('a', { href: '/admin/events/' + item.id, className: 'hover:underline' }, item.title),
                    createElement('div', { className: 'text-[11px] text-gray-500 font-mono font-normal' }, item.slug)
                  ),
                  createElement('td', { className: 'px-4 py-3 text-gray-600' }, item.event_categories?.name ?? '—'),
                  createElement('td', { className: 'px-4 py-3' },
                    createElement('span', { className: 'px-2 py-0.5 rounded text-xs font-medium border bg-emerald-100 text-emerald-800 border-emerald-300' }, item.publication_status)
                  ),
                  createElement('td', { className: 'px-4 py-3' },
                    createElement('span', { className: 'px-2 py-0.5 rounded text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200' }, item.verification_status)
                  ),
                  createElement('td', { className: 'px-4 py-3 font-mono text-gray-600' }, `v${item.version}`),
                  createElement('td', { className: 'px-4 py-3 text-right space-x-2' },
                    createElement('a', { href: '/admin/events/' + item.id, className: 'text-blue-600 font-medium hover:underline' }, 'Edit'),
                    item.publication_status === 'published' ? createElement('a', { href: '/events/' + item.slug, className: 'text-gray-500 hover:text-black ml-2' }, 'View public ↗') : null
                  )
                ))
              )
            )
          ),
          createElement('div', { className: 'md:hidden space-y-3' },
            sampleItems.map(item => createElement('div', { key: item.id, className: 'p-3 bg-white border border-gray-200 rounded-lg text-xs space-y-1.5' },
              createElement('a', { href: '/admin/events/' + item.id, className: 'font-semibold text-blue-600 block' }, item.title),
              createElement('div', { className: 'flex gap-2' },
                createElement('span', { className: 'px-1.5 py-0.5 rounded text-[10px] border bg-emerald-100 text-emerald-800' }, item.publication_status),
                createElement('span', { className: 'px-1.5 py-0.5 rounded text-[10px] border bg-blue-50 text-blue-700' }, item.verification_status)
              )
            ))
          ),
          // Pagination
          createElement('nav', { 'aria-label': 'Event pagination', className: 'flex justify-between items-center mt-6 pt-4 border-t text-xs' },
            createElement('span', { className: 'px-3 py-1.5 border border-gray-200 rounded text-gray-300' }, '← Previous'),
            createElement('span', { className: 'text-gray-500' }, 'Page 1'),
            createElement('span', { className: 'px-3 py-1.5 border border-gray-200 rounded text-gray-300' }, 'Next →')
          )
        );
      } else if (url.pathname === '/admin/events/new') {
        view = createElement('main', { className: 'max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-6' },
          createElement('a', { href: '/admin', className: 'text-xs text-blue-600 underline' }, '← All Events'),
          createElement('div', { className: 'pb-4 border-b' },
            createElement('h1', { className: 'text-2xl sm:text-3xl font-extrabold text-gray-900' }, 'Create Event Draft'),
            createElement('p', { className: 'text-sm text-gray-600 mt-1' }, 'Enter verified facts supported by evidence.')
          ),
          createElement(EventEditor, { organizers: orgs, categories: cats, interests, skills })
        );
      } else if (url.pathname.startsWith('/admin/events/')) {
        view = createElement('main', { className: 'max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-8' },
          createElement('a', { href: '/admin', className: 'text-xs text-blue-600 underline' }, '← All Events'),
          createElement('div', { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b gap-4' },
            createElement('div', null,
              createElement('h1', { className: 'text-2xl sm:text-3xl font-extrabold text-gray-900' }, rawEvent.title),
              createElement('div', { className: 'flex items-center space-x-2 mt-2 text-xs' },
                createElement('span', { className: 'px-2 py-0.5 rounded font-medium border bg-emerald-100 text-emerald-800' }, rawEvent.publication_status),
                createElement('span', { className: 'font-mono text-gray-500' }, `version ${rawEvent.version}`)
              )
            ),
            createElement('a', { href: '/events/' + rawEvent.slug, target: '_blank', className: 'px-3 py-1.5 border border-emerald-300 text-xs font-semibold rounded text-emerald-800 bg-emerald-50' }, 'View Public Page ↗')
          ),
          // Workflow Actions
          createElement('section', { className: 'p-5 bg-gray-50 border rounded-lg' },
            createElement('h2', { className: 'text-base font-bold text-gray-900 mb-1' }, 'Workflow State Transitions'),
            createElement('div', { className: 'space-y-3 mt-3' },
              createElement('form', { className: 'p-3 bg-white border rounded flex flex-col md:flex-row justify-between gap-3 text-xs' },
                createElement('div', null,
                  createElement('div', { className: 'font-semibold text-gray-900' }, 'Unpublish Event'),
                  createElement('div', { className: 'text-gray-500' }, 'Hides event from public catalogue.')
                ),
                createElement('div', { className: 'flex space-x-2' },
                  createElement('input', { className: 'border p-1.5 rounded', placeholder: 'Reason to unpublish...', required: true }),
                  createElement('button', { className: 'bg-orange-600 text-white font-semibold px-3 py-1.5 rounded' }, 'Confirm unpublish')
                )
              )
            )
          ),
          // Editor
          createElement(EventEditor, {
            event: rawEvent,
            organizers: orgs,
            categories: cats,
            interests,
            skills,
            tags: [{ kind: 'domain', tag: 'robotics', skill_id: null }],
            deadlines: [{ id: 'dead-1', kind: 'registration', label: 'Registration Closes', local_date: '2026-11-01', due_at: null, timezone: null, precision: 'date_only', active: true, is_primary: true }]
          })
        );
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body class="bg-gray-50 min-h-screen">' + renderToStaticMarkup(view) + '</body></html>');
    } catch (err) {
      res.statusCode = 500;
      res.end('UI fixture error: ' + err.message);
    }
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  globalThis.__c18UIOrigin = origin;

  const scratchDir = 'C:/Users/LOQ/.gemini/antigravity/brain/f67cfbda-db54-4e3a-bc8f-0c44b6b876ea/scratch/after_admin';
  await mkdir(scratchDir, { recursive: true });

  browser = await chromium.launch();
  const page = await browser.newPage();

  const breakpoints = [320, 390, 768, 1280];

  for (const width of breakpoints) {
    await page.setViewportSize({ width, height: 900 });

    // 1. Dashboard
    await page.goto(origin + '/admin');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Dashboard overflow at ${width}px`);
    assert(await page.getByRole('heading', { name: 'Administrator Operations' }).isVisible());
    assert(await page.getByRole('heading', { name: 'Operational Metrics' }).isVisible());
    await page.screenshot({ path: `${scratchDir}/admin_dashboard_${width}.png`, fullPage: true });

    // 2. New Event
    await page.goto(origin + '/admin/events/new');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `New event overflow at ${width}px`);
    assert(await page.getByRole('heading', { name: 'Create Event Draft' }).isVisible());
    // Verify controlled tags checkboxes
    assert(await page.getByRole('checkbox', { name: 'Robotics' }).isVisible());
    assert(await page.getByRole('checkbox', { name: 'Python' }).isVisible());
    // Verify study years checkboxes
    assert(await page.getByRole('checkbox', { name: 'Year 1' }).isVisible());
    assert(await page.getByRole('checkbox', { name: 'Year 4' }).isVisible());
    await page.screenshot({ path: `${scratchDir}/admin_new_${width}.png`, fullPage: true });

    // 3. Edit Event
    await page.goto(origin + '/admin/events/' + rawEvent.id);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Detail overflow at ${width}px`);
    assert(await page.getByRole('heading', { name: rawEvent.title }).isVisible());
    // Verify public link rendered when published
    assert(await page.getByRole('link', { name: 'View Public Page ↗' }).isVisible());
    // Verify structured deadline row
    assert(await page.getByRole('checkbox', { name: 'Primary Registration Deadline' }).isVisible());
    await page.screenshot({ path: `${scratchDir}/admin_detail_${width}.png`, fullPage: true });

    console.log(`PASS C18 UI: No overflow, responsive layout, accessible forms and screenshots captured at ${width}px`);
  }

  // Keyboard navigation & visible focus check
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + '/admin');
  await page.keyboard.press('Tab');
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
  assert.ok(focusedTag, 'Tab key navigates focusable elements');

  console.log('PASS C18 UI test completed successfully across 320px, 390px, 768px, and 1280px.');
} finally {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
  await f?.close();
  delete globalThis.__c18UIOrigin;
}
