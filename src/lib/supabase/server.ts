import "server-only";

import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv } from "./public-env";

/**
 * Per-request user-context client. C04 must supply a response cookie/header
 * writer for auth mutation/refresh, and verify identity with getClaims/getUser.
 * Cookie-writing errors are never silently swallowed.
 */
export async function createServerSupabaseClient(writeCookies?: SetAllCookies) {
  const cookieStore = await cookies();
  const { url, key } = getPublicSupabaseEnv();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: async (values, headers) => {
        if (!writeCookies) throw new Error("Auth cookie writes require a response cookie/header writer.");
        await writeCookies(values, headers);
      },
    },
  });
}

