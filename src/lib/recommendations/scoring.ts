import "server-only";
import { evaluateEligibility, academicYearState, unknownEligibility } from "./eligibility";
import { normalizeEvent, normalizeProfile } from "./facts";
import type { Component, ComponentKey, ProfileFacts, EventFacts, Recommendation } from "./types";
export const WEIGHTS={eligibility:25,interests:25,skills:15,location:10,academic_year:10,category:10,team:5} as const;
export const MIN_COVERAGE=0.75;
// Identity mappings only: no fuzzy names, degree equivalence or inferred topic aliases.
export const DOMAIN_TO_INTEREST:Readonly<Record<string,string>>=Object.freeze(Object.fromEntries(["ai-ml","web-development","app-development","cybersecurity","robotics","data-science","open-source","cloud","blockchain","entrepreneurship","product","design"].map(x=>[x,x])));
function component(key:ComponentKey,value:number|null,code:string,message:string):Component{return {key,weight:WEIGHTS[key],value,earned:value===null?null:WEIGHTS[key]*value,code,message};}
function location(p:ProfileFacts,e:EventFacts):number|null {
 if(!p.preferred_modes?.length||!e.mode)return null;
 const prefs=new Set(p.preferred_modes.flatMap(m=>m==="hybrid"?["online","offline"]:[m]));
 const online=()=>prefs.has("online")?1:0.5;
 const offline=()=>{
  if(!e.city||!e.country)return null;
  const same=p.city!==null&&p.country!==null&&p.city.toLowerCase()===e.city.toLowerCase()&&p.country===e.country;
  if(same||p.willingness_to_travel===true)return prefs.has("offline")?1:0.5;
  if(p.city===null||p.country===null||p.willingness_to_travel===null)return null;
  return 0;
 };
 if(e.mode==="online")return online();if(e.mode==="offline")return offline();
 const a=online(),b=offline();return a===1||b===1?1:b===null?null:Math.max(a,b);
}
function team(p:ProfileFacts,e:EventFacts):number|null {
 const lo=p.preferred_team_min,hi=p.preferred_team_max;
 if(lo===null||hi===null)return null;
 if(lo===1&&e.individual_allowed===true)return 1;
 if(hi===1&&e.individual_allowed===false)return 0;
 if(e.min_team_size===null||e.max_team_size===null)return null;
 if(Math.max(lo,e.min_team_size)<=Math.min(hi,e.max_team_size))return 1;
 if(lo===1&&e.individual_allowed===null)return null;
 return 0;
}
export function evaluateRecommendation(profile:unknown,event:unknown):Recommendation {
 let p:ProfileFacts,e:EventFacts;
 try{p=normalizeProfile(profile);e=normalizeEvent(event);}catch{
  return {version:"deterministic-v1",eligibility:unknownEligibility("malformed"),components:(Object.keys(WEIGHTS) as ComponentKey[]).map(k=>component(k,null,"malformed","Data cannot be evaluated safely.")),score:null,coverage:0,coverageLevel:"low",knownWeight:0,earnedWeight:0,recommendable:false,exclusions:["malformed"],message:"Not enough valid information to calculate a reliable match."};
 }
 const current=e.verification_status==="current"&&e.last_checked_at!==null&&/T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(e.last_checked_at)&&Number.isFinite(Date.parse(e.last_checked_at));
 const eligibility=evaluateEligibility(e.eligibility_rules,{degree:p.degree,study_year:p.study_year,institution:p.institution,participation_country:p.country,student_status:null,team_size:null},current);
 const parts:Component[]=[];
 parts.push(component("eligibility",eligibility.state==="eligible"?1:eligibility.state==="ineligible"?0:null,"eligibility_"+eligibility.state,eligibility.state==="eligible"?"All structured eligibility requirements appear satisfied.":eligibility.state==="ineligible"?"A required condition fails after respecting alternatives.":"Eligibility evidence is incomplete; no eligibility credit is assigned."));
 const domains=[...new Set(e.tags?.filter(t=>t.kind==="domain").map(t=>t.tag.trim().toLowerCase())??[])];
 const mapped=domains.map(t=>Object.hasOwn(DOMAIN_TO_INTEREST,t)?DOMAIN_TO_INTEREST[t]:undefined);
 const interests=current&&mapped.length&&p.interests?.length&&mapped.every(Boolean)?mapped.filter(t=>p.interests!.includes(t!)).length/mapped.length:null;
 parts.push(component("interests",interests,interests===null?"interests_unknown":"interest_overlap",interests===null?"Known event topics and recorded interests are needed; unmapped topics remain unknown.":`${mapped.filter(t=>p.interests!.includes(t!)).length} of ${mapped.length} explicitly mapped event topics overlap your interests.`));
 const eventSkills=[...new Set(e.tags?.filter(t=>t.kind==="skill").map(t=>t.skill_id!)??[])];
 const skills=current&&eventSkills.length&&p.skills?.length?eventSkills.filter(s=>p.skills!.includes(s)).length/eventSkills.length:null;
 parts.push(component("skills",skills,skills===null?"skills_unknown":"skill_overlap",skills===null?"Known event skill tags and recorded skills are needed. Missing tags do not mean no skills are needed.":`${eventSkills.filter(s=>p.skills!.includes(s)).length} of ${eventSkills.length} controlled event skills overlap your selections; this does not verify competency.`));
 const loc=current?location(p,e):null;
 parts.push(component("location",loc,loc===null?"location_unknown":"location_preference",loc===null?"Mode preferences or participation location/travel facts are missing.":loc===1?"A stated participation route matches your mode and location/travel preferences.":loc===0.5?"A stated participation route is available but differs from your preferred mode.":"No known participation route matches your recorded location and travel preferences."));
 const year=current?academicYearState(eligibility.tree):null;
 parts.push(component("academic_year",year==="eligible"?1:year==="ineligible"?0:null,"year_"+(year??"unknown"),year==="eligible"?"Your study year meets the relevant structured year rule or it is explicitly unrestricted.":year==="ineligible"?"Your study year is excluded by a structured year rule.":"A relevant structured year requirement or your study year is missing or conditional."));
 const category=current&&e.category&&(p.any_category===true||p.preferred_categories?.length)?p.any_category===true||p.preferred_categories!.includes(e.category)?1:0:null;
 parts.push(component("category",category,category===null?"category_unknown":"category_preference",category===null?"An event category and an explicit category preference are needed.":category===1?"The event category matches your explicit preference.":"The event category differs from your recorded preferences."));
 const t=current?team(p,e):null;
 parts.push(component("team",t,t===null?"team_unknown":"team_preference",t===null?"Known team options and both preference bounds are needed; a missing maximum is not unlimited.":t===1?"A known team-size option overlaps your preference. This does not establish your actual team size.":"Known team-size options do not overlap your preference."));
 const knownWeight=parts.reduce((s,c)=>s+(c.value===null?0:c.weight),0),earnedWeight=parts.reduce((s,c)=>s+(c.earned??0),0),coverage=knownWeight/100;
 const exclusions:string[]=[];
 if(eligibility.state!=="eligible")exclusions.push("eligibility_"+eligibility.state);
 if(coverage<MIN_COVERAGE)exclusions.push("low_coverage");
 if(e.status==="cancelled"||e.status==="completed")exclusions.push("event_"+e.status);
 if(e.registration_status==="closed")exclusions.push("registration_closed");
 const score=exclusions.length===0?Math.round(100*earnedWeight/knownWeight):null;
 return {version:"deterministic-v1",eligibility,components:parts,score,coverage,coverageLevel:coverage>=0.75?"high":coverage>=0.5?"medium":"low",knownWeight,earnedWeight,recommendable:score!==null,exclusions,message:eligibility.state==="ineligible"?"This event is not recommended because a required condition fails. You can still view its facts.":eligibility.state==="unknown"?"Eligibility needs confirmation. No headline match score is shown.":coverage<MIN_COVERAGE?"Not enough information to calculate a reliable match.":score===null?"This event is not currently a recommendation because it is cancelled, completed or registration is closed.":"Match measures recorded relevance, not admission chances or organizer approval."};
}
