import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const recoveryCookie = "sop-recovery";
const lifetime = 15 * 60;
function signature(body: string) {
  const key = process.env.AUTH_COOKIE_SECRET;
  if (!key || key.length < 43) throw new Error("AUTH_COOKIE_SECRET must contain at least 32 random bytes encoded as base64url.");
  return createHmac("sha256", key).update(body).digest("base64url");
}
export function issueRecovery(userId: string, sessionId: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ userId, sessionId, expires: Math.floor(now / 1000) + lifetime })).toString("base64url");
  return body + "." + signature(body);
}
export function verifyRecovery(value: string | undefined, userId: string, sessionId: string, now = Date.now()) {
  if (!value || value.length > 2048) return false;
  const [body, mac, extra] = value.split(".");
  if (!body || !mac || extra) return false;
  const expected = Buffer.from(signature(body));
  const supplied = Buffer.from(mac);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return payload.userId === userId && payload.sessionId === sessionId &&
      Number.isInteger(payload.expires) && payload.expires > now / 1000 && payload.expires <= now / 1000 + lifetime;
  } catch { return false; }
}
