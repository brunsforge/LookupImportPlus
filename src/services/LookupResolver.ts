/**
 * LookupResolver — resolves one Excel value to a target Dataverse record for a
 * configured lookup, following the fixed, auditable order from the handover:
 *
 *   1. GUID column present      → retrieve by id, verify target type
 *   2. Business key present     → query by business-key attribute
 *   3. Search attribute + conditions → query candidates
 *      · exactly one match → resolved
 *      · zero matches      → NotFound
 *      · many matches      → Ambiguous (NEVER guessed — escalated)
 *
 * The resolver performs NO writes. It returns a {@link LookupResolution}
 * carrying the outcome, the candidates (on ambiguity), the OData filter used,
 * and any resolved relative-date anchors — everything the conflict UI and the
 * audit log (`lip_resolutiondecision`) need.
 */

import type { LookupConfig } from "@/domain/config";
import type { ConditionGroup } from "@/domain/conditions";
import type {
  LookupCandidate,
  LookupResolution,
} from "@/domain/import";
import type { EntitySummary } from "@/domain/metadata";
import type { DataverseClient, DataverseRecord } from "@/data/DataverseClient";
import type { MetadataService } from "./MetadataService";
import { andFilters, compileConditionGroup } from "./conditionCompiler";

export interface ResolveOptions {
  /** Run timestamp used for relative-date conditions. Defaults to now. */
  now?: Date;
}

export class LookupResolver {
  constructor(
    private readonly client: DataverseClient,
    private readonly metadata: MetadataService,
  ) {}

  async resolve(
    lookup: LookupConfig,
    row: Record<string, unknown>,
    opts: ResolveOptions = {},
  ): Promise<LookupResolution> {
    const base: LookupResolution = {
      lookupConfigId: lookup.id,
      lookupAttribute: lookup.lookupAttribute,
      sourceValue: readString(row[lookup.visibleColumn]),
      status: "pending",
    };

    // Determine which target entities are in play. A logical-name column, when
    // filled, pins the target (and must be an allowed one).
    const pinned = lookup.logicalNameColumn
      ? readString(row[lookup.logicalNameColumn])
      : null;
    if (pinned && !lookup.targetEntities.includes(pinned)) {
      return { ...base, status: "wrongTargetType" };
    }
    const targetLogicalNames = pinned ? [pinned] : lookup.targetEntities;

    // ── 1. GUID ──────────────────────────────────────────────
    const guid = lookup.guidColumn ? readString(row[lookup.guidColumn]) : null;
    if (lookup.strategy.useGuidColumn && guid) {
      const byGuid = await this.resolveByGuid(lookup, guid, targetLogicalNames);
      if (byGuid) return { ...base, ...byGuid };
      // GUID missing/invalid → fall through to the next strategy.
    }

    // ── 2. Business key ─────────────────────────────────────
    const bkValue = lookup.businessKeyColumn
      ? readString(row[lookup.businessKeyColumn])
      : null;
    if (lookup.strategy.useBusinessKey && bkValue) {
      const escaped = bkValue.replace(/'/g, "''");
      const candidates = await this.queryCandidates(lookup, targetLogicalNames, (target) => {
        const attr = bkAttrFor(lookup, target);
        return attr ? `${attr} eq '${escaped}'` : null;
      });
      const outcome = decide(candidates, "businessKey");
      if (outcome.status !== "notFound") {
        return { ...base, ...outcome };
      }
      // No business-key hit → fall through to search matching.
    }

    // ── 3. Search attribute + conditions (per-target for polymorphic) ──
    if (lookup.strategy.useSearchMatch) {
      const value = base.sourceValue;
      if (!value) {
        return { ...base, status: "notFound" };
      }
      const escaped = value.replace(/'/g, "''");
      const anchors: Record<string, string> = {};
      const filterFor = (target: string): string | null => {
        const attr = searchAttrFor(lookup, target);
        if (!attr) return null;
        // Conditions can be per-target for polymorphic lookups.
        const compiled = compileConditionGroup(conditionsFor(lookup, target), { row, now: opts.now });
        Object.assign(anchors, compiled.timeAnchors);
        return andFilters(`${attr} eq '${escaped}'`, compiled.filter);
      };
      const candidates = await this.queryCandidates(lookup, targetLogicalNames, filterFor);
      const outcome = decide(candidates, "searchMatch");
      return {
        ...base,
        ...outcome,
        appliedFilter: filterFor(targetLogicalNames[0]) ?? undefined,
        resolvedTimeAnchors: anchors,
      };
    }

    return { ...base, status: "notFound" };
  }

  private async resolveByGuid(
    lookup: LookupConfig,
    guid: string,
    targetLogicalNames: string[],
  ): Promise<Partial<LookupResolution> | null> {
    for (const logicalName of targetLogicalNames) {
      const summary = await this.metadata.getEntitySummary(logicalName);
      const record = await this.client.retrieve(summary.entitySetName, guid, {
        select: this.selectFor(lookup, summary),
      });
      if (record) {
        return {
          status: "resolved",
          method: "guid",
          resolvedId: guid,
          resolvedEntity: logicalName,
        };
      }
    }
    return null;
  }

  /**
   * Query each target with its own filter (built by `filterFor`) and collect
   * candidates. Targets whose filter is null (e.g. no business-key attribute for
   * that table) are skipped — never queried with an empty filter.
   */
  private async queryCandidates(
    lookup: LookupConfig,
    targetLogicalNames: string[],
    filterFor: (target: string) => string | null,
  ): Promise<LookupCandidate[]> {
    const out: LookupCandidate[] = [];
    for (const logicalName of targetLogicalNames) {
      const filter = filterFor(logicalName);
      if (!filter) continue;
      const summary = await this.metadata.getEntitySummary(logicalName);
      const result = await this.client.retrieveMultiple(summary.entitySetName, {
        select: this.selectFor(lookup, summary),
        filter,
        top: 50,
      });
      for (const rec of result.records) {
        out.push(this.toCandidate(rec, summary, lookup));
      }
    }
    return out;
  }

  private selectFor(lookup: LookupConfig, summary: EntitySummary): string[] {
    return [
      ...new Set([
        summary.primaryIdAttribute,
        summary.primaryNameAttribute,
        ...lookup.candidateDisplayAttributes,
      ]),
    ];
  }

  private toCandidate(
    rec: DataverseRecord,
    summary: EntitySummary,
    lookup: LookupConfig,
  ): LookupCandidate {
    const id = String(rec[summary.primaryIdAttribute] ?? "");
    const attributes: Record<string, unknown> = {};
    for (const a of lookup.candidateDisplayAttributes) attributes[a] = rec[a];
    return {
      id,
      entityLogicalName: summary.logicalName,
      primaryName: readString(rec[summary.primaryNameAttribute]) ?? "",
      attributes,
      recordUrl: this.recordUrl(summary.logicalName, id),
    };
  }

  /** Deep link to open the record in the model-driven UI. */
  private recordUrl(logicalName: string, id: string): string {
    const orgBase = this.client.apiBaseUrl.split("/api/data/")[0];
    return `${orgBase}/main.aspx?pagetype=entityrecord&etn=${logicalName}&id=${id}`;
  }
}

/** Turn a candidate set into a resolution outcome. */
function decide(
  candidates: LookupCandidate[],
  method: "businessKey" | "searchMatch",
): Pick<LookupResolution, "status" | "method" | "resolvedId" | "resolvedEntity" | "candidates"> {
  if (candidates.length === 0) return { status: "notFound" };
  if (candidates.length === 1) {
    return {
      status: "resolved",
      method,
      resolvedId: candidates[0].id,
      resolvedEntity: candidates[0].entityLogicalName,
    };
  }
  return { status: "ambiguous", candidates };
}

function readString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Search attribute for a given target (per-target override → default). */
function searchAttrFor(lk: LookupConfig, target: string): string {
  return lk.targetOverrides?.[target]?.searchAttribute || lk.searchAttribute;
}

/** Business-key attribute for a given target (per-target override → default). */
function bkAttrFor(lk: LookupConfig, target: string): string | undefined {
  return lk.targetOverrides?.[target]?.businessKeyAttribute || lk.businessKeyAttribute;
}

/** Conditions for a given target (per-target override → default group). */
function conditionsFor(lk: LookupConfig, target: string): ConditionGroup {
  return lk.targetOverrides?.[target]?.conditions ?? lk.conditions;
}
