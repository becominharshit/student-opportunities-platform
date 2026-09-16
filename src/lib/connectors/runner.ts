import "server-only";
import type { ConnectorStore, FetchResponse, RawRecord, SafeError, SourceConnector } from "./contracts";
import { BoundedFetcher } from "./fetcher";
import { ConnectorError, redact } from "./errors";

/** One bounded discovery page, retaining unparsed private evidence only. No scheduler or publication. */
export async function collectPage(connector: SourceConnector, store: ConnectorStore, signal: AbortSignal, dependencies: ConstructorParameters<typeof BoundedFetcher>[3] = {}) {
  const lease = await store.claim(connector.id, connector.version);
  const fetcher = new BoundedFetcher(store, lease, signal, dependencies);
  const received = new WeakSet<FetchResponse>();
  const retained = new Map<string, RawRecord>();
  let items: RawRecord[] = [], errors: SafeError[] = [], cursor: string | undefined, complete = false, retainCalls = 0;
  try {
    const page = await connector.discover({
      runId: lease.runId, now: new Date().toISOString(), signal, cursor: lease.cursor, maxItems: 100,
      fetch: { async get(url) { const response = await fetcher.get(url); received.add(response); return response; } },
      async retain(externalId, response) {
        if (!received.has(response) || ++retainCalls > 100) throw new ConnectorError("schema_error");
        const record = await store.retain(lease, connector.version, externalId, response);
        retained.set(record.permittedPayloadRef, record);
        return record;
      },
    });
    if (!page || !Array.isArray(page.items) || page.items.length > 100 || typeof page.complete !== "boolean" || (page.nextCursor !== undefined && (typeof page.nextCursor !== "string" || page.nextCursor.length > 2000)) || (!page.complete && !page.nextCursor) || (page.complete && page.nextCursor !== undefined) || (page.errors !== undefined && (!Array.isArray(page.errors) || page.errors.length > 100))) throw new ConnectorError("schema_error");
    const identities = new Set<string>();
    for (const item of page.items) {
      const saved = item && retained.get(item.permittedPayloadRef);
      if (!saved || JSON.stringify(saved) !== JSON.stringify(item) || identities.has(item.externalId)) {
        errors.push(redact(new ConnectorError("schema_error"))); continue;
      }
      identities.add(item.externalId); items.push(item);
    }
    // Treat parser-supplied diagnostics as untrusted; never propagate arbitrary detail strings.
    for (let i = 0; i < (page.errors?.length ?? 0); i++) errors.push(redact(new ConnectorError("parse_error")));
    cursor = page.nextCursor; complete = page.complete;
  } catch (error) {
    items = [...retained.values()]; errors = [redact(error, "parse_error")];
  }
  // A connector cannot swallow an access-denial and report a successful source check.
  errors = [...fetcher.diagnostics(), ...errors].slice(0, 100);
  const status = await store.finish(lease, { items, errors, cursor, complete });
  return { status, retained: items.length, errors };
}

/** Intentionally empty. C07 conditional classifications are never converted into enabled sources. */
export const registeredConnectors: readonly SourceConnector[] = [];
