/**
 * ConfigValidationService — preflight check of a saved configuration against the
 * CURRENT Dataverse metadata, so schema drift (renamed/removed columns, changed
 * lookup targets, type changes, entity-set renames) surfaces as clear issues
 * before a run instead of as a raw Web API exception mid-import.
 */

import type { JobConfiguration } from "@/domain/config";
import type { EntityMetadata } from "@/domain/metadata";
import type { ConfigIssue, ConfigValidationResult } from "@/domain/issues";
import type { MetadataService } from "./MetadataService";
import { djb2 } from "./excel/manifestHash";

/** Stable fingerprint of the metadata a config depends on. */
export function fingerprintEntity(entity: EntityMetadata): string {
  const attrs = (entity.attributes ?? [])
    .map((a) => {
      const targets = a.lookup?.targets
        .map((t) => `${t.logicalName}:${t.navigationProperty}`)
        .sort()
        .join("+");
      return `${a.logicalName}:${a.kind}:${a.isWritable ? 1 : 0}${targets ? `:${targets}` : ""}`;
    })
    .sort()
    .join("|");
  return djb2(`${entity.logicalName}|${entity.entitySetName}|${entity.primaryIdAttribute}|${attrs}`);
}

export class ConfigValidationService {
  constructor(private readonly metadata: MetadataService) {}

  async validate(config: JobConfiguration): Promise<ConfigValidationResult> {
    const issues: ConfigIssue[] = [];

    let entity: EntityMetadata;
    try {
      entity = await this.metadata.getEntity(config.targetEntity);
    } catch {
      return {
        issues: [{ severity: "error", code: "entityMissing", target: config.targetEntity }],
        hasErrors: true,
        fingerprint: "",
      };
    }

    const fingerprint = fingerprintEntity(entity);
    const byName = new Map((entity.attributes ?? []).map((a) => [a.logicalName, a]));

    // ── entity-level drift ──
    if (entity.entitySetName !== config.entitySetName)
      issues.push({ severity: "warning", code: "entitySetChanged", target: config.targetEntity, params: { expected: config.entitySetName, actual: entity.entitySetName } });
    if (entity.primaryIdAttribute !== config.primaryIdAttribute)
      issues.push({ severity: "warning", code: "primaryIdChanged", target: config.targetEntity, params: { expected: config.primaryIdAttribute, actual: entity.primaryIdAttribute } });

    // ── columns ──
    for (const col of config.columns) {
      const attr = byName.get(col.attribute);
      if (!attr) {
        issues.push({ severity: "error", code: "attributeMissing", target: col.attribute });
        continue;
      }
      if ((col.usage === "importExport" || col.usage === "importOnly") && attr.kind !== "Lookup" && !attr.isWritable)
        issues.push({ severity: "warning", code: "attributeNotWritable", target: col.attribute });
      if (col.kind && attr.kind !== col.kind)
        issues.push({ severity: "warning", code: "attributeTypeChanged", target: col.attribute, params: { was: col.kind, now: attr.kind } });
    }

    // ── lookups ──
    for (const lk of config.lookups) {
      const la = byName.get(lk.lookupAttribute);
      if (!la) {
        issues.push({ severity: "error", code: "lookupAttributeMissing", target: lk.lookupAttribute });
        continue;
      }
      if (la.kind !== "Lookup") {
        issues.push({ severity: "error", code: "lookupAttributeNotLookup", target: lk.lookupAttribute, params: { now: la.kind } });
        continue;
      }
      const allowed = new Map((la.lookup?.targets ?? []).map((tg) => [tg.logicalName, tg]));
      for (const target of lk.targetEntities) {
        const tgt = allowed.get(target);
        if (!tgt) {
          issues.push({ severity: "error", code: "lookupTargetNotAllowed", target: lk.lookupAttribute, params: { entity: target } });
          continue;
        }
        if (!tgt.navigationProperty)
          issues.push({ severity: "error", code: "navPropMissing", target: lk.lookupAttribute, params: { entity: target } });
        await this.checkTargetAttributes(lk, target, issues);
      }
    }

    // ── metadata drift since save ──
    if (config.metadataFingerprint && config.metadataFingerprint !== fingerprint)
      issues.push({ severity: "info", code: "schemaChangedSinceSave", target: config.targetEntity });

    return { issues, hasErrors: issues.some((i) => i.severity === "error"), fingerprint };
  }

  /** Check search/business-key/condition attributes exist on a lookup target. */
  private async checkTargetAttributes(
    lk: JobConfiguration["lookups"][number],
    targetLogical: string,
    issues: ConfigIssue[],
  ): Promise<void> {
    let target: EntityMetadata;
    try {
      target = await this.metadata.getEntity(targetLogical);
    } catch {
      return; // Target metadata unavailable — runtime handles it defensively.
    }
    const names = new Set((target.attributes ?? []).map((a) => a.logicalName));

    // Effective per-target fields (override → default) for polymorphic lookups.
    const searchAttr = lk.targetOverrides?.[targetLogical]?.searchAttribute || lk.searchAttribute;
    const bkAttr = lk.targetOverrides?.[targetLogical]?.businessKeyAttribute || lk.businessKeyAttribute;

    if (searchAttr && !names.has(searchAttr))
      issues.push({ severity: "error", code: "searchAttributeMissing", target: lk.lookupAttribute, params: { attr: searchAttr, entity: targetLogical } });
    if (bkAttr && !names.has(bkAttr))
      issues.push({ severity: "warning", code: "businessKeyAttributeMissing", target: lk.lookupAttribute, params: { attr: bkAttr, entity: targetLogical } });
    const conds = lk.targetOverrides?.[targetLogical]?.conditions ?? lk.conditions;
    for (const c of conds.conditions) {
      if (!names.has(c.attribute))
        issues.push({ severity: "error", code: "conditionAttributeMissing", target: lk.lookupAttribute, params: { attr: c.attribute, entity: targetLogical } });
    }
  }
}
