import "server-only";
import { evaluateRecommendation } from "../recommendations/scoring";
import type { PublicEventCard } from "../events/public";
import type { Recommendation } from "../recommendations/types";
export const CANDIDATE_LIMIT=100;
export type RankedCard={event:PublicEventCard;eligibility:Recommendation["eligibility"]["state"];score:number|null;coverage:number;coverageLevel:string;reasons:string[]};
export type Candidate={event:PublicEventCard;facts:unknown};
export function rankCandidates(profile:unknown,candidates:Candidate[]) {
 const best:RankedCard[]=[],review:RankedCard[]=[];
 if(candidates.length>CANDIDATE_LIMIT)throw Error("candidate_bound");
 for(const c of candidates){
  const r=evaluateRecommendation(profile,c.facts);
  if(r.eligibility.state==="ineligible"||["cancelled","completed"].includes(c.event.status)||c.event.registration_status==="closed"||r.exclusions.includes("malformed"))continue;
  const reasons=r.components.filter(x=>x.value!==null&&x.value>0).map(x=>x.message);
  if(r.eligibility.state==="unknown")reasons.unshift(...r.eligibility.explanations.filter(x=>x.state==="unknown"&&x.code!=="all"&&x.code!=="any").map(x=>x.message).slice(0,2));
  if(reasons.length<2)reasons.push(...r.components.filter(x=>x.value===null).map(x=>x.message).slice(0,2));
  const item={event:c.event,eligibility:r.eligibility.state,score:r.score,coverage:r.coverage,coverageLevel:r.coverageLevel,reasons:[...new Set(reasons)].slice(0,4)};
  if(r.recommendable&&r.score!==null)best.push(item);else review.push({...item,score:null});
 }
 const tie=(a:RankedCard,b:RankedCard)=>a.event.id<b.event.id?-1:a.event.id>b.event.id?1:0;
 best.sort((a,b)=>b.score!-a.score!||b.coverage-a.coverage||tie(a,b));
 review.sort((a,b)=>b.coverage-a.coverage||tie(a,b));
 return {best,review};
}
export type ForYouResult={kind:"anonymous"|"unavailable"}|{kind:"ready";best:RankedCard[];review:RankedCard[];hasPublished:boolean;candidateCount:number;missingSections:string[]};
