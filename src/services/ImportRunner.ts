/**
 * ImportRunner — orchestrates a run: dry-run validation, conflict-decision
 * application, and the controlled commit (the ONLY place records are written).
 *
 * `commit` is deliberately the single write seam so a server-side runner can
 * later replace it behind the same call (see docs/ARCHITECTURE.md §5). Writes
 * are isolated per row (own error, own retry) so one bad row never aborts the
 * batch; Strict mode refuses to write while any blocking row remains.
 */

import type { JobConfiguration, LookupConfig } from "@/domain/config";
import type { ConditionGroup } from "@/domain/conditions";
import {
  BLOCKING_STATUSES,
  type ImportJob,
  type ImportMode,
  type ImportRow,
  type LookupResolution,
  type ResolutionDecision,
  type RowStatus,
} from "@/domain/import";
import type { EntityMetadata } from "@/domain/metadata";
import { RECORD_ID_COLUMN } from "@/domain/template";
import { DataverseError, type DataverseClient, type DataverseRecord } from "@/data/DataverseClient";
import type { MetadataService } from "./MetadataService";
import type { LookupResolver } from "./LookupResolver";
import type { ParsedRow } from "./excel/ExcelParserService";

export interface DryRunOptions {
  now?: Date;
  mode?: ImportMode;
  /** Progress callback (rows evaluated). Enables a determinate progress bar. */
  onProgress?: (done: number, total: number) => void;
}

export interface CommitOptions {
  maxRetries?: number;
  /** Parallel in-flight writes (bulk acceleration). Default 6. */
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

const WRITABLE: ReadonlySet<RowStatus> = new Set<RowStatus>([
  "Ready",
  "LookupResolved",
  "Warning",
]);

export class ImportRunner {
  constructor(
    private readonly client: DataverseClient,
    private readonly metadata: MetadataService,
    private readonly resolver: LookupResolver,
  ) {}

  // ── Dry run ──────────────────────────────────────────────
  async dryRun(
    config: JobConfiguration,
    parsed: ParsedRow[],
    opts: DryRunOptions = {},
  ): Promise<ImportJob> {
    const now = opts.now ?? new Date();
    const startedBy = (await this.client.whoAmI()).userId;
    const total = parsed.length;

    // Dedup identical lookup inputs so N rows with the same value cost one query
    // (e.g. 41 rows "Contoso GmbH" → a single resolver call). This is the main
    // large-volume optimization for the dry run.
    const resolveCache = new Map<string, LookupResolution>();

    const rows: ImportRow[] = [];
    let done = 0;
    for (const p of parsed) {
      const raw = p.values;
      const targetRecordId = readString(raw[RECORD_ID_COLUMN]) ?? undefined;
      const messages: string[] = [];

      // required-field validation
      let blockingValidation: RowStatus | null = null;
      for (const rule of config.validationRules) {
        if (rule.kind === "required") {
          const col = config.columns.find((c) => c.attribute === rule.attribute);
          const header = col?.header ?? rule.attribute;
          if (readString(raw[header]) === null) {
            blockingValidation = "MissingRequiredValue";
            messages.push(rule.message ?? `Pflichtfeld fehlt: ${header}`);
          }
        }
      }

      // lookups (cached by the row values each lookup actually reads)
      const lookups: LookupResolution[] = [];
      for (const lk of config.lookups) {
        const key = lookupCacheKey(lk, raw);
        let res = resolveCache.get(key);
        if (!res) {
          try {
            res = await this.resolver.resolve(lk, raw, { now });
          } catch (e) {
            // Schema drift / transient query failure: never abort the whole run.
            res = {
              lookupConfigId: lk.id,
              lookupAttribute: lk.lookupAttribute,
              sourceValue: readString(raw[lk.visibleColumn]),
              status: "notFound",
            };
            messages.push(`Lookup '${lk.lookupAttribute}' konnte nicht ausgewertet werden: ${e instanceof Error ? e.message : String(e)}`);
          }
          resolveCache.set(key, res);
        }
        // Per-row copy so a later manual decision on one row never mutates others.
        lookups.push(structuredClone(res));
      }

      const status = blockingValidation ?? lookupRowStatus(lookups);
      rows.push({ rowNumber: p.rowNumber, raw, targetRecordId, status, messages, lookups });
      opts.onProgress?.(++done, total);
    }

    flagDuplicates(rows);

    const job: ImportJob = {
      id: crypto.randomUUID(),
      configId: config.id,
      configSnapshot: structuredClone(config),
      mode: opts.mode ?? config.defaultMode,
      status: "validated",
      startedOn: now.toISOString(),
      startedBy,
      rowCount: rows.length,
      readyCount: 0,
      errorCount: 0,
      conflictCount: 0,
      committedCount: 0,
      rows,
      decisions: [],
    };
    recomputeCounts(job);
    job.status = job.conflictCount > 0 ? "awaitingConflicts" : "validated";
    return job;
  }

  // ── Apply a conflict resolution decision ─────────────────
  applyDecision(job: ImportJob, decision: ResolutionDecision): ImportJob {
    const targets = job.rows.filter((row) => {
      if (!decision.appliedToAll) return row.rowNumber === decision.rowNumber;
      return row.lookups.some(
        (l) =>
          l.lookupAttribute === decision.lookupAttribute &&
          l.sourceValue === decision.sourceValue &&
          (l.status === "ambiguous" || l.status === "notFound"),
      );
    });

    for (const row of targets) {
      const res = row.lookups.find((l) => l.lookupAttribute === decision.lookupAttribute);
      if (!res) continue;
      if (decision.chosenId === null) {
        row.status = "Skipped";
      } else {
        res.status = "resolved";
        res.method = "manual";
        res.resolvedId = decision.chosenId;
        res.resolvedEntity = decision.chosenEntity;
        res.candidates = undefined;
        row.status = row.messages.length ? row.status : lookupRowStatus(row.lookups);
      }
    }

    job.decisions.push(decision);
    recomputeCounts(job);
    job.status = job.conflictCount > 0 ? "awaitingConflicts" : "validated";
    return job;
  }

  // ── Commit ───────────────────────────────────────────────
  async commit(job: ImportJob, opts: CommitOptions = {}): Promise<ImportJob> {
    const config = job.configSnapshot;
    const entityMeta = await this.metadata.getEntity(config.targetEntity);

    const hasBlocking = job.rows.some((r) => BLOCKING_STATUSES.has(r.status));
    if (job.mode === "strict" && hasBlocking) {
      // Strict mode never writes while unresolved blocking rows remain.
      return job;
    }

    const writable = job.rows.filter((r) => WRITABLE.has(r.status));
    const total = writable.length;
    let done = 0;
    job.status = "committing";

    // Bounded-concurrency write pool: N in flight at once, each row isolated
    // with its own retry so one failure never aborts the batch.
    await runPool(writable, Math.max(1, opts.concurrency ?? 6), async (row) => {
      try {
        const recordId = await this.writeRow(config, entityMeta, row, opts.maxRetries ?? 3);
        row.writeResult = { success: true, recordId };
        row.status = "Committed";
      } catch (e) {
        const err = e instanceof DataverseError ? e : undefined;
        row.writeResult = { success: false, error: e instanceof Error ? e.message : String(e), httpStatus: err?.status };
        row.status = "CommitFailed";
      }
      done++;
      opts.onProgress?.(done, total);
    });

    recomputeCounts(job);
    job.committedCount = job.rows.filter((r) => r.status === "Committed").length;
    job.status = job.rows.some((r) => r.status === "CommitFailed") ? "completedWithErrors" : "completed";
    job.finishedOn = new Date().toISOString();
    return job;
  }

  private async writeRow(
    config: JobConfiguration,
    entityMeta: EntityMetadata,
    row: ImportRow,
    maxRetries: number,
  ): Promise<string> {
    const payload = this.buildPayload(config, entityMeta, row);

    const doUpdate =
      config.operation === "update" ||
      (config.operation === "createOrUpdate" && !!row.targetRecordId);

    if (config.operation === "update" && !row.targetRecordId) {
      throw new DataverseError(`Update ohne ${RECORD_ID_COLUMN}`, 400);
    }

    return withRetry(maxRetries, async () => {
      if (doUpdate) {
        await this.client.update(config.entitySetName, row.targetRecordId!, payload);
        return row.targetRecordId!;
      }
      return this.client.create(config.entitySetName, payload);
    });
  }

  /** Map a row to a Dataverse record payload, including `@odata.bind` lookups. */
  private buildPayload(
    config: JobConfiguration,
    entityMeta: EntityMetadata,
    row: ImportRow,
  ): DataverseRecord {
    const payload: DataverseRecord = {};

    for (const col of config.columns) {
      if (col.usage === "technical" || col.usage === "exportOnly") continue;
      if (config.lookups.some((l) => l.lookupAttribute === col.attribute)) continue; // lookups handled below
      const value = coerce(row.raw[col.header], col.kind);
      if (value !== undefined) payload[col.attribute] = value;
    }

    for (const res of row.lookups) {
      if (res.status !== "resolved" || !res.resolvedId || !res.resolvedEntity) continue;
      const attr = entityMeta.attributes?.find((a) => a.logicalName === res.lookupAttribute);
      const target = attr?.lookup?.targets.find((t) => t.logicalName === res.resolvedEntity);
      if (!target?.navigationProperty || !target.entitySetName) continue;
      payload[`${target.navigationProperty}@odata.bind`] = `/${target.entitySetName}(${res.resolvedId})`;
    }
    return payload;
  }
}

// ── helpers ────────────────────────────────────────────────

/** Excel columns referenced anywhere in a condition group's value sources. */
function collectExcelColumns(group: ConditionGroup | undefined, into: string[] = []): string[] {
  if (!group) return into;
  for (const c of group.conditions) {
    if (c.value?.kind === "excelColumn") into.push(c.value.column);
  }
  for (const g of group.groups ?? []) collectExcelColumns(g, into);
  return into;
}

/**
 * Cache key covering every row value a lookup reads: the visible/technical
 * columns and any Excel columns referenced by its conditions. Two rows with the
 * same inputs resolve identically, so they can share one query.
 */
function lookupCacheKey(lk: LookupConfig, row: Record<string, unknown>): string {
  const cols = [
    lk.visibleColumn,
    lk.guidColumn,
    lk.logicalNameColumn,
    lk.businessKeyColumn,
    ...collectExcelColumns(lk.conditions),
  ].filter((c): c is string => Boolean(c));
  const parts = cols.map((c) => `${c}=${readString(row[c]) ?? ""}`);
  return `${lk.id}|${parts.join("|")}`;
}

/** Row status contributed by its lookups (excluding validation blocks). */
export function lookupRowStatus(lookups: LookupResolution[]): RowStatus {
  if (lookups.some((l) => l.status === "wrongTargetType")) return "LookupWrongTargetType";
  if (lookups.some((l) => l.status === "notFound")) return "LookupNotFound";
  if (lookups.some((l) => l.status === "ambiguous")) return "LookupAmbiguous";
  if (lookups.length && lookups.every((l) => l.status === "resolved")) return "LookupResolved";
  return "Ready";
}

function flagDuplicates(rows: ImportRow[]): void {
  const seen = new Map<string, ImportRow>();
  for (const row of rows) {
    if (!row.targetRecordId) continue;
    const prev = seen.get(row.targetRecordId);
    if (prev) {
      row.status = "DuplicateInFile";
      row.messages.push(`Dieselbe Ziel-ID wie Zeile ${prev.rowNumber}.`);
    } else {
      seen.set(row.targetRecordId, row);
    }
  }
}

function recomputeCounts(job: ImportJob): void {
  let ready = 0, error = 0, conflict = 0;
  for (const r of job.rows) {
    if (r.status === "Ready" || r.status === "LookupResolved") ready++;
    if (r.status === "LookupAmbiguous" || r.status === "LookupNotFound" || r.status === "LookupWrongTargetType") conflict++;
    else if (BLOCKING_STATUSES.has(r.status)) error++;
  }
  job.readyCount = ready;
  job.errorCount = error;
  job.conflictCount = conflict;
}

/** Run `worker` over `items` with at most `limit` in flight at a time. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

async function withRetry<T>(maxRetries: number, fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      const transient = e instanceof DataverseError && e.isTransient;
      if (!transient || attempt >= maxRetries) throw e;
      attempt++;
      const waitMs = (e as DataverseError).retryAfterSeconds != null
        ? (e as DataverseError).retryAfterSeconds! * 1000
        : Math.min(2000 * attempt, 8000);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

function coerce(raw: unknown, kind: string): unknown {
  if (raw === undefined || raw === null || raw === "") return undefined;
  switch (kind) {
    case "Integer":
    case "BigInt": {
      const n = parseInt(String(raw), 10);
      return Number.isNaN(n) ? undefined : n;
    }
    case "Decimal":
    case "Double":
    case "Money": {
      const n = parseFloat(String(raw));
      return Number.isNaN(n) ? undefined : n;
    }
    case "Boolean":
      if (typeof raw === "boolean") return raw;
      return ["true", "1", "ja", "yes", "wahr"].includes(String(raw).toLowerCase());
    default:
      return String(raw);
  }
}

function readString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
