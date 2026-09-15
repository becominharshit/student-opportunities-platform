import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../supabase/server";
import { safeDestination } from "./policy";

export async function resolveIdentity() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getUser();
  return { client, user: error || !data.user?.email_confirmed_at ? null : data.user };
}

export async function requireIdentity(destination = "/account") {
  const identity = await resolveIdentity();
  if (!identity.user) redirect("/login?next=" + encodeURIComponent(safeDestination(destination)));
  return { client: identity.client, user: identity.user };
}

export async function requireAdministrator() {
  const identity = await requireIdentity("/admin");
  const { data, error } = await identity.client.from("admin_memberships")
    .select("role").eq("user_id", identity.user.id).eq("role", "admin").maybeSingle();
  if (error || data?.role !== "admin") redirect("/account?message=forbidden");
  return identity;
}
