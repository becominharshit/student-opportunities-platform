// Actual ProfileEditor SSR, production CSS and browser controls. Save behavior is
// exercised by handler/SQL tests and the hosted authenticated Next browser check.
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {createServer} from "node:http";
import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";
import {chromium} from "@playwright/test";
import ts from "typescript";
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replaceAll('"react"',JSON.stringify(import.meta.resolve('react')))).toString('base64');
const validation=compile(await readFile('src/lib/profiles/validation.ts','utf8'));
const router=compile('export const useRouter=()=>({refresh(){}});');
const source=(await readFile('src/components/profile-editor.tsx','utf8')).replace('"next/navigation"',JSON.stringify(router)).replace('"@/lib/profiles/validation"',JSON.stringify(validation));
const {ProfileEditor}=await import(compile(source));
const profile=Object.fromEntries(['name','city','country','institution','degree','study_year','preferred_categories','any_category','preferred_modes','willingness_to_travel','preferred_team_min','preferred_team_max','portfolio_links'].map(k=>[k,null]));
const data={profile,interests:[{id:'13000000-0000-0000-0000-000000000001',name:'Robotics',slug:'robotics'}],skills:[{id:'13000000-0000-0000-0000-000000000002',name:'Python',slug:'python'}],selectedInterests:[],selectedSkills:[]};
const css=(await Promise.all((await readdir('.next/static/chunks')).filter(f=>f.endsWith('.css')).map(f=>readFile('.next/static/chunks/'+f,'utf8')))).join('\n');
let server,browser;
try{
 server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>'+renderToStaticMarkup(createElement(ProfileEditor,{data,onboarding:req.url==='/onboarding'}))+'</body></html>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch();const page=await browser.newPage();const origin='http://127.0.0.1:'+server.address().port;
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});for(const route of ['/onboarding','/account/profile']){await page.goto(origin+route);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('form').count(),6);await page.getByLabel('Display or full name',{exact:true}).fill('Temporary student');await page.getByLabel('Robotics',{exact:true}).check();await page.getByLabel('Willing to travel',{exact:true}).selectOption('false');assert.ok(await page.getByRole('link',{name:'Skip remaining sections and explore'}).isVisible());}console.log('PASS C13 profile/onboarding controls and no overflow: '+width+'px');}
 await page.goto(origin+'/onboarding');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Skip to content');await page.keyboard.press('Enter');await page.getByLabel('Display or full name',{exact:true}).focus();await page.keyboard.type('Keyboard');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('name'),'city');assert.notEqual(await page.locator(':focus').evaluate(e=>getComputedStyle(e).outlineStyle),'none');assert.ok(await page.getByText('Profile: 0/5 sections complete').isVisible());
 console.log('PASS C13 keyboard navigation, labels, focus, optional sections and honest completeness');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
