import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chromium} from '@playwright/test';
import {fixtures,loadComponents,moduleUrl} from '../tests/events/c06-harness.mjs';
import {load,profile,event} from '../tests/recommendations/harness.mjs';
const {rankCandidates}=await import(await load('src/lib/for-you/ranking.ts'));
let f,browser,server;
try{
 f=await fixtures();const publicComponents=await loadComponents();globalThis.__c15UI=publicComponents;
 const publicModule=moduleUrl('export const DiscoveryShell=globalThis.__c15UI.DiscoveryShell;export const EventCard=globalThis.__c15UI.EventCard;');
 const {ForYouContent}=await import(await load('src/components/for-you.tsx',{'./public-events':publicModule}));
 const card=(await f.api.listPublishedEvents()).value.items[0];
 const complete={kind:'ready',...rankCandidates(profile(),[{event:card,facts:event()}]),hasPublished:true,candidateCount:1,missingSections:[]};
 const review={...complete,...rankCandidates(profile(),[{event:card,facts:{...event(),eligibility_rules:null}}])};
 const cases={best:complete,review,empty:{...complete,best:[],review:[],hasPublished:false,candidateCount:0},incomplete:{...review,missingSections:['Education','Skills']},none:{...complete,best:[],review:[]},unavailable:{kind:'unavailable'}};
 const css=(await Promise.all((await readdir('.next/static/chunks')).filter(n=>n.endsWith('.css')).map(n=>readFile('.next/static/chunks/'+n,'utf8')))).join('\n');
 server=createServer((req,res)=>{const key=new URL(req.url,'http://local').searchParams.get('case')??'best';res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>'+renderToStaticMarkup(createElement(ForYouContent,{value:cases[key]}))+'</body></html>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch();const page=await browser.newPage();
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});for(const key of Object.keys(cases)){
 await page.goto(origin+'/?case='+key);assert(await page.getByRole('heading',{name:'For You',exact:true,level:1}).isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(await page.getByText(/^Match: \d+%$/).count(),key==='best'?1:0);
 if(key==='best'){assert(await page.getByRole('heading',{name:'Best Matches'}).isVisible());assert(await page.getByText('Appears eligible',{exact:true}).isVisible());assert.equal(await page.getByRole('heading',{level:3}).count(),1);}
 if(key==='review')assert(await page.getByText('Eligibility unknown',{exact:true}).isVisible());
 if(key==='empty')assert(await page.getByText('No opportunities are available yet.',{exact:true}).isVisible());
 if(key==='none')assert(await page.getByText('No strong matches yet. Explore all opportunities.',{exact:true}).isVisible());
 if(key==='incomplete')assert(await page.getByText('Complete more of your profile to improve your recommendations.',{exact:true}).isVisible());
 }console.log('PASS C15 states, semantic headings and no overflow: '+width+'px');}
 await page.goto(origin+'/?case=best');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Skip to content');await page.keyboard.press('Enter');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('href'),'/events/'+card.slug);assert.notEqual(await page.locator(':focus').evaluate(n=>getComputedStyle(n).outlineStyle),'none');console.log('PASS C15 keyboard skip, event link and visible focus');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await f?.close();delete globalThis.__c15UI;}
