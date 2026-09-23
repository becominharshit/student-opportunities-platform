import { loadSaveState } from "@/lib/saves/service";
import { requireIdentity } from "@/lib/auth/identity";
import { readForYou } from "@/lib/for-you/service";
import { ForYouContent } from "@/components/for-you";
export const dynamic="force-dynamic";
export const metadata={title:"For You | Student Opportunities",robots:{index:false,follow:false}};
export default async function Page(){await requireIdentity("/for-you");const value=await readForYou();const state=await loadSaveState(value.kind==="ready"?[...value.best,...value.review].map(i=>i.event.id):[]);return <ForYouContent value={value} saveState={state}/>;}
