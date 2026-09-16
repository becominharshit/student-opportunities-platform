// Real Chromium rendering of the actual C06 components with isolated PostgreSQL fixtures.
// No hosted data or credentials are used by this script.
import assert from "node:assert/strict";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { fixtures, loadComponents } from "../tests/events/c06-harness.mjs";
let fixture, server, browser;
try {
  fixture = await fixtures();
  const { ExploreContent, EventDetailContent } = await loadComponents();
  const first = (await fixture.api.listPublishedEvents()).value;
  const second = (await fixture.api.listPublishedEvents({ after: first.nextCursor })).value;
  const detail = (await fixture.api.readPublishedEvent({ slug: "isolated-event-1" })).value;
  // Load the actual production Tailwind output, not a test imitation.
  const chunks = await readdir(".next/static/chunks");
  const css = (await Promise.all(chunks.filter(f => f.endsWith(".css")).map(f => readFile(".next/static/chunks/" + f, "utf8")))).join("\n");
  assert.ok(css.includes("--background"), "Build the application before browser checks");
  const page = component => '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>' + renderToStaticMarkup(component) + '</body></html>';
  server = createServer((request, response) => {
    let element;
    if (request.url.startsWith("/events/")) element = createElement(EventDetailContent, { event: detail });
    else if (request.url === "/empty") element = createElement(ExploreContent, { items: [], nextCursor: null });
    else element = createElement(ExploreContent, request.url.includes("after=") ? { ...second, after: first.nextCursor } : first);
    response.writeHead(200, {"Content-Type":"text/html; charset=utf-8"}); response.end(page(element));
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const tab = await context.newPage();
  await mkdir("work/c06", {recursive:true});
  for (const width of [320,390,768,1280]) {
    await tab.setViewportSize({width,height:900});
    for (const path of ["/explore","/events/isolated-event-1","/empty"]) {
      await tab.goto(origin+path);
      assert.equal(await tab.locator("h1").count(),1);
      assert.ok(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No horizontal overflow at ${width} on ${path}`);
      if (path.startsWith("/events")) {
        assert.equal(await tab.locator('time[datetime="2026-10-12"]').count(),1);
        const external=tab.getByRole("link",{name:/View official registration page/});
        assert.equal(await external.getAttribute("href"),detail.registration_url);
        assert.equal(await external.getAttribute("target"),"_blank");
      }
      if (width===390) await tab.screenshot({path:`work/c06/${path.startsWith("/events")?"detail":path.slice(1)}-mobile.png`,fullPage:true});
    }
    console.log(`PASS: C06 layout at ${width}px, Explore/detail/empty`);
  }
  await tab.goto(origin+"/explore");
  await tab.keyboard.press("Tab"); assert.equal(await tab.locator(":focus").textContent(),"Skip to content");
  await tab.keyboard.press("Enter");
  await tab.keyboard.press("Tab"); assert.match(await tab.locator(":focus").textContent(),/ISOLATED TEST event 1/);
  const focus = await tab.locator(":focus").evaluate(e=>({style:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth}));
  assert.notEqual(focus.style,"none"); assert.ok(parseFloat(focus.width)>=2);
  await tab.keyboard.press("Enter"); await tab.waitForURL("**/events/isolated-event-1");
  assert.equal(await tab.getByRole("heading",{level:1}).textContent(),detail.title);
  console.log("PASS: keyboard skip link, visible focus and event navigation");
  await tab.goto(origin+"/explore"); await tab.getByRole("link",{name:/Next opportunities/}).click();
  assert.equal(await tab.locator("article").count(),4);
  await tab.getByRole("link",{name:"Back to first page"}).click(); assert.equal(await tab.locator("article").count(),24);
  console.log("PASS: pagination links navigate both directions");
} finally {
  await browser?.close();
  if(server) await new Promise(resolve=>server.close(resolve));
  await fixture?.close();
}
