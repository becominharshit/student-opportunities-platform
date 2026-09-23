import { requireIdentity } from "@/lib/auth/identity";
import { readSaved } from "@/lib/saves/service";
import { SavedContent } from "@/components/saved-events";
export const dynamic="force-dynamic";
export const metadata={title:"Saved opportunities",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{after?:string|string[]}>}){await requireIdentity('/saved');const input=await searchParams;const after=typeof input.after==='string'?input.after:input.after===undefined?undefined:'invalid';return <SavedContent value={await readSaved(after)} after={after}/>;}
