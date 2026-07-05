/**
 * Dataverse metadata DTOs — the subset LookupImportPlus needs.
 *
 * These are normalized, UI-friendly shapes produced by {@link MetadataService}
 * from the raw Dataverse `EntityDefinitions` / `Attributes` /
 * `RelationshipDefinitions` payloads. Keeping a normalized layer here means the
 * rest of the app never parses raw OData metadata directly, and it stays stable
 * even if the transport underneath changes.
 */

/** Attribute categories we distinguish for import/export handling. */
export type AttributeKind =
  | "String"
  | "Memo"
  | "Integer"
  | "BigInt"
  | "Decimal"
  | "Double"
  | "Money"
  | "Boolean"
  | "DateTime"
  | "Choice" // Picklist / OptionSet
  | "MultiChoice" // MultiSelect OptionSet
  | "Lookup" // includes Customer / Owner / Regarding variants
  | "UniqueIdentifier"
  | "State"
  | "Status"
  | "Unknown";

/**
 * Whether/how a lookup can point at more than one table.
 * - `simple`  → exactly one target table (e.g. `parentcustomerid` is NOT this).
 * - `polymorphic` → multiple allowed targets (customer, owner, regarding, …).
 */
export type LookupKind = "simple" | "polymorphic";

/** A single allowed target of a lookup attribute. */
export interface LookupTarget {
  /** Logical name of the target entity, e.g. `account`. */
  logicalName: string;
  /** EntitySet name of the target, e.g. `accounts` — needed for `@odata.bind`. */
  entitySetName: string;
  /** Display name of the target entity for the UI. */
  displayName: string;
  /** Primary id attribute of the target, e.g. `accountid`. */
  primaryIdAttribute: string;
  /** Primary name attribute of the target, e.g. `name`. */
  primaryNameAttribute: string;
  /**
   * Navigation property used to bind this lookup to this specific target.
   * For polymorphic lookups the nav property is target-specific
   * (e.g. `parentcustomerid_account`), so it MUST come from relationship
   * metadata, never be guessed from the attribute + target name.
   */
  navigationProperty: string;
}

export interface AttributeMetadata {
  logicalName: string;
  displayName: string;
  kind: AttributeKind;
  /** Raw Dataverse `AttributeType` string, kept for diagnostics. */
  attributeType: string;
  /** True when the attribute can be written on create/update via the Web API. */
  isWritable: boolean;
  /** True when the attribute is required at the application level. */
  isRequired: boolean;
  /** True when this is the entity's primary id attribute. */
  isPrimaryId: boolean;
  /** True when this is the entity's primary name attribute. */
  isPrimaryName: boolean;
  /** Present only for `Lookup` attributes. */
  lookup?: {
    kind: LookupKind;
    targets: LookupTarget[];
  };
  /** Present for `Choice`/`MultiChoice`/`State`/`Status` attributes. */
  options?: OptionMetadata[];
  maxLength?: number;
}

export interface OptionMetadata {
  value: number;
  label: string;
}

export interface EntityMetadata {
  logicalName: string;
  displayName: string;
  displayCollectionName: string;
  /** EntitySet name, e.g. `contacts` — the URL segment for Web API calls. */
  entitySetName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
  /** True for user-owned tables (relevant for owner handling). */
  isActivity: boolean;
  attributes?: AttributeMetadata[];
}

/** Lightweight entity descriptor for entity pickers (no attributes loaded). */
export type EntitySummary = Pick<
  EntityMetadata,
  | "logicalName"
  | "displayName"
  | "displayCollectionName"
  | "entitySetName"
  | "primaryIdAttribute"
  | "primaryNameAttribute"
>;
