import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Bypasses RLS. Trusted server/worker operations only; never user-context reads. */
export function createServiceSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service configuration is missing.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) {
    throw new Error("Supabase service URL must use HTTPS except on loopback.");
  }
  if (parsed.username || parsed.password) throw new Error("Supabase URL must not contain credentials.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

