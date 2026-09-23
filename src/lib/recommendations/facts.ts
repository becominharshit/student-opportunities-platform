import "server-only";
import type { ProfileFacts, EventFacts } from "./types";
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const bad=():never=>{throw Error("malformed_facts");};
const text=(v:unknown,max=200)=>v==null?null:typeof v==="string"&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)?v.trim():bad();
const int=(v:unknown,max=2147483647)=>v==null?null:Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=max?Number(v):bad();
const bool=(v:unknown)=>v==null?null:typeof v==="boolean"?v:bad();
const list=(v:unknown,allowed?:string[])=>{if(v==null)return null;if(!Array.isArray(v)||v.length>100)return bad();const xs=v.map(x=>text(x,100)??bad());if(allowed&&xs.some(x=>!allowed.includes(x)))return bad();return [...new Set(xs)];};
const choice=(v:unknown,allowed:string[])=>{const x=text(v);return x===null||allowed.includes(x)?x:bad();};
const country=(v:unknown)=>{const x=text(v,2);return x===null||/^[A-Z]{2}$/.test(x)?x:bad();};
const cats=["hackathon","coding_competition","workshop","conference","student_technology_event"],modes=["online","offline","hybrid"];
export function normalizeProfile(raw:unknown):ProfileFacts {
 if(!object(raw))return bad();
 const p={degree:text(raw.degree,100),study_year:int(raw.study_year,20),institution:text(raw.institution),city:text(raw.city,100),country:country(raw.country),interests:list(raw.interests),skills:list(raw.skills),preferred_categories:list(raw.preferred_categories,cats),any_category:bool(raw.any_category),preferred_modes:list(raw.preferred_modes,modes),willingness_to_travel:bool(raw.willingness_to_travel),preferred_team_min:int(raw.preferred_team_min,100),preferred_team_max:int(raw.preferred_team_max,100)};
 if(p.preferred_team_min!==null&&p.preferred_team_max!==null&&p.preferred_team_min>p.preferred_team_max || p.any_category===true&&p.preferred_categories?.length)return bad();
 if(p.skills?.some(s=>!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s)))return bad();
 return p;
}
export function normalizeEvent(raw:unknown):EventFacts {
 if(!object(raw))return bad();
 let tags:EventFacts["tags"]=null;
 if(raw.tags!=null){if(!Array.isArray(raw.tags)||raw.tags.length>100)return bad();tags=raw.tags.map(t=>{if(!object(t)||!["skill","domain"].includes(String(t.kind)))return bad();const skill_id=text(t.skill_id,36);if(t.kind==="domain"&&skill_id!==null)return bad();if(t.kind==="skill"&&(!skill_id||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(skill_id)))return bad();return {kind:t.kind as "skill"|"domain",tag:text(t.tag,100)??bad(),skill_id};});}
 const e={eligibility_rules:raw.eligibility_rules,verification_status:choice(raw.verification_status,["pending","current","stale","conflicted","rejected"]),last_checked_at:text(raw.last_checked_at,64),mode:choice(raw.mode,modes),city:text(raw.city,100),country:country(raw.country),category:choice(raw.category,cats),individual_allowed:bool(raw.individual_allowed),min_team_size:int(raw.min_team_size),max_team_size:int(raw.max_team_size),status:choice(raw.status,["announced","scheduled","ongoing","completed","postponed","cancelled","unknown"]),registration_status:choice(raw.registration_status,["not_open","open","closed","unknown"]),tags};
 if(e.min_team_size!==null&&e.max_team_size!==null&&e.min_team_size>e.max_team_size)return bad();
 return e;
}
