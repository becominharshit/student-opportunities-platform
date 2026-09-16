import "server-only";
import { setTimeout as pause } from "node:timers/promises";
import type { ConnectorStore, FetchResponse, Lease, PolicyBoundFetcher, SafeError } from "./contracts";
import { ConnectorError, redact } from "./errors";
import { approvedUrl, assertPolicy, publicIPv4 } from "./policy";
import { pinnedTransport, resolveAddresses, type Transport, type WireResponse } from "./transport";

export function retryAfter(value: string | undefined, now: number): number {
  if (!value) return 30000;
  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  if (!Number.isFinite(ms)) return 30000;
  if (ms > 31536000000) throw new ConnectorError("permission_denied");
  return Math.max(0, ms);
}
type Dependencies = { resolve: typeof resolveAddresses; transport: Transport; now: () => number; sleep: (ms: number, signal: AbortSignal) => Promise<void>; jitter: () => number };
const defaults: Dependencies = { resolve: resolveAddresses, transport: pinnedTransport, now: Date.now, sleep: async (ms, signal) => { await pause(ms, undefined, { signal }); }, jitter: Math.random };

export class BoundedFetcher implements PolicyBoundFetcher {
  private readonly deps: Dependencies;
  private fatal?: ConnectorError;
  private failures: SafeError[] = [];
  constructor(private readonly store: ConnectorStore, private readonly lease: Lease, private readonly signal: AbortSignal, dependencies: Partial<Dependencies> = {}) { this.deps = { ...defaults, ...dependencies }; }
  diagnostics(): SafeError[] { return this.failures.map(e => ({ ...e })); }
  async get(input: string): Promise<FetchResponse> {
    if (this.fatal) throw this.fatal;
    try { return await this.perform(input); }
    catch (error) {
      const safe = redact(error);
      if (this.failures.length < 100) this.failures.push(safe);
      const e = new ConnectorError(safe.code, safe.retryable, safe.retryAfterMs);
      if (e.code === "permission_denied" || e.code === "authentication_failed") this.fatal = e;
      throw e;
    }
  }
  private async perform(input: string): Promise<FetchResponse> {
    const p = this.lease.policy;
    assertPolicy(p, this.deps.now());
    let url = approvedUrl(input, p), redirects = 0, retries = 0;
    while (true) {
      assertPolicy(p, this.deps.now());
      if (this.signal.aborted) throw new ConnectorError("budget_exceeded");
      await this.store.guard(this.lease); // Permission + fencing rechecked before DNS, on every attempt/hop.
      url = approvedUrl(url.href, p);
      const requestHost = url.hostname;
      await this.store.reserve(this.lease, requestHost);
      let wire: WireResponse | undefined;
      let redirected = false;
      const abort = new AbortController();
      const onAbort = () => abort.abort();
      this.signal.addEventListener("abort", onAbort, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (this.signal.aborted) throw new ConnectorError("budget_exceeded");
        const attempt = async () => {
          const addresses = await this.deps.resolve(url.hostname);
          if (abort.signal.aborted) throw new ConnectorError("network_error", true);
          if (!addresses.length || addresses.some(a => !publicIPv4(a))) throw new ConnectorError("permission_denied");
          await this.store.guard(this.lease, requestHost);
          if (abort.signal.aborted) throw new ConnectorError("network_error", true);
          wire = await this.deps.transport(url, addresses[0], p.userAgent, abort.signal);
          if (abort.signal.aborted) { wire.close(); throw new ConnectorError("network_error", true); }
          const { status, headers } = wire;
          if ([301,302,303,307,308].includes(status)) {
            if (++redirects > p.maxRedirects || !headers.location) throw new ConnectorError("permission_denied");
            // Validate both raw relative path and resolved destination before another request.
            if (/%|\\|\/\./.test(headers.location)) throw new ConnectorError("permission_denied");
            url = approvedUrl(new URL(headers.location, url).href, p);
            redirected = true;
            return undefined;
          }
          if (status === 401) throw new ConnectorError("authentication_failed");
          if (status === 403) throw new ConnectorError("permission_denied");
          if (status === 429 || (status >= 500 && status <= 599)) {
            const delay = status === 429 || headers["retry-after"] ? retryAfter(headers["retry-after"], this.deps.now()) : Math.ceil(500 * 2 ** retries + this.deps.jitter() * 250);
            await this.store.defer(this.lease, url.hostname, delay);
            throw new ConnectorError(status === 429 ? "rate_limited" : "network_error", true, delay);
          }
          if (status === 404 || status === 410) return { url: url.href, status, contentType: "", body: new Uint8Array(), fetchedAt: new Date(this.deps.now()).toISOString() };
          // Unsolicited 304/partial bodies cannot establish freshness.
          if (status !== 200) throw new ConnectorError("schema_error");
          const type = (headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
          if (!p.contentTypes.includes(type) || (headers["content-encoding"] && headers["content-encoding"].toLowerCase() !== "identity")) throw new ConnectorError("schema_error");
          if (headers["content-length"] && (!/^\d+$/.test(headers["content-length"]) || Number(headers["content-length"]) > p.maxBytes)) throw new ConnectorError("budget_exceeded");
          const chunks: Uint8Array[] = []; let bytes = 0;
          for await (const chunk of wire.body) {
            bytes += chunk.byteLength;
            if (bytes > p.maxBytes) throw new ConnectorError("budget_exceeded");
            chunks.push(chunk);
          }
          if (headers["content-length"] && bytes !== Number(headers["content-length"])) throw new ConnectorError("schema_error");
          return { url: url.href, status, contentType: type, body: Buffer.concat(chunks), fetchedAt: new Date(this.deps.now()).toISOString() };
        };
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => { abort.abort(); wire?.close(); reject(new ConnectorError("network_error", true)); }, p.timeoutMs);
          abort.signal.addEventListener("abort", () => reject(new ConnectorError(this.signal.aborted ? "budget_exceeded" : "network_error", !this.signal.aborted)), { once: true });
        });
        const result = await Promise.race([attempt(), deadline]);
        if (result) return result;
      } catch (error) {
        const e = error instanceof ConnectorError ? error : new ConnectorError("network_error", true);
        if (!e.retryable || retries >= p.maxRetries || this.signal.aborted) throw e;
        const delay = Math.max(p.minIntervalMs, e.retryAfterMs ?? Math.ceil(500 * 2 ** retries + this.deps.jitter() * 250));
        // Long waits are deferred, never shortened to fit the worker.
        if (delay > 30000) throw e;
        retries++;
        wire?.close(); clearTimeout(timer); abort.abort();
        await this.deps.sleep(delay, this.signal);
      } finally {
        clearTimeout(timer); abort.abort(); wire?.close();
        this.signal.removeEventListener("abort", onAbort);
        await this.store.releaseHost(this.lease, requestHost);
      }
      // A same-host redirect still has to respect minimum request spacing.
      if (redirected && p.minIntervalMs > 30000) throw new ConnectorError("rate_limited", true, p.minIntervalMs);
      if (redirected && p.minIntervalMs) await this.deps.sleep(p.minIntervalMs, this.signal);
    }
  }
}
