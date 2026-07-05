/**
 * Excel template manifest — the contract embedded in the hidden
 * `_LookupImportPlus` worksheet so the importer never relies on visible headers
 * alone. Written by ExcelTemplateService, read back by ExcelParserService.
 */

export const TEMPLATE_SCHEMA_VERSION = 1 as const;

/** Hidden worksheet name (created with worksheet state "veryHidden"). */
export const MANIFEST_SHEET = "_LookupImportPlus";
export const DATA_SHEET = "Daten";
/** Technical source-id column that drives update-vs-create on reimport. */
export const RECORD_ID_COLUMN = "lip__recordid";

/** Role of a generated Excel column. */
export type TemplateColumnRole =
  | "value" // a normal business attribute
  | "lookupVisible" // the human-readable lookup value
  | "lookupId" // technical GUID column (e.g. Mutterkonto__id)
  | "lookupLogicalName" // technical target-table column
  | "lookupBusinessKey" // technical business-key column
  | "recordId"; // lip__recordid

export interface TemplateColumn {
  header: string;
  /** Target attribute, when the column maps to one. */
  attribute?: string;
  role: TemplateColumnRole;
  /** Hidden by default in the sheet. */
  technical: boolean;
  /** For lookup technical columns: which lookup config they belong to. */
  lookupId?: string;
}

export interface TemplateManifest {
  configId: string;
  configName: string;
  configVersion: number;
  schemaVersion: typeof TEMPLATE_SCHEMA_VERSION;
  targetEntity: string;
  entitySetName: string;
  operation: string;
  columns: TemplateColumn[];
  /** Integrity hash of the manifest (excluding this field). */
  hash: string;
  generatedOn: string;
}
