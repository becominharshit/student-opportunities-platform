// Explicit hosted integration test. Creates only identified temporary Auth/profile/membership records.
// Never prints provider error objects, app logs, credentials, email hashes or response bodies.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const env = parseEnv(await readFile(".env.local", "utf8"));
if (env.NEXT_PUBLIC_SUPABASE_URL !== "https://vzuoscpwmytgibsxugcx.supabase.co") throw new Error("Unexpected hosted project");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = "http://127.0.0.1:3134";
const run = randomUUID();
const password = "C04-" + randomBytes(24).toString("base64url");
const changedPassword = "C04-" + randomBytes(24).toString("base64url");
const ids = [];
const checks = [];
let child;
function check(condition, name) {
  if (!condition) throw new Error("FAIL: " + name);
  checks.push(name);
  console.log("PASS: " + name);
}
class Browser {
  cookies = new Map();
  async request(path, form, headers = {}) {
    const response = await fetch(origin + path, {
      redirect: "manual", method: form ? "POST" : "GET",
      headers: { cookie: [...this.cookies].map(([k,v]) => k + "=" + v).join("; "),
        ...(form ? { origin, "content-type": "application/x-www-form-urlencoded" } : {}), ...headers },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const setCookies = response.headers.getSetCookie();
    for (const raw of setCookies) {
      const [pair] = raw.split(";"); const index = pair.indexOf("=");
      const name = pair.slice(0, index), value = pair.slice(index + 1);
      if (/max-age=0(?:;|$)/i.test(raw)) this.cookies.delete(name); else this.cookies.set(name, value);
    }
    const body = await response.text();
    return { status: response.status, location: response.headers.get("location"), body, setCookies,
      cache: response.headers.get("cache-control"), referrer: response.headers.get("referrer-policy") };
  }
}
async function createUser(label, confirmed = true) {
  const email = `c04-${label}-${run}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: confirmed,
    user_metadata: { test_run: run, role: "admin", is_admin: true } });
  if (error || !data.user) throw new Error("Temporary user creation failed");
  ids.push(data.user.id);
  return { id: data.user.id, email };
}
async function login(browser, user, value = password) {
  return browser.request("/auth/login", { email: user.email, password: value, next: "/account" });
}
let success = false;
try {
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3134"], {
    env: { ...process.env, ...env, APP_URL: origin }, windowsHide: true, stdio: "ignore",
  });
  child.on("error", () => {});
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(origin); await r.body?.cancel(); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  check(ready, "production Next.js test server starts");
  const anon = new Browser();
  for (const path of ["/", "/login", "/signup", "/forgot-password"]) check((await anon.request(path)).status === 200, "anonymous public route " + path);
  check((await anon.request("/account")).location?.includes("/login"), "anonymous account access denied");
  check((await anon.request("/admin")).location?.includes("/login"), "anonymous admin access denied");
  check((await anon.request("/auth/callback?code=invalid-test-code")).location?.includes("invalid_link"), "invalid PKCE callback fails safely");
  check((await anon.request("/auth/verify", { type: "recovery", token_hash: "a".repeat(64) })).location?.includes("invalid_link"), "invalid recovery token fails safely");
  check((await anon.request("/auth/login", { email: "a@example.invalid", password }, { origin: "https://evil.invalid" })).status === 403, "cross-origin auth POST rejected");
  check((await anon.request("/auth/logout")).status === 405, "GET cannot log a user out");
  const a = await createUser("a"), b = await createUser("b"), staff = await createUser("staff"), unverified = await createUser("unverified", false);
  const browserA = new Browser(), browserB = new Browser(), staffBrowser = new Browser();
  check((await login(anon, a, "incorrect-password")).location?.includes("credentials"), "incorrect password fails without provider detail");
  check((await login(anon, unverified)).location?.includes("credentials"), "unverified user cannot log in");
  check((await login(browserA, a)).location === origin + "/account", "valid login establishes cookie session");
  const account = await browserA.request("/account");
  check(account.status === 200 && account.body.includes(a.email) && !account.body.includes(b.email), "server resolves own account and does not expose user B");
  check(account.cache?.includes("no-store"), "private page is not shared-cacheable");
  check((await browserA.request("/admin")).location?.includes("forbidden"), "editable metadata cannot grant admin route access");
  check((await browserA.request("/login")).location?.endsWith("/account"), "already authenticated login redirects");
  check((await browserA.request("/auth/reset-password", { password: changedPassword, confirm_password: changedPassword })).location?.includes("invalid_link"), "ordinary login cannot authorize recovery reset");
  await login(browserB, b);
  check((await browserB.request("/account")).body.includes(b.email), "second user retains independent session");
  const invalidSession = new Browser();
  invalidSession.cookies.set("sb-vzuoscpwmytgibsxugcx-auth-token", "base64-" + Buffer.from(JSON.stringify({ access_token: "invalid", refresh_token: "invalid", expires_at: 1 })).toString("base64url"));
  check((await invalidSession.request("/account")).location?.includes("/login"), "invalid expired session fails closed");
  const membership = await admin.from("admin_memberships").insert({ user_id: staff.id, role: "admin" });
  check(!membership.error, "test admin provisioned through privileged membership only");
  await login(staffBrowser, staff);
  check((await staffBrowser.request("/admin")).status === 200, "protected member accesses administrator route");
  await admin.from("admin_memberships").delete().eq("user_id", staff.id);
  check((await staffBrowser.request("/admin")).location?.includes("forbidden"), "membership revocation immediately removes route access");
  const profile = await admin.from("profiles").select("name,institution,country").eq("user_id", a.id).single();
  check(!profile.error && Object.values(profile.data).every(x => x === null), "profile bootstrap preserves unknown student information");
  // Force the stored expiry into the past without altering the signed access token or refresh token.
  const base = "sb-vzuoscpwmytgibsxugcx-auth-token";
  const names = [...browserA.cookies.keys()].filter(k => k === base || new RegExp("^" + base + "\\.\\d+$").test(k)).sort();
  const encoded = names.map(k => browserA.cookies.get(k)).join("");
  const session = JSON.parse(Buffer.from(decodeURIComponent(encoded).slice(7), "base64url").toString());
  session.expires_at = 1;
  for (const name of names) browserA.cookies.delete(name);
  const expired = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  for (let i = 0; i < expired.length; i += 3000) browserA.cookies.set(base + "." + Math.floor(i / 3000), expired.slice(i, i + 3000));
  const refreshed = await browserA.request("/account");
  check(refreshed.status === 200 && refreshed.setCookies.some(c => c.startsWith(base)), "Proxy refreshes expired cookie session and propagates new cookies");
  const signupEmail = `c04-signup-${run}@example.invalid`;
  const signup = await admin.auth.admin.generateLink({ type: "signup", email: signupEmail, password });
  if (signup.error || !signup.data.user) throw new Error("Signup fixture link unavailable");
  ids.push(signup.data.user.id);
  const signupBrowser = new Browser();
  const signupHash = signup.data.properties.hashed_token;
  check((await anon.request("/auth/verify", { type: "recovery", token_hash: signupHash })).location?.includes("invalid_link"), "signup token cannot be reinterpreted as recovery authorization");
  const confirm = await signupBrowser.request("/auth/confirm?type=signup&token_hash=" + encodeURIComponent(signupHash));
  check(confirm.status === 200 && confirm.body.includes("Continue with this email link") && confirm.referrer === "strict-origin", "email link requires explicit confirmation and suppresses referrer");
  check((await signupBrowser.request("/auth/verify", { type: "signup", token_hash: signupHash, next: "//evil.invalid" })).location === origin + "/account", "real signup verification establishes session with safe redirect");
  check((await signupBrowser.request("/account")).status === 200, "verified signup reaches protected destination");
  check((await anon.request("/auth/verify", { type: "signup", token_hash: signupHash })).location?.includes("invalid_link"), "consumed verification link cannot be replayed");
  const recovery = await admin.auth.admin.generateLink({ type: "recovery", email: a.email });
  if (recovery.error) throw new Error("Recovery fixture link unavailable");
  const recoveryBrowser = new Browser();
  const recovered = await recoveryBrowser.request("/auth/verify", { type: "recovery", token_hash: recovery.data.properties.hashed_token });
  check(recovered.location === origin + "/reset-password" && recovered.setCookies.some(c => c.startsWith("sop-recovery=") && /HttpOnly/i.test(c)), "verified recovery creates session-bound HttpOnly authorization");
  check((await recoveryBrowser.request("/reset-password")).status === 200, "verified recovery opens reset page");
  browserB.cookies.set("sop-recovery", recoveryBrowser.cookies.get("sop-recovery"));
  check((await browserB.request("/auth/reset-password", { password: changedPassword, confirm_password: changedPassword })).location?.includes("invalid_link"), "user A recovery marker cannot authorize user B password reset");
  check((await recoveryBrowser.request("/auth/reset-password", { password: changedPassword, confirm_password: changedPassword })).location?.includes("message=reset"), "recovery updates password and signs out");
  check((await recoveryBrowser.request("/account")).location?.includes("/login"), "password reset clears authenticated browser access");
  check((await login(new Browser(), a, changedPassword)).location === origin + "/account", "new password works");
  check((await login(new Browser(), a, password)).location?.includes("credentials"), "old password no longer works");
  check((await browserB.request("/auth/logout", {})).location?.includes("signed_out"), "logout completes");
  check((await browserB.request("/account")).location?.includes("/login"), "logout removes protected access");
  success = true;
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith("FAIL:") ? error.message : "Hosted verification failed; sensitive details suppressed.");
  process.exitCode = 1;
} finally {
  let cleaned = true;
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) cleaned = false;
  }
  child?.kill();
  if (!cleaned) { console.error("Exact fixture cleanup requires attention."); process.exitCode = 1; }
  console.log(cleaned ? "PASS: exact temporary Auth records removed (dependent rows cascade)." : "FAIL: fixture cleanup");
  await mkdir("work", { recursive: true });
  await writeFile("work/c04-hosted-results.json", JSON.stringify({ checkedAt: new Date().toISOString(), run, success: success && cleaned, checks, cleaned }, null, 2));
}
