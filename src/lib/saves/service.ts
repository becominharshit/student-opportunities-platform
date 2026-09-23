import "server-only";
import { resolveIdentity } from "../auth/identity";
import { cardFields,type PublicEventCard } from "../events/public";
import { uuid } from "../events/validation";
import { decodeCursor,encodeCursor } from "./cursor";
import type { SaveState } from "./policy";
export const SAVED_PAGE_SIZE=24;
export async function loadSaveState(eventIds:string[]):Promise<SaveState>{
 try{if(eventIds.length>100||eventIds.some(id=>!uuid(id)))return {kind:"unavailable"};const {client,user}=await resolveIdentity();if(!user)return {kind:"anonymous"};
 if(!eventIds.length)return {kind:"ready",ids:[]};
 const r=await client.from("saved_events").select("event_id").eq("user_id",user.id).in("event_id",eventIds).limit(100);
 return r.error?{kind:"unavailable"}:{kind:"ready",ids:r.data.map(x=>x.event_id)};
 }catch{return {kind:"unavailable"};}
}
export type SavedResult={kind:"anonymous"|"unavailable"|"invalid_cursor"}|{kind:"ready";items:PublicEventCard[];hasAny:boolean;nextCursor:string|null};
export async function readSaved(after?:string):Promise<SavedResult>{
 try{const {client,user}=await resolveIdentity();if(!user)return {kind:"anonymous"};const cursor=after===undefined?null:decodeCursor(after);if(after!==undefined&&!cursor)return {kind:"invalid_cursor"};
 let query=client.from("saved_events").select(`event_id,created_at,events!inner(${cardFields})`).eq("user_id",user.id).eq("events.publication_status","published").order("created_at",{ascending:false}).order("event_id",{ascending:false}).limit(SAVED_PAGE_SIZE+1);
 if(cursor)query=query.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},event_id.lt.${cursor.id})`);
 const [rows,any]=await Promise.all([query,client.from("saved_events").select("event_id").eq("user_id",user.id).limit(1)]);
 if(rows.error||any.error)return {kind:"unavailable"};
 const page=rows.data.slice(0,SAVED_PAGE_SIZE),ids=page.map(x=>x.event_id);
 // Explicit published recheck also applies to administrator accounts.
 const visible=ids.length?await client.from("events").select("id").in("id",ids).eq("publication_status","published").limit(SAVED_PAGE_SIZE):{data:[],error:null};
 if(visible.error)return {kind:"unavailable"};const publicIds=new Set(visible.data?.map(x=>x.id));
 const last=page.at(-1);
 return {kind:"ready",items:page.filter(x=>publicIds.has(x.event_id)).map(x=>x.events),hasAny:any.data.length>0,nextCursor:rows.data.length>SAVED_PAGE_SIZE&&last?encodeCursor(last.created_at,last.event_id):null};
 }catch{return {kind:"unavailable"};}
}
