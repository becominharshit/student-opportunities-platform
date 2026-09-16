import "server-only";
import { lookup } from "node:dns/promises";
import { Agent, request } from "node:https";
import type { LookupFunction } from "node:net";
import { ConnectorError } from "./errors";
import { publicIPv4 } from "./policy";

export type WireResponse = { status: number; headers: Record<string, string | undefined>; body: AsyncIterable<Uint8Array>; close(): void };
export type Transport = (url: URL, address: string, userAgent: string, signal: AbortSignal) => Promise<WireResponse>;
export const resolveAddresses = async (host: string) => (await lookup(host, { all: true, family: 4, verbatim: true })).map(a => a.address);

/** Pin the already vetted address while preserving hostname TLS verification and Host/SNI. */
export const pinnedTransport: Transport = (url, address, userAgent, signal) => new Promise((resolve, reject) => {
  if (!publicIPv4(address)) { reject(new ConnectorError("permission_denied")); return; }
  const pinnedLookup: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null, [{ address, family: 4 }]);
    else callback(null, address, 4);
  };
  const agent = new Agent({ keepAlive: false, proxyEnv: { NODE_ENV: "production" } });
  const req = request(url, {
    method: "GET", agent, lookup: pinnedLookup, family: 4,
    rejectUnauthorized: true, servername: url.hostname, signal, maxHeaderSize: 16384,
    headers: { "User-Agent": userAgent, Accept: "*/*", "Accept-Encoding": "identity" },
  }, res => {
    const headers: Record<string, string | undefined> = {};
    for (const key of ["location", "content-type", "content-length", "content-encoding", "retry-after"]) {
      const v = res.headers[key]; headers[key] = Array.isArray(v) ? v[0] : v;
    }
    resolve({ status: res.statusCode ?? 0, headers, body: res, close: () => { res.destroy(); req.destroy(); agent.destroy(); } });
  });
  req.on("error", () => { agent.destroy(); reject(new ConnectorError("network_error", true)); });
  req.end();
});
