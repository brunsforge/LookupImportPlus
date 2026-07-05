/**
 * Central, testable Dataverse Web API abstraction.
 *
 * EVERY read/write/metadata call in the app goes through this interface. It is
 * deliberately transport-agnostic: the concrete implementation may talk to the
 * Dataverse Web API directly (via a bearer token / connector proxy) in the
 * browser today, and could be swapped for a server-side runner (Custom API,
 * plug-in, Azure Function) later — without any caller changing.
 *
 * The interface intentionally exposes low-level OData primitives (entity sets,
 * `$select`/`$filter`, `@odata.bind`, `$batch`). Higher-level concepts
 * (metadata shaping, lookup resolution, import orchestration) live in the
 * service layer on top of this client.
 *
 * ── Where this runs ──────────────────────────────────────────────────────────
 * See docs/ARCHITECTURE.md. Summary: this client runs browser-side for the MVP
 * and MUST NOT hold app secrets. It authenticates as the signed-in user; all
 * permissions are enforced by Dataverse.
 */

import type { RawEntityMetadata, GetEntityMetadataOptions } from "./rawMetadata";

/** OData query options for a retrieveMultiple call. */
export interface QueryOptions {
  /** Attribute logical names to return. */
  select?: string[];
  /** Raw OData `$filter` — callers should compile this from the structured
   *  condition model rather than concatenating user input. */
  filter?: string;
  /** `$orderby` clauses, e.g. ["modifiedon desc"]. */
  orderBy?: string[];
  /** `$top` — max rows returned. */
  top?: number;
  /** Page size (`odata.maxpagesize`). Set alongside `top` to actually return N. */
  maxPageSize?: number;
  /** `$expand` clauses for related records. */
  expand?: string[];
  /** When true, request the total count via `$count`. */
  includeCount?: boolean;
  /** Extra `Prefer` header parts, e.g. `odata.include-annotations="*"`. */
  prefer?: string[];
}

export interface RetrieveMultipleResult<T = DataverseRecord> {
  records: T[];
  /** Present when includeCount was requested. */
  totalCount?: number;
  /** Opaque next-page URL, when the result was paged. */
  nextLink?: string;
}

/** A loosely-typed Dataverse record. Annotation keys (`@odata.*`) may appear. */
export type DataverseRecord = Record<string, unknown>;

/** One operation inside a `$batch` changeset. */
export interface BatchRequest {
  /** Caller-defined id to correlate the response. */
  id: string;
  method: "POST" | "PATCH" | "DELETE" | "GET";
  /** Entity set + optional key, e.g. `contacts` or `contacts(<guid>)`. */
  url: string;
  body?: DataverseRecord;
  headers?: Record<string, string>;
}

export interface BatchResponseItem {
  id: string;
  status: number;
  body?: unknown;
  /** For creates: the id of the new record, parsed from OData-EntityId. */
  entityId?: string;
  error?: string;
}

export interface WhoAmIResult {
  userId: string;
  businessUnitId: string;
  organizationId: string;
}

/**
 * Raised by client implementations on a failed Web API call. Carries enough to
 * drive per-row retry (throttling) and per-row error reporting.
 */
export class DataverseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Dataverse error code, e.g. `0x80040265`. */
    readonly errorCode?: string,
    /** True for 429 / transient 5xx — the caller may retry. */
    readonly isTransient = false,
    /** Retry-After hint in seconds, if the server sent one. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "DataverseError";
  }
}

export interface DataverseClient {
  /** Environment Web API root, e.g. `https://org.crm.dynamics.com/api/data/v9.2/`. */
  readonly apiBaseUrl: string;

  whoAmI(): Promise<WhoAmIResult>;

  retrieve<T = DataverseRecord>(
    entitySet: string,
    id: string,
    options?: QueryOptions,
  ): Promise<T | null>;

  retrieveMultiple<T = DataverseRecord>(
    entitySet: string,
    options?: QueryOptions,
  ): Promise<RetrieveMultipleResult<T>>;

  /** Follow an opaque `@odata.nextLink`. */
  retrieveNextPage<T = DataverseRecord>(
    nextLink: string,
  ): Promise<RetrieveMultipleResult<T>>;

  /** Create a record. Resolves to the new record id. */
  create(entitySet: string, record: DataverseRecord): Promise<string>;

  /** Update a record by id. */
  update(entitySet: string, id: string, record: DataverseRecord): Promise<void>;

  /** Upsert via alternate key, e.g. key = `accountnumber='A-1'`. */
  upsert(
    entitySet: string,
    key: string,
    record: DataverseRecord,
  ): Promise<string>;

  /** Execute a batch changeset. Order is preserved in the response. */
  executeBatch(requests: BatchRequest[]): Promise<BatchResponseItem[]>;

  /**
   * Retrieve raw entity metadata (attributes + relationships) for one table.
   * Backed by the SDK's Dataverse metadata capability; normalized into the
   * app's `domain` metadata types by {@link MetadataService}.
   */
  getEntityMetadata(
    logicalName: string,
    options?: GetEntityMetadataOptions,
  ): Promise<RawEntityMetadata>;

  /**
   * Raw GET against a metadata or data path relative to {@link apiBaseUrl}.
   * Escape hatch for calls not covered by the typed methods above.
   */
  getRaw<T = unknown>(relativePath: string): Promise<T>;
}
