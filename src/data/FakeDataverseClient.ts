/**
 * In-memory {@link DataverseClient} for offline development and unit tests.
 *
 * Ships canned metadata for `account` and `contact` (including the polymorphic
 * `parentcustomerid` Customer lookup) and a tiny record store. Query support is
 * intentionally minimal for now: `top` is honored; a small `$filter` subset
 * (`eq`, `contains`) is evaluated so early LookupResolver tests can run. Full
 * OData parity is not a goal — the live `SdkDataverseClient` handles that.
 */

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
import type { RawEntityMetadata } from "./rawMetadata";
import { FAKE_METADATA, FAKE_ENTITYSET_BY_LOGICAL } from "./fakeFixtures";

type Store = Record<string, Map<string, DataverseRecord>>;

export interface FakeSeed {
  /** Records keyed by entity set name, e.g. { accounts: [...] }. */
  records?: Record<string, DataverseRecord[]>;
}

export class FakeDataverseClient implements DataverseClient {
  readonly apiBaseUrl = "https://fake.crm.dynamics.com/api/data/v9.2/";
  private readonly store: Store = {};

  constructor(seed?: FakeSeed) {
    for (const [set, recs] of Object.entries(seed?.records ?? {})) {
      const map = new Map<string, DataverseRecord>();
      for (const r of recs) {
        const id = String(r[this.idField(set)] ?? crypto.randomUUID());
        map.set(id, { ...r, [this.idField(set)]: id });
      }
      this.store[set] = map;
    }
  }

  private idField(entitySet: string): string {
    // account(s) → accountid, contact(s) → contactid, lip_x(es) → …id
    const singular = entitySet.replace(/ies$/, "y").replace(/s$/, "");
    return `${singular}id`;
  }

  async whoAmI(): Promise<WhoAmIResult> {
    return {
      userId: "00000000-0000-0000-0000-000000000001",
      businessUnitId: "00000000-0000-0000-0000-0000000000b1",
      organizationId: "00000000-0000-0000-0000-0000000000f0",
    };
  }

  async getEntityMetadata(logicalName: string): Promise<RawEntityMetadata> {
    const meta = FAKE_METADATA[logicalName];
    if (!meta) {
      throw new DataverseError(`No fake metadata for '${logicalName}'`, 404);
    }
    return meta;
  }

  async retrieve<T = DataverseRecord>(
    entitySet: string,
    id: string,
  ): Promise<T | null> {
    return (this.store[entitySet]?.get(id) as T) ?? null;
  }

  async retrieveMultiple<T = DataverseRecord>(
    entitySet: string,
    options?: QueryOptions,
  ): Promise<RetrieveMultipleResult<T>> {
    let records = [...(this.store[entitySet]?.values() ?? [])];
    if (options?.filter) {
      records = records.filter((r) => matchesFilter(r, options.filter!));
    }
    const total = records.length;
    if (options?.top) records = records.slice(0, options.top);
    return {
      records: records as T[],
      totalCount: options?.includeCount ? total : undefined,
    };
  }

  async retrieveNextPage<T = DataverseRecord>(): Promise<RetrieveMultipleResult<T>> {
    return { records: [] };
  }

  async create(entitySet: string, record: DataverseRecord): Promise<string> {
    const id = String(record[this.idField(entitySet)] ?? crypto.randomUUID());
    const map = (this.store[entitySet] ??= new Map());
    map.set(id, { ...record, [this.idField(entitySet)]: id });
    return id;
  }

  async update(
    entitySet: string,
    id: string,
    record: DataverseRecord,
  ): Promise<void> {
    const map = this.store[entitySet];
    const existing = map?.get(id);
    if (!existing) throw new DataverseError(`Record ${id} not found`, 404);
    map!.set(id, { ...existing, ...record });
  }

  async upsert(
    entitySet: string,
    key: string,
    record: DataverseRecord,
  ): Promise<string> {
    // Minimal: treat the key expression as the id.
    await this.create(entitySet, { ...record, [this.idField(entitySet)]: key });
    return key;
  }

  async executeBatch(requests: BatchRequest[]): Promise<BatchResponseItem[]> {
    const out: BatchResponseItem[] = [];
    for (const req of requests) {
      try {
        if (req.method === "POST") {
          const set = req.url.split("(")[0];
          const id = await this.create(set, req.body ?? {});
          out.push({ id: req.id, status: 204, entityId: id });
        } else if (req.method === "PATCH") {
          const [, set, id] = req.url.match(/^([^(]+)\(([^)]+)\)/) ?? [];
          await this.update(set, id, req.body ?? {});
          out.push({ id: req.id, status: 204 });
        } else {
          out.push({ id: req.id, status: 501, error: "not implemented" });
        }
      } catch (e) {
        out.push({
          id: req.id,
          status: 500,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return out;
  }

  async getRaw<T = unknown>(): Promise<T> {
    throw new DataverseError("getRaw not supported by FakeDataverseClient", 501);
  }

  /** Test helper: current records for an entity set. */
  dump(entitySet: string): DataverseRecord[] {
    return [...(this.store[entitySet]?.values() ?? [])];
  }
}

export { FAKE_ENTITYSET_BY_LOGICAL };

/** Extremely small `$filter` evaluator: supports `A eq 'v'` and `contains(A,'v')`. */
function matchesFilter(record: DataverseRecord, filter: string): boolean {
  // Split top-level " and " (no grouping/OR support — matches MVP resolver).
  const clauses = filter.split(/\s+and\s+/i);
  return clauses.every((c) => matchesClause(record, c.trim()));
}

function matchesClause(record: DataverseRecord, clause: string): boolean {
  const eq = clause.match(/^(\w+)\s+eq\s+(.+)$/i);
  if (eq) {
    return String(record[eq[1]] ?? "") === unquote(eq[2]);
  }
  const contains = clause.match(/^contains\((\w+),\s*(.+)\)$/i);
  if (contains) {
    return String(record[contains[1]] ?? "")
      .toLowerCase()
      .includes(unquote(contains[2]).toLowerCase());
  }
  const ge = clause.match(/^(\w+)\s+ge\s+(.+)$/i);
  if (ge) {
    return String(record[ge[1]] ?? "") >= unquote(ge[2]);
  }
  const le = clause.match(/^(\w+)\s+le\s+(.+)$/i);
  if (le) {
    return String(record[le[1]] ?? "") <= unquote(le[2]);
  }
  // Unknown clause: do not silently match.
  return false;
}

function unquote(v: string): string {
  const t = v.trim();
  return t.startsWith("'") && t.endsWith("'") ? t.slice(1, -1) : t;
}
