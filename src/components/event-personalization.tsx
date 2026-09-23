import type { Personalization, RuleResult } from "@/lib/recommendations/types";
const labels={eligible:"Pass",ineligible:"Fail",unknown:"Unknown"};
function Rule({node}:{node:RuleResult}) {
 return <li className="space-y-2"><p><strong>{labels[node.state]}: </strong>{node.explanation.message}</p>{node.children.length>0&&<ul className="space-y-3 border-l border-border pl-3">{node.children.map(c=><Rule key={c.explanation.path} node={c}/>)}</ul>}</li>;
}
export function EventPersonalization({value}:{value:Personalization}) {
 if(value.kind==="anonymous")return <section className="mt-8 border-t border-border pt-6" aria-label="Eligibility and match"><h2 className="text-2xl font-semibold">Eligibility and match</h2><p className="mt-3"><a href="/login" className="underline">Sign in</a> and complete your profile to see eligibility and match information.</p></section>;
 if(value.kind!=="ready")return <section className="mt-8 border-t border-border pt-6" aria-label="Eligibility and match"><h2 className="text-2xl font-semibold">Eligibility and match</h2><p className="mt-3">Personalized information is temporarily unavailable. Public event facts remain available.</p></section>;
 const r=value.result;
 return <section aria-labelledby="personalized-heading" className="mt-8 space-y-4 break-words border-t border-border pt-6"><h2 id="personalized-heading" className="text-2xl font-semibold">Your eligibility and match</h2>
 <p className="text-lg font-semibold">{r.eligibility.state==="eligible"?"Appears eligible":r.eligibility.state==="ineligible"?"Appears ineligible":"Eligibility unknown"}</p>
 {r.score!==null&&<p className="text-xl font-semibold">Match: {r.score}%</p>}<p>{r.message}</p>
 <p>Evidence coverage: {Math.round(r.coverage*100)}% ({r.coverageLevel}). This is usable scoring evidence, not confidence in admission.</p>
 <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Eligibility reasons and alternatives</summary><ul className="mt-3 space-y-3"><Rule node={r.eligibility.tree}/></ul></details>
 <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Match components</summary><ul className="mt-3 space-y-3">{r.components.map(c=><li key={c.key}><strong>{({eligibility:"Eligibility",interests:"Interests",skills:"Skills",location:"Location / mode",academic_year:"Academic year",category:"Category",team:"Team preference"})[c.key]}: </strong>{c.value===null?"Unknown. ":""}{c.message}</li>)}</ul></details>
 <p className="text-sm">Official event rules remain authoritative. Preferences and selected skills are not proof of eligibility or competency.</p><a href="/account/profile" className="inline-flex min-h-11 items-center underline">Review or complete your profile</a>
 </section>;
}
