import { requireIdentity } from "@/lib/auth/identity";
import { AuthMessage, AuthShell } from "@/components/auth-page";
import { Button } from "@/components/ui/button";
import { readOwnProfile } from "@/lib/profiles/service";
import { completeness, categories, modes } from "@/lib/profiles/validation";
export const metadata = { title: "Your private account", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
 const {user,client}=await requireIdentity(); const data=await readOwnProfile(client,user.id);
 const p=data?.profile; const progress=p && data ? completeness(p,data.selectedInterests,data.selectedSkills) : null;
 const bool=(v:boolean|null)=>v === null ? "Not specified" : v ? "Yes" : "No";
 return <AuthShell title="Your account"><AuthMessage code={(await searchParams).message}/>
 <p>Your profile is private. For You uses your recorded profile to evaluate opportunities.</p>
 {p && data && progress ? <><h2 className="text-xl font-semibold">Saved profile</h2><p>Profile: {progress.completed}/{progress.total} sections complete</p><p className="text-sm">Profile completion is not an event match score. Missing sections: {progress.groups.filter(g=>!g.complete).map(g=>g.name).join(", ") || "None"}.</p>
 <dl className="space-y-3 break-words">{Object.entries({Name:p.name,City:p.city,Country:p.country,"College / university":p.institution,"Degree / course":p.degree,"Study year":p.study_year,Interests:data.interests.filter(i=>data.selectedInterests.includes(i.id)).map(i=>i.name).join(", "),Skills:data.skills.filter(i=>data.selectedSkills.includes(i.id)).map(i=>i.name).join(", "),"Preferred categories":p.any_category === true ? "Any category" : p.preferred_categories?.map(c=>categories[c as keyof typeof categories] ?? "Unrecognized category").join(", "),"Preferred modes":p.preferred_modes?.map(m=>modes[m as keyof typeof modes] ?? "Unrecognized mode").join(", "),"Willing to travel":bool(p.willingness_to_travel),"Minimum team size":p.preferred_team_min,"Maximum team size":p.preferred_team_max,"Optional links":p.portfolio_links?.join(" · ")}).map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd>{value ?? "Not specified"}{value === "" ? "Not specified" : ""}</dd></div>)}</dl></> : <p>Profile information is temporarily unavailable. Please retry; your information has not been replaced.</p>}
 <nav aria-label="Account actions" className="flex flex-wrap gap-4 underline"><a href="/saved" className="underline">Saved</a><a href="/for-you">For You</a><a href="/account/profile">Edit profile</a><a href="/onboarding">Guided onboarding</a><a href="/explore">Explore opportunities</a></nav>
 <form method="post" action="/auth/logout"><Button type="submit">Sign out</Button></form><a href="/forgot-password" className="block underline">Reset password by email</a><a href="/admin" className="block underline">Administrator access</a>
 </AuthShell>;
}
