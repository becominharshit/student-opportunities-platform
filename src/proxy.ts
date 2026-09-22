import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabaseClient } from "@/lib/supabase/request";

export async function proxy(request: NextRequest) {
  const outgoing = NextResponse.next();
  // Route handlers own mutation/refresh cookies themselves.
  if (!request.nextUrl.pathname.startsWith("/auth/")) {
    try {
      const client = createRequestSupabaseClient(request, outgoing);
      await client.auth.getUser();
    } catch {
      // No authorization is granted here; page/handler guards independently fail closed.
    }
  }
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const cookie of outgoing.cookies.getAll()) response.cookies.set(cookie);
  for (const [name, value] of outgoing.headers) {
    if (name !== "set-cookie" && !name.startsWith("x-middleware-")) response.headers.set(name, value);
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "strict-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  matcher: ["/login", "/signup", "/forgot-password", "/reset-password", "/account/:path*", "/onboarding", "/admin/:path*", "/auth/:path*"],
};
