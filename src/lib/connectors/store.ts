import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createServiceSupabaseClient } from "../supabase/service";
import type { Json } from "../supabase/database.types";
import type { ConnectorStore, FetchResponse, Lease, RawRecord } from "./contracts";
import { ConnectorError } from "./errors";
import { approvedUrl, assertPolicy } from "./policy";

const bucket = "connector-raw";
export class SupabaseConnectorStore implements ConnectorStore {
  constructor(private readonly client = createServiceSupabaseClient()) {}
  private async command(command: object) {
    const { data, error } = await this.client.rpc("connector_runtime", { command: command as Json });
    if (error) {
      for (const code of ["permission_denied", "rate_limited", "authentication_failed", "schema_error", "budget_exceeded"] as const) {
        if (error.message === code) throw new ConnectorError(code);
      }
      throw new ConnectorError("network_error");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new ConnectorError("schema_error");
    return data;
  }
  async claim(id: string, version: string): Promise<Lease> {
    const data = await this.command({ op: "claim", connectorId: id, version });
    const lease = data as unknown as Lease;
    try { assertPolicy(lease.policy); }
    catch {
      await this.command({ ...this.args(lease), op: "finish", items: [], complete: false, errors: [{ code: "permission_denied" }] });
      throw new ConnectorError("permission_denied");
    }
    return lease;
  }
  private args(lease: Lease) { return { connectorId: lease.connectorId, runId: lease.runId, token: lease.token, fence: lease.fence }; }
  async guard(lease: Lease, host?: string) { await this.command({ ...this.args(lease), op: "guard", host }); }
  async reserve(lease: Lease, host: string) { await this.command({ ...this.args(lease), op: "reserve", host }); }
  async defer(lease: Lease, host: string, milliseconds: number) { await this.command({ ...this.args(lease), op: "defer", host, milliseconds: Math.ceil(milliseconds) }); }
  async releaseHost(lease: Lease, host: string) { await this.command({ ...this.args(lease), op: "release_host", host }); }
  async retain(lease: Lease, version: string, externalId: string, response: FetchResponse): Promise<RawRecord> {
    assertPolicy(lease.policy); approvedUrl(response.url, lease.policy);
    if (!externalId || externalId.length > 256 || !/^[a-zA-Z0-9._-]{1,64}$/.test(version) || response.status !== 200 || response.body.byteLength > lease.policy.maxBytes || !lease.policy.contentTypes.includes(response.contentType)) throw new ConnectorError("schema_error");
    await this.guard(lease);
    const hash = createHash("sha256").update(response.body).digest("hex");
    const path = `${lease.connectorId}/${lease.runId}/${randomUUID()}`;
    // Object name has no URL, credential, event title, or external ID. Never create public/signed URLs.
    const { error } = await this.client.storage.from(bucket).upload(path, response.body, { upsert: false, contentType: "application/octet-stream" });
    if (error) throw new ConnectorError("network_error");
    let data;
    try {
      data = await this.command({ ...this.args(lease), op: "retain", item: { externalId, sourceUrl: response.url, contentHash: hash, parserVersion: version, storagePath: path, contentType: response.contentType, byteCount: response.body.byteLength, fetchedAt: response.fetchedAt } });
    } catch (error) {
      await this.client.storage.from(bucket).remove([path]);
      throw error;
    }
    // Idempotent replay reuses immutable evidence; don't extend its permitted retention.
    if (data.storage_path !== path) await this.client.storage.from(bucket).remove([path]);
    return { externalId, sourceUrl: String(data.source_url), fetchedAt: String(data.fetched_at), contentHash: String(data.content_hash), contentType: String(data.content_type), permittedPayloadRef: String(data.storage_path), parserVersion: String(data.parser_version) };
  }
  async finish(lease: Lease, result: Parameters<ConnectorStore["finish"]>[1]) {
    const data = await this.command({ ...this.args(lease), op: "finish", ...result });
    if (data.status !== "succeeded" && data.status !== "partial" && data.status !== "failed") throw new ConnectorError("schema_error");
    return data.status;
  }
}
