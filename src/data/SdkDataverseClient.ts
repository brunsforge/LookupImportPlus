/**
 * SdkDataverseClient — live {@link DataverseClient} over the `@microsoft/power-apps`
 * SDK `DataClient` (CRUD + OData query) and its Dataverse metadata capability.
 *
 * ⚠️ LIVE-VALIDATION PENDING (see docs/ARCHITECTURE.md §7). The SDK's
 * `DataClient` and metadata request shape are typed but a couple of details can
 * only be confirmed against a real environment:
 *   • the exact `executeAsync` request for `getEntityMetadata`
 *   • how a created record's id is returned
 *   • whether `tableName` is the logical name or entity-set name in this SDK
 * The adapter isolates all of these so completing them is a small, local change.
 * Until a Dataverse data source is added (`pac code add-data-source`) the app
 * uses {@link FakeDataverseClient} instead.
 */

import type { DataClient } from "@microsoft/power-apps/data";
import type {
  BatchRequest,
  BatchResponseItem,
  DataverseClient,
  DataverseRecord,
  QueryOptions,
  RetrieveMultipleResult,
  WhoAmIResult,
} from "./DataverseClient";
import { DataverseError } from "./DataverseClient";
import type { GetEntityMetadataOptions, RawEntityMetadata } from "./rawMetadata";

/** Maps an entity-set name (used across the app) to the SDK data-source name. */
export type TableNameResolver = (entitySet: string) => string;

export interface SdkClientOptions {
  apiBaseUrl: string;
  /**
   * Maps the app's CRUD identifier (entity-set name) to the SDK data-source
   * name. Defaults to identity — the generated SDK addresses tables by their
   * entity-set name (e.g. `accounts`), which is exactly what our services pass.
   */
  tableNameFor?: TableNameResolver;
  /**
   * Maps a logical name (e.g. `account`) to its data-source name (`accounts`)
   * for metadata requests — the SDK's `getEntityMetadata` is keyed by the
   * registered data-source name, not the logical name.
   */
  metadataTableFor?: (logicalName: string) => string;
  whoAmI?: () => Promise<WhoAmIResult>;
}

export class SdkDataverseClient implements DataverseClient {
  readonly apiBaseUrl: string;
  private readonly table: TableNameResolver;
  private readonly metaTable: (logicalName: string) => string;

  constructor(
    private readonly client: DataClient,
    private readonly opts: SdkClientOptions,
  ) {
    this.apiBaseUrl = opts.apiBaseUrl;
    this.table = opts.tableNameFor ?? ((s) => s);
    this.metaTable = opts.metadataTableFor ?? ((s) => s);
  }

  async whoAmI(): Promise<WhoAmIResult> {
    if (this.opts.whoAmI) return this.opts.whoAmI();
    return { userId: "", businessUnitId: "", organizationId: "" };
  }

  async getEntityMetadata(
    logicalName: string,
    options?: GetEntityMetadataOptions,
  ): Promise<RawEntityMetadata> {
    // The metadata request type is `@private` in the SDK; cast the shape.
    const op = {
      dataverseRequest: {
        action: "getEntityMetadata",
        parameters: { tableName: this.metaTable(logicalName), options },
      },
    } as unknown as Parameters<DataClient["executeAsync"]>[0];
    const res = await this.client.executeAsync<unknown, RawEntityMetadata>(op);
    return unwrap(res);
  }

  async retrieve<T = DataverseRecord>(
    entitySet: string,
    id: string,
    options?: QueryOptions,
  ): Promise<T | null> {
    const res = await this.client.retrieveRecordAsync<T>(
      this.table(entitySet),
      id,
      toOperationOptions(options),
    );
    if (!res.success) throw toError(res.error);
    return (res.data as T) ?? null;
  }

  async retrieveMultiple<T = DataverseRecord>(
    entitySet: string,
    options?: QueryOptions,
  ): Promise<RetrieveMultipleResult<T>> {
    const res = await this.client.retrieveMultipleRecordsAsync<T>(
      this.table(entitySet),
      toOperationOptions(options),
    );
    if (!res.success) throw toError(res.error);
    return {
      records: (res.data as T[]) ?? [],
      totalCount: res.count,
      nextLink: res.skipToken,
    };
  }

  async retrieveNextPage<T = DataverseRecord>(
    nextLink: string,
  ): Promise<RetrieveMultipleResult<T>> {
    // `nextLink` here is the SDK skipToken; the entity set is encoded by caller.
    const [entitySet, skipToken] = nextLink.split("|");
    const res = await this.client.retrieveMultipleRecordsAsync<T>(
      this.table(entitySet),
      { skipToken },
    );
    if (!res.success) throw toError(res.error);
    return { records: (res.data as T[]) ?? [], nextLink: res.skipToken };
  }

  async create(entitySet: string, record: DataverseRecord): Promise<string> {
    const res = await this.client.createRecordAsync<DataverseRecord, DataverseRecord>(
      this.table(entitySet),
      record,
    );
    if (!res.success) throw toError(res.error);
    return extractId(res.data);
  }

  async update(entitySet: string, id: string, record: DataverseRecord): Promise<void> {
    const res = await this.client.updateRecordAsync<DataverseRecord, unknown>(
      this.table(entitySet),
      id,
      record,
    );
    if (!res.success) throw toError(res.error);
  }

  async upsert(entitySet: string, key: string, record: DataverseRecord): Promise<string> {
    // No native upsert in the DataClient; emulate create with the key encoded.
    return this.create(entitySet, { ...record, [`@key`]: key });
  }

  async executeBatch(requests: BatchRequest[]): Promise<BatchResponseItem[]> {
    // The SDK has no $batch; run the changeset as isolated ops (logical batch).
    const out: BatchResponseItem[] = [];
    for (const req of requests) {
      try {
        if (req.method === "POST") {
          const set = req.url.split("(")[0];
          const id = await this.create(set, req.body ?? {});
          out.push({ id: req.id, status: 204, entityId: id });
        } else if (req.method === "PATCH") {
          const m = req.url.match(/^([^(]+)\(([^)]+)\)/);
          if (!m) throw new DataverseError(`Bad PATCH url ${req.url}`, 400);
          await this.update(m[1], m[2], req.body ?? {});
          out.push({ id: req.id, status: 204 });
        } else {
          out.push({ id: req.id, status: 501, error: "unsupported in SDK batch" });
        }
      } catch (e) {
        out.push({ id: req.id, status: 500, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  }

  async getRaw<T = unknown>(): Promise<T> {
    throw new DataverseError(
      "getRaw is not available via the SDK client; use typed methods.",
      501,
    );
  }
}

function toOperationOptions(o?: QueryOptions) {
  if (!o) return undefined;
  return {
    select: o.select,
    filter: o.filter,
    orderBy: o.orderBy,
    top: o.top,
    maxPageSize: o.maxPageSize ?? o.top,
    count: o.includeCount,
  };
}

function unwrap<T>(res: { success: boolean; data: T; error?: unknown }): T {
  if (!res.success) throw toError(res.error);
  return res.data;
}

function extractId(data: unknown): string {
  if (data && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    // Prefer an explicit id/entityId; else the first `*id` guid field.
    for (const key of ["id", "entityId", "recordId"]) {
      if (typeof rec[key] === "string") return rec[key] as string;
    }
    const idKey = Object.keys(rec).find((k) => k.endsWith("id") && typeof rec[k] === "string");
    if (idKey) return rec[idKey] as string;
  }
  return typeof data === "string" ? data : "";
}

function toError(error: unknown): DataverseError {
  const msg = error instanceof Error ? error.message : String(error ?? "Unknown Dataverse error");
  const status = (error as { status?: number })?.status ?? 0;
  const transient = status === 429 || (status >= 500 && status < 600);
  return new DataverseError(msg, status, undefined, transient);
}
