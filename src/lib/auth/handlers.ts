import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabaseClient } from "../supabase/request";
import { appOrigin, authCookieOptions } from "./config";
import { safeDestination, validEmail, validPassword } from "./policy";
import { issueRecovery, recoveryCookie, verifyRecovery } from "./recovery";

type Client = ReturnType<typeof createRequestSupabaseClient>;
function responseTo(path: string) {
  const response = NextResponse.redirect(new URL(path, appOrigin()), 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "strict-origin");
  return response;
}
function move(response: NextResponse, path: string) {
  response.headers.set("Location", new URL(path, appOrigin()).href);
  return response;
}
function clearRecovery(response: NextResponse) {
  response.cookies.set(recoveryCookie, "", { ...authCookieOptions(), httpOnly: true, maxAge: 0 });
}
async function bootstrapProfile(client: Client, id: string) {
  // Only the verified identity is written. Existing student information is preserved.
  const { error } = await client.from("profiles").upsert({ user_id: id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw new Error("Profile initialization unavailable.");
}
async function finishCallback(client: Client, response: NextResponse, recovery: boolean, next: string) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email_confirmed_at) return move(response, "/login?message=invalid_link");
  await bootstrapProfile(client, data.user.id);
  clearRecovery(response);
  if (recovery) {
    const claims = await client.auth.getClaims();
    const sessionId = claims.data?.claims.session_id;
    if (claims.error || typeof sessionId !== "string") return move(response, "/forgot-password?message=invalid_link");
    response.cookies.set(recoveryCookie, issueRecovery(data.user.id, sessionId), {
      ...authCookieOptions(), httpOnly: true, maxAge: 900,
    });
    return move(response, "/reset-password");
  }
  return move(response, safeDestination(next));
}

// Supplemental per-process burst guard. Supabase enforces provider-wide auth limits.
const attempts = new Map<string, { count: number; expires: number }>();
function allowedAttempt(request: NextRequest, action: string) {
  // Platform must overwrite forwarded IP headers; these are never identity proof.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  if (attempts.size >= 10000) return false;
  const key = action + ":" + ip;
  const value = attempts.get(key) ?? { count: 0, expires: now + 60000 };
  value.count++;
  attempts.set(key, value);
  return value.count <= 20;
}

async function readForm(request: NextRequest) {
  if (request.headers.get("origin") !== appOrigin() || request.headers.get("sec-fetch-site") === "cross-site") return null;
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

export async function authPost(request: NextRequest, action: string) {
  if (!["login", "signup", "logout", "forgot-password", "reset-password", "verify"].includes(action)) {
    return new NextResponse(null, { status: 404 });
  }
  const form = await readForm(request);
  if (!form) return new NextResponse("Invalid request origin or form.", { status: 403 });
  const response = responseTo("/login?message=unavailable");
  const errorPage = action === "verify" ? "/login" : action === "logout" ? "/account" : "/" + action;
  if (!allowedAttempt(request, action)) return move(response, errorPage + "?message=rate_limit");
  try {
    const client = createRequestSupabaseClient(request, response);
    const email = (form.get("email") ?? "").trim();
    const password = form.get("password") ?? "";
    const next = safeDestination(form.get("next"));
    if (action === "logout") {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) return response; // Do not report logout success if revocation failed.
      clearRecovery(response);
      return move(response, "/login?message=signed_out");
    }
    if (action === "verify") {
      const type = form.get("type");
      const hash = form.get("token_hash") ?? "";
      if (!["signup", "recovery"].includes(type ?? "") || !/^[a-zA-Z0-9_-]{20,512}$/.test(hash)) {
        return move(response, "/login?message=invalid_link");
      }
      const { error } = await client.auth.verifyOtp({ token_hash: hash, type: type as "signup" | "recovery" });
      if (error) return move(response, "/login?message=invalid_link");
      return await finishCallback(client, response, type === "recovery", next);
    }
    if (action === "reset-password") {
      const { data, error } = await client.auth.getUser();
      const claims = await client.auth.getClaims();
      const sid = claims.data?.claims.session_id;
      if (error || !data.user || claims.error || typeof sid !== "string" ||
        !verifyRecovery(request.cookies.get(recoveryCookie)?.value, data.user.id, sid)) {
        clearRecovery(response);
        return move(response, "/forgot-password?message=invalid_link");
      }
      if (!validPassword(password) || password !== form.get("confirm_password")) return move(response, "/reset-password?message=input");
      const update = await client.auth.updateUser({ password });
      if (update.error) return move(response, "/reset-password?message=input");
      clearRecovery(response);
      const logout = await client.auth.signOut({ scope: "global" });
      if (logout.error) return response;
      return move(response, "/login?message=reset");
    }
    if (!validEmail(email)) return move(response, errorPage + "?message=input");
    if (action === "forgot-password") {
      // Identical response whether or not the account exists; never render provider errors.
      await client.auth.resetPasswordForEmail(email, { redirectTo: appOrigin() + "/auth/callback" });
      return move(response, "/forgot-password?message=recovery");
    }
    if (password.length > 128 || password.length === 0 || (action === "signup" &&
      (!validPassword(password) || password !== form.get("confirm_password")))) {
      return move(response, errorPage + "?message=input");
    }
    clearRecovery(response);
    if (action === "signup") {
      const { data, error } = await client.auth.signUp({ email, password,
        options: { emailRedirectTo: appOrigin() + "/auth/callback?next=" + encodeURIComponent(next) } });
      if (error) return move(response, "/signup?message=verification");
      if (!data.session) return move(response, "/signup?message=verification");
      return await finishCallback(client, response, false, next);
    }
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return move(response, "/login?message=credentials&next=" + encodeURIComponent(next));
    return await finishCallback(client, response, false, next);
  } catch {
    return move(response, errorPage + "?message=unavailable");
  }
}

export async function authCallback(request: NextRequest) {
  const response = responseTo("/login?message=invalid_link");
  const params = request.nextUrl.searchParams;
  // Email hash links require explicit same-origin POST confirmation, avoiding scanner consumption.
  if (params.has("token_hash")) {
    const target = new URL("/auth/confirm", appOrigin());
    for (const key of ["token_hash", "type"]) target.searchParams.set(key, params.get(key) ?? "");
    target.searchParams.set("next", safeDestination(params.get("next")));
    return move(response, target.pathname + target.search);
  }
  const code = params.get("code");
  if (params.has("error") || !code || code.length > 2048) return response;
  try {
    const client = createRequestSupabaseClient(request, response);
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return response;
    // Never infer recovery authority from a query string or editable PKCE cookie.
    // Recovery email templates use type=recovery + token_hash, verified in authPost.
    return await finishCallback(client, response, false, safeDestination(params.get("next")));
  } catch { return response; }
}
