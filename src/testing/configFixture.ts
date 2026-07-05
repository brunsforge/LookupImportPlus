/**
 * Shared demo configuration — the acceptance-criteria example: `contact` with
 * firstname/lastname and a `parentcustomerid` lookup onto `account.name`, with
 * an optional `modifiedon >= @utcToday(-7d)` condition. Used by tests and by the
 * app's in-memory demo seed.
 */

import { CONFIG_SCHEMA_VERSION, type JobConfiguration } from "@/domain/config";
import type { ConditionGroup } from "@/domain/conditions";

export function recentlyModifiedCondition(): ConditionGroup {
  return {
    id: "cond-root",
    logic: "and",
    groups: [],
    conditions: [
      {
        id: "cond-modifiedon",
        attribute: "modifiedon",
        operator: "ge",
        value: { kind: "relativeDate", offsetDays: -7 },
      },
    ],
  };
}

export function makeContactConfig(
  overrides: Partial<JobConfiguration> = {},
): JobConfiguration {
  return {
    id: "cfg-contact-parent-account",
    name: "Contacts – Parent Account",
    description: "Create/update contacts and link them to their parent account.",
    targetEntity: "contact",
    entitySetName: "contacts",
    primaryIdAttribute: "contactid",
    operation: "createOrUpdate",
    exportSource: { kind: "entity" },
    columns: [
      { attribute: "firstname", header: "First Name", usage: "importExport", kind: "String", order: 1 },
      { attribute: "lastname", header: "Last Name", usage: "importExport", kind: "String", order: 2 },
      { attribute: "parentcustomerid", header: "Parent Account", usage: "importExport", kind: "Lookup", order: 3 },
    ],
    lookups: [
      {
        id: "lk-parent-account",
        lookupAttribute: "parentcustomerid",
        targetEntities: ["account"],
        visibleColumn: "Parent Account",
        guidColumn: "Parent Account Id",
        logicalNameColumn: "Parent Account Type",
        businessKeyColumn: "Parent Account Number",
        searchAttribute: "name",
        businessKeyAttribute: "accountnumber",
        strategy: { useGuidColumn: true, useBusinessKey: true, useSearchMatch: true },
        conditions: recentlyModifiedCondition(),
        conflictStrategy: "escalate",
        candidateDisplayAttributes: ["name", "accountnumber", "modifiedon"],
      },
    ],
    validationRules: [
      { id: "req-lastname", attribute: "lastname", kind: "required", message: "Nachname ist erforderlich." },
    ],
    defaultMode: "strict",
    version: 4,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    isActive: true,
    ...overrides,
  };
}
