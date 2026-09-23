import {readFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import ts from "typescript";
export const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
export async function load(path,replacements={},cache=new Map()){
 path=resolve(path);if(cache.has(path))return cache.get(path);
 let code=ts.transpileModule((await readFile(path,'utf8')).replaceAll('import "server-only";',''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 for(const specifier of new Set([...code.matchAll(/from "([^"]+)"/g)].map(m=>m[1]))){
  const target=replacements[specifier]??(specifier.startsWith('.')?await load(resolve(dirname(path),specifier+'.ts'),replacements,cache):import.meta.resolve(specifier));
  code=code.replaceAll('"'+specifier+'"',JSON.stringify(target));
 }
 const url=moduleUrl(code);cache.set(path,url);return url;
}
export const skill='14000000-0000-0000-0000-000000000001';
export const skill2='14000000-0000-0000-0000-000000000002';
export const pred=(field,operator,value)=>({op:'predicate',field,operator,...(operator==='unrestricted'?{}:{value}),evidence:'ISOLATED rule reference'});
export const doc=expression=>({version:1,expression});
export const all=(...rules)=>({op:'all',rules});export const any=(...rules)=>({op:'any',rules});
export const facts=()=>({student_status:null,degree:'BTech',study_year:2,institution:'Example University',participation_country:'IN',team_size:null});
export const profile=()=>({degree:'BTech',study_year:2,institution:'Example University',country:'IN',city:'Pune',interests:['robotics'],skills:[skill],preferred_modes:['online'],any_category:false,preferred_categories:['hackathon'],willingness_to_travel:false,preferred_team_min:2,preferred_team_max:4});
export const event=()=>({eligibility_rules:doc(all(pred('degree','eq','BTech'),pred('study_year','in',[1,2,3]))),verification_status:'current',last_checked_at:'2026-09-22T12:00:00Z',mode:'online',city:null,country:null,category:'hackathon',individual_allowed:false,min_team_size:2,max_team_size:4,status:'scheduled',registration_status:'open',tags:[{kind:'domain',tag:'robotics',skill_id:null},{kind:'skill',tag:'python',skill_id:skill}]});
