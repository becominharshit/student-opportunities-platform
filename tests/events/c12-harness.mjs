import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { fixtures, fixtureId, moduleUrl, loadComponents } from "./c06-harness.mjs";
const require = createRequire(import.meta.url);
export async function searchFixtures() {
  const base = await fixtures();
  const db = base.db;
  // Isolated fixture setup only: hold creation timestamps constant for tie tests.
  await db.exec(`alter table public.events disable trigger event_version;
    update public.events set created_at='2026-09-01T12:34:56.123456Z';
    update public.events set mode='online',country='IN',city='Pune',fee_status='free',min_team_size=2,max_team_size=4,eligible_years='{1,2}',eligible_degrees='{BTech}',prize_pool=100,prize_currency='INR',registration_status='open' where id='${fixtureId(1)}';
    update public.events set title='Quantum research sprint', short_description='Build neural systems',mode='offline',country='US',city='Boston',fee_status='paid',fee=20,currency='USD',individual_allowed=false,prize_pool=0,prize_currency='USD',registration_status='closed',start_date='2026-11-01',created_at='2026-09-02T12:34:56.123456Z' where id='${fixtureId(2)}';
    update public.events set individual_allowed=true,mode='hybrid',fee_status='varies',registration_status='not_open',prize_description='Equipment award' where id='${fixtureId(3)}';
    insert into public.skills(id,slug,name) values('60000000-0000-0000-0000-000000000001','python','Python');
    insert into public.event_tags(event_id,tag,kind,skill_id) values('${fixtureId(2)}','python','skill','60000000-0000-0000-0000-000000000001');
    update public.events set category_id=(select id from public.event_categories where slug='workshop') where id='${fixtureId(2)}';
    insert into public.event_deadlines(event_id,kind,label,precision,local_date,active,is_primary) values('${fixtureId(2)}','registration','Apply','date_only','2026-10-20',true,true);
  `);
  await db.exec("alter table public.events enable trigger event_version");
  const queryUrl = moduleUrl(await readFile(new URL("../../src/lib/events/explore-query.ts",import.meta.url),"utf8"));
  const query = await import(queryUrl);
  globalThis.__c12RPC = async (name,args) => {
    if(name!=="search_published_events") throw Error("Unexpected RPC");
    await db.exec("set role anon");
    try { return {data:(await db.query("select public.search_published_events($1::jsonb,$2::jsonb) data",[JSON.stringify(args.filters),args.page_after===null?null:JSON.stringify(args.page_after)])).rows[0].data,error:null}; }
    catch(error) { return {data:null,error:{message:error.message}}; }
    finally {await db.exec("reset role");}
  };
  const publicUrl = moduleUrl("export const PUBLIC_PAGE_SIZE=24; export const publicClient=()=>({rpc:(...args)=>globalThis.__c12RPC(...args)});");
  let source=await readFile(new URL("../../src/lib/events/public-search.ts",import.meta.url),"utf8");
  source=source.replace('import "server-only";',"").replace('"./public"',JSON.stringify(publicUrl)).replace('"./explore-query"',JSON.stringify(queryUrl));
  const apiUrl=moduleUrl(source);
  const api=await import(apiUrl);
  const components=await loadComponents();
  globalThis.__c12Components=components;
  const componentsUrl=moduleUrl("export const DiscoveryShell=globalThis.__c12Components.DiscoveryShell; export const EventCard=globalThis.__c12Components.EventCard;");
  const linkUrl=moduleUrl(`import {createElement} from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)}; export default function Link(props){return createElement("a",props);}`);
  function compileJSX(source) {
    const compiled=Buffer.from(moduleUrl(source).split(",")[1],"base64").toString().replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href));
    return "data:text/javascript;base64,"+Buffer.from(compiled).toString("base64");
  }
  let ui=await readFile(new URL("../../src/components/explore-search.tsx",import.meta.url),"utf8");
  ui=ui.replace('"./public-events"',JSON.stringify(componentsUrl)).replace('"@/lib/events/explore-query"',JSON.stringify(queryUrl)).replace('"next/link"',JSON.stringify(linkUrl));
  const uiUrl=compileJSX(ui);
  let route=await readFile(new URL("../../src/app/explore/page.tsx",import.meta.url),"utf8");
  route=route.replace('"@/components/explore-search"',JSON.stringify(uiUrl)).replace('"@/lib/events/explore-query"',JSON.stringify(queryUrl)).replace('"@/lib/events/public-search"',JSON.stringify(apiUrl));
  return {...base,query,api,ui:await import(uiUrl),route:(await import(compileJSX(route))).default,
    search:async(input={},after)=>api.searchPublishedEvents(query.parseExploreQuery(input).filters,after),
    close:async()=>{delete globalThis.__c12RPC;delete globalThis.__c12Components;await base.close();}};
}
export {fixtureId};
