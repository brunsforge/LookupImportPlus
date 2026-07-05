/**
 * Config validation issues — the result of checking a saved configuration
 * against the *current* Dataverse metadata (schema drift protection).
 *
 * Issues carry a machine `code` (+ params) so the UI can render a localized
 * message; they never throw, so a run can decide to block (errors) or proceed
 * with warnings instead of hitting a raw Web API exception mid-run.
 */

export type IssueSeverity = "error" | "warning" | "info";

export type ConfigIssueCode =
  | "entityMissing"
  | "entitySetChanged"
  | "primaryIdChanged"
  | "attributeMissing"
  | "attributeNotWritable"
  | "attributeTypeChanged"
  | "lookupAttributeMissing"
  | "lookupAttributeNotLookup"
  | "lookupTargetNotAllowed"
  | "navPropMissing"
  | "searchAttributeMissing"
  | "businessKeyAttributeMissing"
  | "conditionAttributeMissing"
  | "schemaChangedSinceSave";

export interface ConfigIssue {
  severity: IssueSeverity;
  code: ConfigIssueCode;
  /** The config element the issue is about (attribute / lookup / entity). */
  target: string;
  /** Substitution values for the localized message. */
  params?: Record<string, string>;
}

export interface ConfigValidationResult {
  issues: ConfigIssue[];
  hasErrors: boolean;
  /** Recomputed metadata fingerprint (store back on the config after a save). */
  fingerprint: string;
}
