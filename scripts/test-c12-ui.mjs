// Isolated PostgreSQL + actual Explore server page + production CSS. No hosted writes.
import assert from "node:assert/strict";
import {readFile,readdir,mkdir} from "node:fs/promises";
import {createServer} from "node:http";
import {renderToStaticMarkup} from "react-dom/server";
import {chromium} from "@playwright/test";
import {searchFixtures} from "../tests/events/c12-harness.mjs";
let f,server,browser;
try {
 f=await searchFixtures();
 const chunks=await readdir(".next/static/chunks");
 const css=(await Promise.all(chunks.filter(x=>x.endsWith(".css")).map(x=>readFile(".next/static/chunks/"+x,"utf8")))).join("\n");
 assert.ok(css.includes("--background"));
 server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,"http://local"), params={};
   for(const key of new Set(url.searchParams.keys())){const v=url.searchParams.getAll(key);params[key]=v.length===1?v[0]:v;}
   const element=await f.route({searchParams:Promise.resolve(params)});
   res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});
   res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><a class="sr-only focus:not-sr-only" href="#main-content">Skip to content</a>'+renderToStaticMarkup(element)+'</body></html>');
  }catch(error){res.writeHead(500);res.end("Test server failed");console.error(error);}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin="http://127.0.0.1:"+server.address().port;
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 await mkdir("work/c12",{recursive:true});
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:900});await page.goto(origin+"/explore");
  await page.locator(".filter-panel > summary").click();
  await page.getByLabel("Participation mode",{exact:true}).waitFor({state:"visible"});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+" no horizontal overflow");
  await page.getByLabel("Participation mode",{exact:true}).selectOption("online");
  await page.getByLabel("Country code",{exact:true}).fill("IN");
  await page.getByRole("button",{name:"Apply filters",exact:true}).click();
  assert.equal(await page.locator("article").count(),1);assert.match(page.url(),/mode=online/);assert.match(page.url(),/country=IN/);
  await page.reload();assert.equal(await page.locator("article").count(),1);
  await page.locator(".filter-panel > summary").click();
  assert.equal(await page.getByLabel("Participation mode",{exact:true}).inputValue(),"online");
  if(width===390)await page.screenshot({path:"work/c12/filters-mobile.png",fullPage:true});
  await page.getByRole("link",{name:"Clear all filters",exact:true}).click();
  assert.equal(await page.locator("article").count(),24);
  await page.goBack();assert.equal(await page.locator("article").count(),1);
  await page.goForward();assert.equal(await page.locator("article").count(),24);
  console.log("PASS C12 responsive filters, submit, refresh and browser history: "+width+"px");
 }
 await page.goto(origin+"/explore");
 await page.keyboard.press("Tab");assert.equal(await page.locator(":focus").textContent(),"Skip to content");
 await page.keyboard.press("Enter");await page.keyboard.press("Tab");assert.equal(await page.locator(":focus").getAttribute("name"),"q");
 await page.keyboard.type("python");await page.keyboard.press("Enter");await page.waitForURL(/q=python/);assert.equal(await page.locator("article").count(),1);
 await page.locator(".filter-panel > summary").focus();await page.keyboard.press("Enter");
 assert.equal(await page.locator(".filter-panel").getAttribute("open"),"");
 await page.keyboard.press("Tab");assert.equal(await page.locator(":focus").getAttribute("name"),"category");
 const focus=await page.locator(":focus").evaluate(e=>({style:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth}));
 assert.notEqual(focus.style,"none");assert.ok(parseFloat(focus.width)>=2);
 console.log("PASS C12 keyboard search, disclosure, labelled controls and visible focus");
 await page.goto(origin+"/explore?q=organizer&sort=deadline");
 await page.getByRole("link",{name:/Next opportunities/}).click();
 assert.equal(await page.locator("article").count(),4);assert.match(page.url(),/q=organizer/);assert.match(page.url(),/sort=deadline/);
 await page.getByRole("link",{name:"Back to first page"}).click();assert.equal(await page.locator("article").count(),24);
 await page.goto(origin+"/explore?q=missingterm");
 assert.equal(await page.locator("article").count(),0);assert.ok(await page.getByRole("heading",{name:"No events match these filters"}).isVisible());
 await page.goto(origin+"/explore?mode=invalid&sort=match");
 assert.ok(await page.getByText(/Some unsupported or invalid query values/).isVisible());
 await page.goto(origin+"/explore?q=python&after=bad");
 assert.ok(await page.getByRole("heading",{name:/This page link is invalid/}).isVisible());
 await page.getByRole("link",{name:"Return to first results"}).click();assert.match(page.url(),/q=python/);
 console.log("PASS C12 URL pagination, empty/invalid states and cursor recovery");
} finally {
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await f?.close();
}
