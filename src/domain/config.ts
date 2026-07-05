/**
 * Job configuration model — the versioned description of how one Excel file is
 * exported from and imported back into one Dataverse entity.
 *
 * A configuration is stored as versioned JSON (see {@link JobConfiguration}).
 * Every import run captures an immutable snapshot of the config it used, so
 * later edits never retro-actively change how an old run was interpreted.
 */

import type { ConditionGroup } from "./conditions";

/** What the import does with each incoming row. */
export type OperationType =
  | "create"
  | "update" // keyed on the exported record id (lip__recordid)
  | "createOrUpdate"
  | "upsertAlternateKey"; // reserved for a later iteration

/** How a single Excel column maps to a Dataverse attribute. */
export type ColumnUsage =
  | "importExport" // read on export, written on import
  | "exportOnly" // shown on export, ignored on import
  | "importOnly" // written on import, not produced on export
  | "technical"; // helper column (id / logicalname / recordid), not a business field

export interface ColumnConfig {
  /** Attribute logical name on the target entity. */
  attribute: string;
  /** Header shown in the Excel file. Defaults to the attribute display name. */
  header: string;
  usage: ColumnUsage;
  /** Attribute kind, cached from metadata for offline validation. */
  kind: string;
  /** Order within the exported sheet. */
  order: number;
}

/** How multiple candidates for a lookup are handled. */
export type ConflictStrategy =
  | "escalate" // send to the conflict worklist (default, never guesses)
  | "skipRow" // mark the row Skipped
  | "failRow"; // mark the row as an error

/** How a lookup value is resolved to a target record. */
export interface ResolutionStrategy {
  /** Try the technical GUID column first when present. Almost always true. */
  useGuidColumn: boolean;
  /** Try the business key (e.g. accountnumber) before name matching. */
  useBusinessKey: boolean;
  /** Fall back to matching on the configured search attribute(s). */
  useSearchMatch: boolean;
}

/**
 * Configuration for one lookup attribute on the target entity.
 *
 * The three core questions the handover names, made explicit:
 *  1. which Excel value describes the target  → {@link visibleColumn}
 *  2. in which target entity/entities to search → {@link targetEntities}
 *  3. in which attribute of that entity to search → {@link searchAttribute}
 */
export interface LookupConfig {
  id: string;
  /** Lookup attribute on the target record, e.g. `parentcustomerid`. */
  lookupAttribute: string;

  /** Allowed target tables (>1 ⇒ polymorphic). Logical names. */
  targetEntities: string[];

  /** Human-readable Excel column carrying the lookup value, e.g. `Mutterkonto`. */
  visibleColumn: string;
  /** Technical GUID column, e.g. `Mutterkonto__id`. */
  guidColumn?: string;
  /** Technical target-table column, e.g. `Mutterkonto__logicalname` (required for polymorphic). */
  logicalNameColumn?: string;
  /** Optional business-key column, e.g. `Mutterkonto__accountnumber`. */
  businessKeyColumn?: string;

  /** Default attribute searched on the target entity, e.g. `name`. */
  searchAttribute: string;
  /** Default attribute compared against the business-key column, e.g. `accountnumber`. */
  businessKeyAttribute?: string;

  /**
   * Per-target field overrides for POLYMORPHIC lookups, keyed by target logical
   * name. Different tables use different logical names (e.g. `account.name` vs
   * `contact.fullname`), so search/business-key attributes can differ per target.
   * Falls back to {@link searchAttribute} / {@link businessKeyAttribute}.
   */
  targetOverrides?: Record<string, { searchAttribute?: string; businessKeyAttribute?: string; conditions?: ConditionGroup }>;

  strategy: ResolutionStrategy;
  /** Extra filter conditions applied during search matching. */
  conditions: ConditionGroup;
  conflictStrategy: ConflictStrategy;

  /** Attributes shown for each candidate in the conflict dialog. */
  candidateDisplayAttributes: string[];
}

/** A single validation rule applied to a column during the dry run. */
export interface ValidationRule {
  id: string;
  attribute: string;
  kind: "required" | "regex" | "range" | "custom";
  /** Rule-specific parameters (pattern, min/max, …). */
  params?: Record<string, unknown>;
  message?: string;
}

/** Where export data comes from. MVP supports the entity itself. */
export type ExportSourceKind = "entity" | "savedView" | "fetchXml";

export interface ExportSource {
  kind: ExportSourceKind;
  /** For `savedView`: the savedquery id. For `fetchXml`: the raw FetchXML. */
  reference?: string;
}

/** Current schema version of the configuration document shape itself. */
export const CONFIG_SCHEMA_VERSION = 1 as const;

export interface JobConfiguration {
  id: string;
  name: string;
  description?: string;

  /** Target entity logical name, e.g. `contact`. */
  targetEntity: string;
  /** Target entity set name, e.g. `contacts`. */
  entitySetName: string;
  /** Primary id attribute of the target entity, e.g. `contactid`. */
  primaryIdAttribute: string;

  operation: OperationType;
  exportSource: ExportSource;

  columns: ColumnConfig[];
  lookups: LookupConfig[];
  validationRules: ValidationRule[];

  /** Default write behavior for runs created from this config. */
  defaultMode: "strict" | "partial";

  /**
   * Fingerprint of the target entity's relevant metadata (attributes + lookup
   * targets/nav properties) at save time. Used to detect schema drift since the
   * config was last validated. See ConfigValidationService.
   */
  metadataFingerprint?: string;

  /** Monotonic config version, bumped on every saved edit. */
  version: number;
  /** Shape version of this document, for migrations. */
  schemaVersion: typeof CONFIG_SCHEMA_VERSION;

  isActive: boolean;
  createdOn?: string;
  modifiedOn?: string;
}
