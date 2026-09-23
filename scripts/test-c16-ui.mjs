import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chromium} from '@playwright/test';
import {NextRequest} from 'next/server.js';
import {fixture,A} from '../tests/saves/harness.mjs';
import {load,moduleUrl,profile,event} from '../tests/recommendations/harness.mjs';
import {loadComponents} from '../tests/events/c06-harness.mjs';
let f,browser,server;
try{
 f=await fixture();const components=await loadComponents();globalThis.__c16UI=components;globalThis.__c16UIClient=f.client;
 const publicModule=moduleUrl('export const DiscoveryShell=globalThis.__c16UI.DiscoveryShell;export const EventCard=globalThis.__c16UI.EventCard;');
 const link=moduleUrl(`import {createElement} from ${JSON.stringify(import.meta.resolve('react'))};export default function Link(props){return createElement('a',props);}`);
 const query=await import(await load('src/lib/events/explore-query.ts'));
 const {SearchExploreContent}=await import(await load('src/components/explore-search.tsx',{'./public-events':publicModule,'next/link':link,'@/lib/events/explore-query':await load('src/lib/events/explore-query.ts')}));
 const {ForYouContent}=await import(await load('src/components/for-you.tsx',{'./public-events':publicModule}));
 const {SavedContent}=await import(await load('src/components/saved-events.tsx',{'./public-events':publicModule}));
 const {EventPersonalization}=await import(await load('src/components/event-personalization.tsx'));
 const {rankCandidates}=await import(await load('src/lib/for-you/ranking.ts'));
 const {evaluateRecommendation}=await import(await load('src/lib/recommendations/scoring.ts'));
 const {savePost}=await import(await load('src/lib/saves/handler.ts',{'next/server':import.meta.resolve('next/server.js'),'../auth/config':moduleUrl('export const appOrigin=()=>globalThis.__c16UIOrigin;'),'../supabase/request':moduleUrl('export const createRequestSupabaseClient=()=>globalThis.__c16UIClient;')}));
 const detail=(await f.api.readPublishedEvent({id:f.id})).value;
 const css=(await Promise.all((await readdir('.next/static/chunks')).filter(n=>n.endsWith('.css')).map(n=>readFile('.next/static/chunks/'+n,'utf8')))).join('\n');
 server=createServer(async(req,res)=>{try{
  const origin=globalThis.__c16UIOrigin,url=new URL(req.url,origin);
  if(req.method==='POST'){const parts=[];for await(const p of req)parts.push(p);const response=await savePost(new NextRequest(url,{method:'POST',headers:req.headers,body:Buffer.concat(parts)}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
  f.setUser(url.searchParams.has('anon')?null:A);let view;
  const state=await f.service.loadSaveState([f.id]);
  if(url.pathname==='/login')view=createElement('h1',null,'Sign in');
  else if(url.pathname==='/saved')view=createElement(SavedContent,{value:await f.service.readSaved(url.searchParams.get('after')??undefined),after:url.searchParams.get('after')??undefined});
  else if(url.pathname==='/for-you')view=createElement(ForYouContent,{value:{kind:'ready',...rankCandidates(profile(),[{event:detail,facts:event()}]),hasPublished:true,candidateCount:1,missingSections:[]},saveState:state});
  else if(url.pathname.startsWith('/events/'))view=createElement(components.EventDetailContent,{event:detail,saveState:state,personalization:createElement(EventPersonalization,{value:state.kind==='anonymous'?{kind:'anonymous'}:{kind:'ready',result:evaluateRecommendation(profile(),event())}})});
  else view=createElement(SearchExploreContent,{filters:query.parseExploreQuery(Object.fromEntries(url.searchParams)).filters,warnings:[],items:[detail],nextCursor:null,saveState:state});
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>'+renderToStaticMarkup(view)+'</body></html>');
 }catch{res.statusCode=500;res.end('Isolated UI fixture failed');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;globalThis.__c16UIOrigin=origin;
 browser=await chromium.launch();const page=await browser.newPage();
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});
  for(const path of ['/explore?q=robotics&mode=online','/events/isolated-event-1','/for-you']){
   await page.goto(origin+path);const before=await page.getByText(/^Match: \d+%$/).allTextContents();
   await page.getByRole('button',{name:'Save opportunity',exact:true}).click();await page.getByRole('button',{name:'Saved — remove',exact:true}).waitFor();
   assert.equal(new URL(page.url()).pathname,new URL(origin+path).pathname);if(path.startsWith('/explore'))assert.equal(new URL(page.url()).search,'?q=robotics&mode=online');
   assert.equal(await page.getByRole('button',{name:'Saved — remove'}).getAttribute('aria-pressed'),'true');assert.deepEqual(await page.getByText(/^Match: \d+%$/).allTextContents(),before);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.goto(origin+'/saved');assert(await page.getByRole('heading',{name:detail.title,exact:true}).isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.getByRole('button',{name:'Saved — remove'}).click();await page.getByText("You haven't saved any opportunities yet.",{exact:true}).waitFor();
  }
  await page.goto(origin+'/saved?after=bad');assert(await page.getByText('This saved-page link is invalid.',{exact:true}).isVisible());
  console.log('PASS C16 all four surfaces, save/unsave, C12 return URL, unchanged match score and no overflow: '+width+'px');
 }
 await page.goto(origin+'/explore?anon=1');assert.equal(await page.getByRole('button',{name:'Save opportunity'}).count(),0);await page.getByRole('link',{name:'Sign in to save',exact:true}).click();assert.equal(new URL(page.url()).pathname,'/login');
 await page.goto(origin+'/events/isolated-event-1');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Skip to content');const button=page.getByRole('button',{name:'Save opportunity'});await button.focus();assert.notEqual(await button.evaluate(n=>getComputedStyle(n).outlineStyle),'none');await page.keyboard.press('Enter');await page.getByRole('button',{name:'Saved — remove'}).waitFor();
 await f.db.query("update public.events set publication_status='unpublished' where id=$1",[f.id]);await page.goto(origin+'/saved');assert(await page.getByText('No currently available saved opportunities.',{exact:true}).isVisible());assert(!(await page.textContent('body')).includes(detail.title));
 console.log('PASS C16 anonymous login, keyboard save/visible focus, invalid cursor recovery and hidden-event neutral state');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await f?.close();delete globalThis.__c16UI;delete globalThis.__c16UIClient;delete globalThis.__c16UIOrigin;}
