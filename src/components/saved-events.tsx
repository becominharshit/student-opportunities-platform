import { DiscoveryShell,EventCard } from "./public-events";
import type { SavedResult } from "../lib/saves/service";
export function SavedContent({value,after}:{value:SavedResult;after?:string}){
 return <DiscoveryShell authenticated><h1 className="text-4xl font-semibold">Saved opportunities</h1><p className="mt-4">Your bookmarks are private. Most recently saved first; this is not recommendation order.</p>
 {value.kind==='invalid_cursor'?<section className="mt-8"><h2 className="text-2xl font-semibold">This saved-page link is invalid.</h2><a href="/saved" className="inline-flex min-h-11 items-center underline">Return to first saved page</a></section>:value.kind!=='ready'?<p className="mt-8">Saved opportunities are temporarily unavailable. Please retry.</p>:<>
 {value.items.length?<ul className="mt-6 grid gap-8 md:grid-cols-2">{value.items.map(event=><li className="min-w-0" key={event.id}><EventCard event={event} saveState={{kind:'ready',ids:value.items.map(e=>e.id)}} returnTo={'/saved'+(after?'?after='+encodeURIComponent(after):'')}/></li>)}</ul>:<section className="my-10"><h2 className="text-2xl font-semibold">{value.hasAny?'No currently available saved opportunities.':"You haven't saved any opportunities yet."}</h2></section>}
 <nav aria-label="Saved pages" className="mt-8 flex flex-wrap gap-6 underline">{after&&<a href="/saved">Back to first saved page</a>}{value.nextCursor&&<a href={'/saved?after='+encodeURIComponent(value.nextCursor)} rel="next">Next saved opportunities</a>}</nav></>}
 <nav aria-label="Saved actions" className="mt-8 flex flex-wrap gap-6 underline"><a href="/explore">Explore opportunities</a><a href="/for-you">For You</a><a href="/account">Account</a></nav></DiscoveryShell>;
}
