import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import ts from "typescript";
import { safeDestination, validEmail, validPassword } from "../src/lib/auth/policy.ts";

// Execute the production signing functions; server-only's bundler sentinel is checked separately.
const source = await readFile(new URL("../src/lib/auth/recovery.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source.replace('import "server-only";', ""), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { issueRecovery, verifyRecovery } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
process.env.AUTH_COOKIE_SECRET = randomBytes(32).toString("base64url");

test("redirects allow only implemented internal destinations", () => {
  assert.equal(safeDestination("/admin"), "/admin");
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "%2f%2fevil.test", "/admin?next=//evil.test", "/auth/logout", ["/admin"], null]) {
    assert.equal(safeDestination(value), "/account");
  }
});
test("credential validation bounds inputs without trimming passwords", () => {
  assert.ok(validEmail("student@example.test"));
  assert.ok(!validEmail("a\r\nb@example.test"));
  assert.ok(!validEmail("x".repeat(255) + "@example.test"));
  assert.ok(validPassword("A long password."));
  assert.ok(!validPassword("short"));
  assert.ok(!validPassword("x".repeat(129)));
});
test("recovery authorization is bound to both user and session", () => {
  const token = issueRecovery("user-a", "session-a", 1000000);
  assert.ok(verifyRecovery(token, "user-a", "session-a", 1001000));
  assert.ok(!verifyRecovery(token, "user-b", "session-a", 1001000));
  assert.ok(!verifyRecovery(token, "user-a", "session-b", 1001000));
});
test("recovery state rejects expired, tampered, malformed and absent markers", () => {
  const token = issueRecovery("a", "s", 1000000);
  assert.ok(!verifyRecovery(token, "a", "s", 1900000));
  for (const value of [undefined, "", "bad", token + "x", token + ".extra", "x".repeat(3000)]) {
    assert.ok(!verifyRecovery(value, "a", "s", 1001000));
  }
});
test("rotating recovery signing key invalidates previous markers", () => {
  const token = issueRecovery("a", "s");
  process.env.AUTH_COOKIE_SECRET = randomBytes(32).toString("base64url");
  assert.ok(!verifyRecovery(token, "a", "s"));
});
