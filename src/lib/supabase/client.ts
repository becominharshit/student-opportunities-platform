"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv } from "./public-env";

export function createBrowserSupabaseClient() {
  const { url, key } = getPublicSupabaseEnv();
  return createBrowserClient<Database>(url, key, {
    cookieOptions: { path: "/", sameSite: "lax", secure: typeof window !== "undefined" && window.location.protocol === "https:" },
  });
}
