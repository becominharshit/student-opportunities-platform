import "server-only";
import { validEligibility, isObject } from "../events/validation";
import { explain } from "./explanations";
import type { EligibilityResult, RuleResult, State, StudentFacts, Field } from "./types";
export function combine(op: "all"|"any", states: State[]): State {
 if (!states.length) return "unknown";
 return op === "all" ? states.includes("ineligible") ? "ineligible" : states.every(s=>s==="eligible") ? "eligible" : "unknown"
 : states.includes("eligible") ? "eligible" : states.every(s=>s==="ineligible") ? "ineligible" : "unknown";
}
export function unknownEligibility(code="invalid_rules"): EligibilityResult {
 const explanation=explain("unknown",code,"root");return {state:"unknown",tree:{state:"unknown",op:"unresolved",explanation,children:[]},explanations:[explanation]};
}
export function evaluateEligibility(document: unknown, facts: StudentFacts, evidenceCurrent=true): EligibilityResult {
 if (document == null) return unknownEligibility("missing_rules");
 if (!evidenceCurrent) return unknownEligibility("stale_evidence");
 try {
  // Preserve C03's depth-12 / 16KiB limits, including the extra level for IN values.
  // Extra count bound protects the evaluator from pathological wide documents.
  if (Buffer.byteLength(JSON.stringify(document),"utf8")>16384 || !validEligibility(document)) return unknownEligibility();
  let visited=0;
  function visit(n: unknown,path: string,depth: number): RuleResult {
   if (++visited>1024 || depth>12 || !isObject(n)) throw Error("bounded_rule");
   if(n.op==="all"||n.op==="any"){
    const children=(n.rules as unknown[]).map((c,i)=>visit(c,`${path}.${i}`,depth+1));const state=combine(n.op,children.map(c=>c.state));
    return {state,op:n.op,children,explanation:explain(state,n.op,path)};
   }
   if(n.op==="unresolved")return {state:"unknown",op:"unresolved",children:[],explanation:explain("unknown","unresolved",path)};
   const field=n.field as Field;
   let state: State="unknown",code="missing_fact";
   if(n.operator==="unrestricted"){state="eligible";code="unrestricted";}
   else {
    const actual=facts[field];
    const valid=field==="student_status" ? typeof actual==="boolean" : ["study_year","team_size"].includes(field) ? Number.isSafeInteger(actual)&&Number(actual)>0 : typeof actual==="string"&&actual.trim().length>0&&(field!=="participation_country"||/^[A-Z]{2}$/.test(actual));
    if(valid){
     const equal=(v:unknown)=>typeof actual==="string"&&typeof v==="string" ? actual.trim().toLowerCase()===v.trim().toLowerCase() : actual===v;
     const pass=n.operator==="in" ? (n.value as unknown[]).some(equal) : n.operator==="eq" ? equal(n.value) : n.operator==="gte" ? Number(actual)>=Number(n.value) : Number(actual)<=Number(n.value);
     state=pass?"eligible":"ineligible";code=pass?"pass":"fail";
    }
   }
   return {state,op:"predicate",children:[],explanation:explain(state,code,path,field)};
  }
  const tree=visit((document as {expression:unknown}).expression,"root",0);
  const explanations: EligibilityResult["explanations"]=[];
  function flatten(n:RuleResult){explanations.push(n.explanation);n.children.forEach(flatten);}flatten(tree);
  return {state:tree.state,tree,explanations};
 }catch{return unknownEligibility();}
}
/** Year credit respects known OR alternatives; a branch without year evidence is not unrestricted. */
export function academicYearState(tree:RuleResult): State | null {
 if(tree.op==="predicate")return tree.explanation.field==="study_year" ? tree.state : null;
 if(tree.op==="unresolved")return null;
 if(tree.op==="any"){
  const satisfied=tree.children.filter(c=>c.state==="eligible");
  if(!satisfied.length)return "unknown";
  const values=satisfied.map(academicYearState);
  return values.every(v=>v==="eligible")?"eligible":"unknown";
 }
 const values=tree.children.map(academicYearState).filter((v):v is State=>v!==null);
 return values.length?combine("all",values):null;
}
