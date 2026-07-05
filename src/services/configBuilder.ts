/**
 * Helpers for building/editing configurations in the UI from live metadata.
 */

import {
  CONFIG_SCHEMA_VERSION,
  type ColumnConfig,
  type JobConfiguration,
  type LookupConfig,
} from "@/domain/config";
import type { AttributeMetadata } from "@/domain/metadata";
import { EMPTY_CONDITION_GROUP } from "@/domain/conditions";

export function blankConfig(): JobConfiguration {
  return {
    id: `cfg-${crypto.randomUUID()}`,
    name: "",
    description: "",
    targetEntity: "",
    entitySetName: "",
    primaryIdAttribute: "",
    operation: "createOrUpdate",
    exportSource: { kind: "entity" },
    columns: [],
    lookups: [],
    validationRules: [],
    defaultMode: "strict",
    version: 1,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    isActive: false,
  };
}

/** Technical lookup column names derived from a visible header (English pattern). */
export function deriveLookupColumns(visible: string) {
  return {
    guidColumn: `${visible} Id`,
    logicalNameColumn: `${visible} Type`,
    businessKeyColumn: `${visible} Number`,
  };
}

export function columnFromAttribute(attr: AttributeMetadata, order: number): ColumnConfig {
  return {
    attribute: attr.logicalName,
    header: attr.displayName || attr.logicalName,
    usage: "importExport",
    kind: attr.kind,
    order,
  };
}

/** A sensible default lookup config for a lookup attribute, from its metadata. */
export function lookupFromAttribute(attr: AttributeMetadata): LookupConfig {
  const visible = attr.displayName || attr.logicalName;
  const targets = attr.lookup?.targets ?? [];
  const first = targets[0];
  const tech = deriveLookupColumns(visible);
  // Polymorphic: default each target's search field to its own primary name.
  const targetOverrides =
    targets.length > 1
      ? Object.fromEntries(targets.map((tg) => [tg.logicalName, { searchAttribute: tg.primaryNameAttribute || "name" }]))
      : undefined;
  return {
    id: `lk-${crypto.randomUUID()}`,
    lookupAttribute: attr.logicalName,
    targetEntities: targets.map((tg) => tg.logicalName),
    visibleColumn: visible,
    guidColumn: tech.guidColumn,
    logicalNameColumn: targets.length > 1 ? tech.logicalNameColumn : undefined,
    businessKeyColumn: undefined,
    searchAttribute: first?.primaryNameAttribute || "name",
    businessKeyAttribute: undefined,
    targetOverrides,
    strategy: { useGuidColumn: true, useBusinessKey: false, useSearchMatch: true },
    conditions: EMPTY_CONDITION_GROUP(),
    conflictStrategy: "escalate",
    candidateDisplayAttributes: first?.primaryNameAttribute ? [first.primaryNameAttribute] : [],
  };
}

