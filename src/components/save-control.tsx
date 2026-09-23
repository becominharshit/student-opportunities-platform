import type { SaveState } from "../lib/saves/policy";
export function SaveControl({eventId,state={kind:"anonymous"},returnTo="/saved"}:{eventId:string;state?:SaveState;returnTo?:string}){
 if(state.kind==='anonymous')return <a href={'/login?next='+encodeURIComponent(returnTo)} className="mt-4 inline-flex min-h-11 items-center underline">Sign in to save</a>;
 if(state.kind==='unavailable')return <p className="mt-4 text-sm">Bookmark status unavailable. Please reload to retry.</p>;
 const saved=state.ids.includes(eventId);
 return <form method="post" action="/saved/mutate" className="mt-4"><input type="hidden" name="event_id" value={eventId}/><input type="hidden" name="operation" value={saved?'unsave':'save'}/><input type="hidden" name="return_to" value={returnTo}/><button type="submit" aria-pressed={saved} className="min-h-11 rounded-md border border-border px-4 py-2 font-semibold">{saved?'Saved — remove':'Save opportunity'}</button></form>;
}
