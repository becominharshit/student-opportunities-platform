import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type { ProfileFields } from "./validation";
export async function readOwnProfile(client: SupabaseClient<Database>, userId: string) {
  const results = await Promise.all([
    client.from("profiles").select("name,city,country,institution,degree,study_year,preferred_categories,any_category,preferred_modes,willingness_to_travel,preferred_team_min,preferred_team_max,portfolio_links").eq("user_id",userId).maybeSingle(),
    client.from("interests").select("id,slug,name").order("name"),
    client.from("skills").select("id,slug,name").order("name"),
    client.from("user_interests").select("interest_id").eq("user_id",userId),
    client.from("user_skills").select("skill_id").eq("user_id",userId),
  ]);
  if (results.some(r => r.error) || !results[0].data) return null;
  return { profile: results[0].data as ProfileFields, interests: results[1].data!, skills: results[2].data!, selectedInterests: results[3].data!.map(r => r.interest_id), selectedSkills: results[4].data!.map(r => r.skill_id) };
}
export type ProfileData = NonNullable<Awaited<ReturnType<typeof readOwnProfile>>>;
