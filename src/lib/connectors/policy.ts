import "server-only";
import { isIP } from "node:net";
import type { FetchPolicy } from "./contracts";
import { ConnectorError } from "./errors";

export function assertPolicy(value: unknown, now = Date.now()): asserts value is FetchPolicy {
  const p = value as FetchPolicy;
  const fail = () => { throw new ConnectorError("permission_denied"); };
  if (!p || p.version !== 1 || p.enabled !== true || p.permission !== "approved" || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= now) fail();
  if (typeof p.evidence !== "string" || !p.evidence.trim() || p.evidence.length > 2000 || !/^[a-f0-9]{64}$/.test(p.termsHash) || !/^[a-f0-9]{64}$/.test(p.robotsHash)) fail();
  if (typeof p.userAgent !== "string" || !/^[A-Za-z0-9 ._()/;:@+-]{5,200}$/.test(p.userAgent)) fail();
  if (!Array.isArray(p.routes) || !p.routes.length || p.routes.length > 100 || p.routes.some(r => !r || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(r.host) || isIP(r.host) || !/^\/[A-Za-z0-9_./-]*$/.test(r.path) || /\/\.|\/\//.test(r.path) || !Array.isArray(r.queryKeys) || r.queryKeys.some(k => !/^[a-zA-Z0-9_-]{1,40}$/.test(k)))) fail();
  if (!Array.isArray(p.contentTypes) || !p.contentTypes.length || p.contentTypes.some(t => !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(t))) fail();
  const limits: [number, number, number][] = [[p.timeoutMs,1,20000],[p.maxBytes,1,2097152],[p.maxRetries,0,3],[p.maxRedirects,0,3],[p.maxRequests,1,100],[p.dailyRequests,1,1000],[p.minIntervalMs,0,86400000],[p.retentionDays,1,30]];
  if (limits.some(([v,min,max]) => !Number.isSafeInteger(v) || v < min || v > max)) fail();
}
export function approvedUrl(input: string, p: FetchPolicy): URL {
  let u: URL;
  try {
    if (typeof input !== "string" || input.length > 2048 || /[\s\\\u0000-\u001f]/.test(input)) throw Error();
    u = new URL(input);
    // Reject path normalization ambiguities, encoded separators, and opaque credentials.
    const rawPath = input.replace(/^https:\/\/[^/]+/, "").split(/[?#]/)[0];
    if (u.protocol !== "https:" || u.port || u.username || u.password || u.hash || /%|\/\.|\/\//.test(rawPath) || isIP(u.hostname) || u.hostname.endsWith(".")) throw Error();
    const route = p.routes.find(r => r.host === u.hostname && r.path === u.pathname);
    if (!route || [...u.searchParams.keys()].some(k => !route.queryKeys.includes(k)) || new Set(u.searchParams.keys()).size !== [...u.searchParams.keys()].length) throw Error();
  } catch { throw new ConnectorError("permission_denied"); }
  return u;
}
/** Fail closed on IPv6 until a reviewed global-unicast classifier is added. */
export function publicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a,b,c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
