import { requireIdentity } from "../auth/identity";
import { readOwnProfile } from "./service";
import { ProfileEditor } from "@/components/profile-editor";
export async function ProfilePage({onboarding=false}: {onboarding?:boolean}) {
 const {client,user}=await requireIdentity(onboarding ? "/onboarding" : "/account/profile");
 const data=await readOwnProfile(client,user.id);
 if (!data) return <main className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-2xl">Profile temporarily unavailable</h1><p>Your information has not been replaced. Please try again or sign in again.</p><a href="/login" className="underline">Sign in</a><a href="/explore" className="block underline">Continue to Explore</a></main>;
 return <ProfileEditor data={data} onboarding={onboarding}/>;
}
