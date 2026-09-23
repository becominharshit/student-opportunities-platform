import { parseExploreQuery,exploreUrl } from "../events/explore-query";
export function saveDestination(value:unknown):string {
 if(typeof value!=="string"||value.length>2048||/[\\\u0000-\u001f\u007f]/.test(value))return "/saved";
 try{
  const url=new URL(value,"https://internal.invalid");
  if(!value.startsWith("/")||url.origin!=="https://internal.invalid"||value.startsWith("//")||url.hash)return "/saved";
  if(url.pathname==="/for-you"&&!url.search)return "/for-you";
  if(/^\/events\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)&&!url.search)return url.pathname;
  if(url.pathname==="/explore"){
   const input:Record<string,string|string[]>={};for(const key of url.searchParams.keys()){const values=url.searchParams.getAll(key);input[key]=values.length===1?values[0]:values;}
   const {filters,after}=parseExploreQuery(input);return exploreUrl(filters,after&&/^[A-Za-z0-9_-]{1,1024}$/.test(after)?after:undefined);
  }
  if(url.pathname==="/saved"){const after=url.searchParams.get('after');return after&&/^[A-Za-z0-9_-]{1,512}$/.test(after)?'/saved?after='+after:'/saved';}
 }catch{}
 return "/saved";
}
export type SaveState={kind:"anonymous"}|{kind:"unavailable"}|{kind:"ready";ids:string[]};
