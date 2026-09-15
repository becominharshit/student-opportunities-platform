import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv } from "./public-env";
import { authCookieOptions } from "../auth/config";

/** All cookie chunks and Supabase's cache headers survive redirects and refreshes. */
export function createRequestSupabaseClient(request: NextRequest, response: NextResponse) {
  const { url, key } = getPublicSupabaseEnv();
  return createServerClient<Database>(url, key, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        for (const { name, value, options } of values) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });
}
