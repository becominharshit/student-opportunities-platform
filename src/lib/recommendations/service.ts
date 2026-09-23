import "server-only";
import { resolveIdentity } from "../auth/identity";
import { uuid } from "../events/validation";
import { evaluateRecommendation } from "./scoring";
import type { Personalization } from "./types";
/** Identity is always resolved here; no user ID parameter and no service-role client. */
export async function recommendationForEvent(eventId:string,expectedVersion:number):Promise<Personalization> {
 try {
  const {client,user}=await resolveIdentity();
  if(!user)return {kind:"anonymous"};
  if(!uuid(eventId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)return {kind:"not_found"};
  const [profile,interests,skills,event]=await Promise.all([
   client.from("profiles").select("degree,study_year,institution,city,country,preferred_categories,any_category,preferred_modes,willingness_to_travel,preferred_team_min,preferred_team_max").eq("user_id",user.id).maybeSingle(),
   client.from("user_interests").select("interests(slug)").eq("user_id",user.id).limit(101),
   client.from("user_skills").select("skill_id").eq("user_id",user.id).limit(101),
   client.from("events").select("id,version,eligibility_rules,verification_status,last_checked_at,mode,city,country,individual_allowed,min_team_size,max_team_size,status,registration_status,event_categories(slug),event_tags(kind,tag,skill_id)").eq("id",eventId).eq("version",expectedVersion).eq("publication_status","published").maybeSingle(),
  ]);
  if([profile,interests,skills,event].some(r=>r.error))return {kind:"unavailable"};
  if(!event.data)return {kind:"not_found"};
  if(!profile.data)return {kind:"unavailable"};
  // A second read prevents evaluating a changed/unpublished event against the rendered version.
  const visible=await client.from("events").select("version").eq("id",eventId).eq("version",expectedVersion).eq("publication_status","published").maybeSingle();
  if(visible.error)return {kind:"unavailable"};if(!visible.data)return {kind:"not_found"};
  const result=evaluateRecommendation({...profile.data,interests:interests.data?.map(i=>i.interests?.slug).filter(Boolean),skills:skills.data?.map(s=>s.skill_id)}, {...event.data,category:event.data.event_categories?.slug??null,tags:event.data.event_tags});
  return {kind:"ready",result};
 }catch{return {kind:"unavailable"};}
}
