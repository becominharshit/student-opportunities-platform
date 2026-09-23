import "server-only";
import { resolveIdentity } from "../auth/identity";
import { readOwnProfile } from "../profiles/service";
import { completeness } from "../profiles/validation";
import { cardFields } from "../events/public";
import { isObject,uuid } from "../events/validation";
import { CANDIDATE_LIMIT,rankCandidates } from "./ranking";
import type { ForYouResult } from "./ranking";
/** No caller-controlled identity or ranking parameters. Never uses the service role. */
export async function readForYou():Promise<ForYouResult>{
 try{
  const {client,user}=await resolveIdentity();if(!user)return {kind:"anonymous"};
  const [profile,rpc]=await Promise.all([readOwnProfile(client,user.id),client.rpc("for_you_candidates")]);
  if(!profile||rpc.error||!isObject(rpc.data)||typeof rpc.data.has_published!=="boolean"||!Array.isArray(rpc.data.items)||rpc.data.items.length>CANDIDATE_LIMIT)return {kind:"unavailable"};
  const ids=new Map<string,number>();
  for(const item of rpc.data.items){if(!isObject(item)||!uuid(item.id)||!Number.isSafeInteger(item.version)||Number(item.version)<1||ids.has(item.id as string))return {kind:"unavailable"};ids.set(item.id as string,Number(item.version));}
  const missingSections=completeness(profile.profile,profile.selectedInterests,profile.selectedSkills).groups.filter(g=>!g.complete).map(g=>g.name);
  if(!ids.size)return {kind:"ready",best:[],review:[],hasPublished:rpc.data.has_published,candidateCount:0,missingSections};
  const result=await client.from("events").select(`${cardFields},version,eligibility_rules,individual_allowed,min_team_size,max_team_size,event_tags(kind,tag,skill_id)`).in("id",[...ids.keys()]).eq("publication_status","published").limit(CANDIDATE_LIMIT);
  if(result.error)return {kind:"unavailable"};
  const visible=await client.from("events").select("id,version").in("id",[...ids.keys()]).eq("publication_status","published").limit(CANDIDATE_LIMIT);
  if(visible.error)return {kind:"unavailable"};
  const current=new Map(visible.data.map(e=>[e.id,e.version]));
  const candidates=result.data.filter(e=>ids.get(e.id)===e.version&&current.get(e.id)===e.version).map(e=>{
   const {eligibility_rules,individual_allowed,min_team_size,max_team_size,event_tags,version,...event}=e;
   void version;
   return {event,facts:{eligibility_rules,individual_allowed,min_team_size,max_team_size,tags:event_tags,verification_status:e.verification_status,last_checked_at:e.last_checked_at,mode:e.mode,city:e.city,country:e.country,category:e.event_categories?.slug??null,status:e.status,registration_status:e.registration_status}};
  });
  const facts={...profile.profile,interests:profile.interests.filter(i=>profile.selectedInterests.includes(i.id)).map(i=>i.slug),skills:profile.selectedSkills};
  return {kind:"ready",...rankCandidates(facts,candidates),hasPublished:rpc.data.has_published,candidateCount:candidates.length,missingSections};
 }catch{return {kind:"unavailable"};}
}
