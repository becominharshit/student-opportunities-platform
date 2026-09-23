"use client";
import { useState, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProfileData } from "@/lib/profiles/service";
import { categories, modes, completeness, type Section } from "@/lib/profiles/validation";
const control = "block min-h-11 w-full rounded border border-border bg-background px-3 py-2";
function SectionForm({ section, title, children }: { section: Section; title: string; children: ReactNode }) {
  const [message,setMessage] = useState(""); const [failed,setFailed] = useState(false); const [pending,setPending] = useState(false); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const body = new URLSearchParams(); new FormData(event.currentTarget).forEach((v,k) => { if (typeof v === "string") body.append(k,v); });
    setPending(true); setMessage("");
    try {
      const response = await fetch("/account/profile/save", { method: "POST", body, redirect: "error" });
      const result = await response.json();
      if (!response.ok || result.ok !== true) { setFailed(true); setMessage(typeof result.message === "string" ? result.message : "Unable to save. Please try again."); }
      else { setFailed(false); setMessage("Saved. You can return to this section at any time."); router.refresh(); }
    } catch { setFailed(true); setMessage("Unable to save. Your entries are still here; please try again."); }
    finally { setPending(false); }
  }
  return <section id={section} className="scroll-mt-6 border-t border-border py-6"><h2 className="mb-4 text-xl font-semibold">{title}</h2><form method="post" action="/account/profile/save" onSubmit={submit} className="space-y-4" aria-label={title}>
    <input type="hidden" name="section" value={section}/><fieldset disabled={pending} className="space-y-4"><legend className="sr-only">{title}</legend>{children}</fieldset>
    <button disabled={pending} className="min-h-11 rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60" type="submit">{pending ? "SavingÃ¢â‚¬Â¦" : "Save " + title.toLowerCase()}</button>
    <p role={failed ? "alert" : "status"} aria-live="polite">{message}</p>
  </form></section>;
}
function Field({name,label,value,max=100,type="text"}: {name:string;label:string;value:string|number|null;max?:number;type?:string}) {
 return <label className="block space-y-2">{label}<input className={control} name={name} type={type} defaultValue={value ?? ""} maxLength={type === "number" ? undefined : max} min={type === "number" ? 1 : undefined} max={type === "number" ? max : undefined} step={type === "number" ? 1 : undefined}/></label>;
}
function Choices({name,label,choices,selected}: {name:string;label:string;choices:Record<string,string>;selected:string[]|null}) {
 return <fieldset><legend className="mb-2 font-medium">{label}</legend><div className="grid gap-1 sm:grid-cols-2">{Object.entries(choices).map(([id,text]) => <label key={id} className="flex min-h-11 items-center gap-3 rounded border border-border px-3 py-2"><input name={name} type="checkbox" value={id} defaultChecked={selected?.includes(id) ?? false}/>{text}</label>)}</div></fieldset>;
}
function BooleanChoice({name,label,value}: {name:string;label:string;value:boolean|null}) { return <div className="space-y-2"><label htmlFor={name}>{label}</label><select id={name} className={control} name={name} defaultValue={value === null ? "" : String(value)}><option value="">Not specified</option><option value="true">Yes</option><option value="false">No</option></select></div>; }
export function ProfileEditor({data,onboarding=false}: {data:ProfileData;onboarding?:boolean}) {
 const p=data.profile, progress=completeness(p,data.selectedInterests,data.selectedSkills);
 return <main id="main-content" className="mx-auto max-w-3xl space-y-5 px-5 py-10"><nav aria-label="Profile navigation" className="flex flex-wrap gap-5 underline"><a href="/saved" className="underline">Saved</a><a href="/for-you" className="underline">For You</a><a href="/account">Account</a><a href="/explore">Explore</a></nav>
 <h1 className="text-3xl font-semibold">{onboarding ? "Build your student profile" : "Edit your private profile"}</h1>
 <p>Share only what you choose. Save each section separately; leave optional fields blank or skip them. You can explore opportunities without completing your profile.</p>
 <p>These details will support future recommendations. Personalized recommendations are not available yet. Preferences do not establish eligibility.</p>
 <aside aria-label="Profile completeness" className="rounded border border-border p-4"><p className="font-semibold">Profile: {progress.completed}/{progress.total} sections complete</p><p className="text-sm">This measures profile completion, not event matching. Optional links do not count.</p><ul className="mt-2">{progress.groups.map(g=><li key={g.name}>{g.name}: {g.complete ? "Complete" : "Optional details missing"}</li>)}</ul></aside>
 <nav aria-label="Profile sections" className="flex flex-wrap gap-4 underline">{["about","education","interests","skills","preferences","links","review"].map(s=><a key={s} href={"#"+s}>{s === "about" ? "About you" : s.charAt(0).toUpperCase()+s.slice(1)}</a>)}</nav>
 <noscript>Enable JavaScript to save these forms. You can still browse Explore.</noscript>
 <SectionForm section="about" title="About you"><Field name="name" label="Display or full name" value={p.name}/><Field name="city" label="City" value={p.city}/><Field name="country" label="Country code (two letters, for example IN)" value={p.country} max={2}/></SectionForm>
 <SectionForm section="education" title="Education"><Field name="institution" label="College or university" value={p.institution} max={200}/><Field name="degree" label="Degree or course (as you describe it)" value={p.degree}/><Field name="study_year" label="Year of study (1Ã¢â‚¬â€œ20)" value={p.study_year} type="number" max={20}/><p className="text-sm">Degree names are preserved as entered; no eligibility or equivalent qualification is inferred.</p></SectionForm>
 <SectionForm section="interests" title="Interests"><Choices name="ids" label="Topics you are interested in" choices={Object.fromEntries(data.interests.map(i=>[i.id,i.name]))} selected={data.selectedInterests}/><p>Clearing all choices leaves your interests unspecified.</p></SectionForm>
 <SectionForm section="skills" title="Skills"><Choices name="ids" label="Skills you choose to share" choices={Object.fromEntries(data.skills.map(i=>[i.id,i.name]))} selected={data.selectedSkills}/><p>Clearing all choices leaves your skills unspecified.</p></SectionForm>
 <SectionForm section="preferences" title="Event preferences"><BooleanChoice name="any_category" label="Any event category is welcome" value={p.any_category}/><Choices name="preferred_categories" label="Preferred categories (leave unchecked if you chose any category)" choices={categories} selected={p.preferred_categories}/><Choices name="preferred_modes" label="Preferred participation modes" choices={modes} selected={p.preferred_modes}/><BooleanChoice name="willingness_to_travel" label="Willing to travel" value={p.willingness_to_travel}/><Field name="preferred_team_min" label="Preferred minimum team size (including you)" value={p.preferred_team_min} max={100} type="number"/><Field name="preferred_team_max" label="Preferred maximum team size (including you)" value={p.preferred_team_max} max={100} type="number"/><p>Use 1 for solo participation. A blank bound is unspecified, not unlimited.</p></SectionForm>
 <SectionForm section="links" title="Optional links"><label className="block space-y-2">LinkedIn, GitHub or portfolio links (one per line, up to five)<textarea name="portfolio_links" rows={5} maxLength={10244} className={control} defaultValue={p.portfolio_links?.join("\n") ?? ""}/></label><p>Only HTTP/HTTPS links are accepted. We do not visit or fetch your links.</p></SectionForm>
 <section id="review" className="border-t border-border py-6"><h2 className="text-xl font-semibold">Review and continue</h2><p className="my-3">Only sections showing a saved confirmation have been submitted. Review your saved profile from your account, or skip any remaining sections.</p><div className="flex flex-wrap gap-5 underline"><a href="/saved" className="underline">Saved</a><a href="/for-you" className="underline">For You</a><a href="/account">Review saved profile</a><a href="/explore">Skip remaining sections and explore</a></div></section>
 </main>;
}
