// C19 Pass A: actual local Next UI + clearly labeled isolated populated components.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chromium} from '@playwright/test';
import {searchFixtures} from '../tests/events/c12-harness.mjs';
import {loadComponents,moduleUrl} from '../tests/events/c06-harness.mjs';
const out='docs/c19-pass-a';const results=[];let child,browser,server,fixture;
const origin='http://localhost:3099';
async function checkOverflow(page,name,width){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: overflow at ${width}`);results.push(`${name}: no overflow ${width}`);}
try{
 await mkdir(out,{recursive:true});await mkdir('work/c19',{recursive:true});
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3099'],{stdio:'ignore',windowsHide:true});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,300));}assert.ok(ready,'production server ready');
 fixture=await searchFixtures();const {EventDetailContent}=await loadComponents();
 // Actual detail component rendered against an isolated database fixture.
 const {fixtures:detailFixtures}=await import('../tests/events/c06-harness.mjs');
 const detailFixture=await detailFixtures();
 const event=(await detailFixture.api.readPublishedEvent({slug:'isolated-event-1'})).value;
 const cssFiles=(await readdir('.next/static/chunks')).filter(x=>x.endsWith('.css'));const css=(await Promise.all(cssFiles.map(x=>readFile('.next/static/chunks/'+x,'utf8')))).join('\n');
 const first=(await fixture.search()).value;
 const html=element=>'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body><p style="padding:8px 16px;font:12px system-ui;border-bottom:1px solid">LOCAL SYNTHETIC FIXTURE — actual components, not hosted event data</p>'+renderToStaticMarkup(element)+'</body></html>';
 const require=createRequire(import.meta.url);
 async function componentModule(path){const compiled=Buffer.from(moduleUrl(await readFile(path,'utf8')).split(',')[1],'base64').toString().replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));return import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));}
 const {CatalogueLoading}=await componentModule('src/components/ui/catalogue-loading.tsx');const {default:ErrorPage}=await componentModule('src/app/error.tsx');
 const pages={
  '/loading':html(createElement(CatalogueLoading)),
  '/error':html(createElement(ErrorPage,{reset:()=>{}})),
  '/explore':html(createElement(fixture.ui.SearchExploreContent,{filters:fixture.query.parseExploreQuery({}).filters,warnings:[],items:first.items.slice(0,2),nextCursor:null})),
  '/detail':html(createElement(EventDetailContent,{event})),
 };
 server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pages[req.url]??pages['/detail']);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch();const page=await browser.newPage();const consoleErrors=[];page.on('pageerror',()=>consoleErrors.push('browser error'));
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:900});
  await page.goto(origin,{waitUntil:'networkidle'});await checkOverflow(page,'Home',width);
  if([390,1280].includes(width))await page.screenshot({path:`${out}/home-${width}.png`,fullPage:true});
  if(width<1024){
   const menu=page.locator('.mobile-navigation > summary');await menu.click();const dialog=page.locator('dialog:modal');await dialog.waitFor();assert.ok(await dialog.getByRole('link',{name:'Saved',exact:true}).isVisible());
   for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('dialog:modal')?.contains(document.activeElement)),'menu traps focus');}
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await menu.evaluate(x=>x===document.activeElement),true,'menu restores focus');
  }
  await page.goto(origin+'/explore',{waitUntil:'networkidle'});await checkOverflow(page,'Explore live',width);
  const trigger=page.locator('.filter-panel > summary');await trigger.click();
  await page.getByLabel('Participation mode',{exact:true}).waitFor({state:'visible'});await checkOverflow(page,'Explore expanded',width);
  if(width<1024){assert.equal(await page.locator('dialog:modal').count(),1);await page.getByLabel('Participation mode',{exact:true}).selectOption('online');await page.keyboard.press('Escape');assert.equal(await trigger.evaluate(x=>x===document.activeElement),true);assert.equal(new URL(page.url()).search,'','closing does not apply filters');await trigger.click();assert.equal(await page.getByLabel('Participation mode',{exact:true}).inputValue(),'online');}
  // Assert unchanged GET keys without requesting a mutation endpoint.
  const data=await page.locator('form[action="/explore"]').evaluate(f=>Object.fromEntries(new FormData(f)));
  for(const key of ['q','category','domain','mode','city','country','date_from','date_to','deadline_from','deadline_to','fee','team','year','degree','prize','registration','sort'])assert.ok(key in data,key+' preserved');
  await page.getByLabel('Participation mode',{exact:true}).selectOption('online');
  await page.getByRole('button',{name:'Apply filters',exact:true}).click();await page.waitForURL(u=>u.searchParams.get('mode')==='online');
  assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden','filter navigation restores scroll');
  await page.goto(origin+'/explore?after=invalid',{waitUntil:'networkidle'});assert.ok(await page.getByRole('heading',{name:/This page link is invalid/}).isVisible());
  await page.goto(origin+'/events/c19-missing',{waitUntil:'networkidle'});assert.ok(await page.getByRole('heading',{name:'Event not found'}).isVisible());await checkOverflow(page,'Not found',width);
  for(const [path,name] of [['/explore','explore'],['/detail','detail']]){
   await page.goto(local+path);await checkOverflow(page,name+' fixture',width);
   if(name==='explore')for(const card of await page.locator('article').all())assert.equal(await card.getByRole('link',{name:'View event',exact:true}).getAttribute('href'),await card.locator('.event-title-link').getAttribute('href'),'discovery CTA preserves canonical event route');
   if(name==='detail'&&width===1280){const hero=await page.locator('.detail-intro').boundingBox(),rail=await page.locator('.detail-rail').boundingBox();assert.ok(Math.abs(hero.y-rail.y)<2,'participation panel aligns with hero');}
   if([390,1280].includes(width))await page.screenshot({path:`${out}/${name}-${width}.png`,fullPage:true});
  }
  for(const path of ['/loading','/error']){await page.goto(local+path);await checkOverflow(page,path,width);assert.equal(await page.locator('main#main-content').count(),1);}
  console.log('PASS C19 actual UI and fixture layout '+width);
 }
 await page.setViewportSize({width:390,height:900});await page.goto(origin);await page.locator('.mobile-navigation > summary').click();await page.locator('dialog:modal').getByRole('link',{name:'Explore',exact:true}).click();await page.waitForURL(origin+'/explore');assert.equal(await page.locator('dialog:modal').count(),0);assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(origin+'/explore');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent().then(s=>s.trim()),'Skip to content');await page.keyboard.press('Enter');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('name'),'q');assert.notEqual(await page.locator(':focus').evaluate(x=>getComputedStyle(x).outlineStyle),'none');
 await page.locator('.filter-panel > summary').click();assert.equal(await page.locator('dialog:modal').evaluate(x=>getComputedStyle(x).animationName),'none');await page.keyboard.press('Escape');
 assert.equal(consoleErrors.length,0,'no browser runtime errors');
 await detailFixture.close();results.push('Menu/focus trap/Escape/focus restoration; filter close preserves unapplied input; GET keys unchanged; keyboard skip/focus; reduced motion; invalid cursor and not found passed.');
 await writeFile('work/c19/pass-a-ui.json',JSON.stringify({passed:true,results,screenshots:6},null,2));
 console.log('PASS C19 checks; exactly six representative screenshots.');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await fixture?.close();child?.kill();}
