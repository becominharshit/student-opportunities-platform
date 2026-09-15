import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import ts from "typescript";
import { NextRequest } from "next/server.js";

// Execute actual handlers with only their external Supabase dependency replaced.
// Hosted tests separately exercise the real request client, cookies, Auth and RLS.
const fixtureKey = "__c04_handler_fixture";
async function compile(path, replacements = {}) {
  let source = (await readFile(new URL("../" + path, import.meta.url), "utf8")).replace('import "server-only";', "");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll('"' + from + '"', JSON.stringify(to));
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return "data:text/javascript;base64," + Buffer.from(output).toString("base64");
}
const config = await compile("src/lib/auth/config.ts");
const policy = await compile("src/lib/auth/policy.ts");
const recovery = await compile("src/lib/auth/recovery.ts");
const stub = "data:text/javascript," + encodeURIComponent(`export function createRequestSupabaseClient(){return globalThis.${fixtureKey};}`);
const handlers = await import(await compile("src/lib/auth/handlers.ts", {
  "next/server": import.meta.resolve("next/server.js"), "../supabase/request": stub,
  "./config": config, "./policy": policy, "./recovery": recovery,
}));
const origin = "https://c04.example.test";
process.env.APP_URL = origin;
process.env.AUTH_COOKIE_SECRET = randomBytes(32).toString("base64url");
let calls;
function setup(overrides = {}) {
  calls = [];
  const fixture = {
    auth: {
      signUp: async (input) => { calls.push(["signup", input]); return { data: { session: null }, error: null }; },
      resetPasswordForEmail: async (...input) => { calls.push(["recovery", input]); return { error: null }; },
      getUser: async () => ({ data: { user: null }, error: null }),
      getClaims: async () => ({ data: null, error: null }),
      signInWithPassword: async () => ({ error: { message: "SENSITIVE_PROVIDER_DETAIL" } }),
      signOut: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ error: { message: "SENSITIVE_PROVIDER_DETAIL" } }),
      ...overrides,
    },
  };
  globalThis[fixtureKey] = fixture;
  return fixture;
}
function request(action, form = {}, headers = {}) {
  return new NextRequest(origin + "/auth/" + action, { method: "POST", headers: {
    origin, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": randomBytes(8).toString("hex"), ...headers,
  }, body: new URLSearchParams(form) });
}
test("signup requests verification with canonical callback and no invented profile", async () => {
  setup();
  const password = "test-only-long-password";
  const response = await handlers.authPost(request("signup", { email: "s@example.test", password, confirm_password: password, next: "//evil.test" }), "signup");
  assert.equal(response.headers.get("location"), origin + "/signup?message=verification");
  assert.equal(calls[0][1].options.emailRedirectTo, origin + "/auth/callback?next=%2Faccount");
  assert.equal(calls.length, 1);
});
test("recovery request has the same outward result for success and unknown-account provider errors", async () => {
  setup();
  const good = await handlers.authPost(request("forgot-password", { email: "s@example.test" }), "forgot-password");
  setup({ resetPasswordForEmail: async () => ({ error: { message: "account absent" } }) });
  const absent = await handlers.authPost(request("forgot-password", { email: "n@example.test" }), "forgot-password");
  assert.equal(good.headers.get("location"), absent.headers.get("location"));
  assert.ok(good.headers.get("location").endsWith("message=recovery"));
});
test("invalid password and mismatch are rejected before calling signup", async () => {
  setup();
  const result = await handlers.authPost(request("signup", { email: "s@example.test", password: "long-test-password", confirm_password: "different" }), "signup");
  assert.ok(result.headers.get("location").endsWith("message=input"));
  assert.equal(calls.length, 0);
});
test("invalid login and PKCE callback do not expose provider messages", async () => {
  setup();
  const result = await handlers.authPost(request("login", { email: "s@example.test", password: "wrong", next: "https://evil.test" }), "login");
  assert.ok(result.headers.get("location").includes("message=credentials"));
  assert.ok(!result.headers.get("location").includes("SENSITIVE"));
  const callback = await handlers.authCallback(new NextRequest(origin + "/auth/callback?code=invalid"));
  assert.equal(callback.headers.get("location"), origin + "/login?message=invalid_link");
});
test("POST boundary rejects missing/cross-site origins, unsupported content and oversized input", async () => {
  setup();
  for (const headers of [{ origin: "null" }, { origin: "" }, { origin: "https://evil.test" }, { "sec-fetch-site": "cross-site" }, { "content-type": "application/json" }]) {
    assert.equal((await handlers.authPost(request("login", {}, headers), "login")).status, 403);
  }
  assert.equal((await handlers.authPost(request("login", { extra: "x".repeat(9000) }), "login")).status, 403);
});
test("missing recovery identity fails closed without updating a password", async () => {
  setup();
  const result = await handlers.authPost(request("reset-password", { password: "long-test-password" }), "reset-password");
  assert.equal(result.headers.get("location"), origin + "/forgot-password?message=invalid_link");
});
test("burst guard rejects repeated auth requests", async () => {
  setup();
  let result;
  for (let i = 0; i < 21; i++) result = await handlers.authPost(request("login", { email: "s@example.test", password: "wrong" }, { "x-forwarded-for": "unit-rate-test" }), "login");
  assert.equal(result.headers.get("location"), origin + "/login?message=rate_limit");
});
test("cookie configuration enables Secure for HTTPS and permits local HTTP development", async () => {
  const { authCookieOptions } = await import(config);
  assert.equal(authCookieOptions().secure, true);
  process.env.APP_URL = "http://localhost:3000";
  assert.equal(authCookieOptions().secure, false);
  process.env.APP_URL = origin;
});

test("auth redirect policy preserves native form origins without exposing URL paths", async () => {
  setup();
  const r = await handlers.authPost(request("login", { email: "s@example.test", password: "wrong" }), "login");
  assert.equal(r.headers.get("Referrer-Policy"), "strict-origin");
  const proxy = await readFile(new URL("../src/proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /"Referrer-Policy", "strict-origin"/);
});
