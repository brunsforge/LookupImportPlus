/**
 * Import run model — jobs, rows, lookup resolution results and audit decisions.
 *
 * These shapes back both the in-app run state and the persisted `lip_*`
 * Dataverse audit tables. The persisted columns are derived from these types by
 * {@link ImportJobRepository}.
 */

import type { JobConfiguration } from "./config";

/** Per-row evaluation status. Mirrors the handover's status vocabulary. */
export type RowStatus =
  | "Ready"
  | "Warning"
  | "MissingRequiredValue"
  | "InvalidFormat"
  | "LookupResolved"
  | "LookupNotFound"
  | "LookupAmbiguous"
  | "LookupWrongTargetType"
  | "PermissionIssue"
  | "DuplicateInFile"
  | "WriteBlocked"
  | "Skipped"
  | "Committed" // written successfully
  | "CommitFailed"; // write attempted and failed

/** Statuses that block a Strict-mode commit until resolved. */
export const BLOCKING_STATUSES: ReadonlySet<RowStatus> = new Set<RowStatus>([
  "MissingRequiredValue",
  "InvalidFormat",
  "LookupNotFound",
  "LookupAmbiguous",
  "LookupWrongTargetType",
  "WriteBlocked",
  "CommitFailed",
]);

export type ImportMode = "strict" | "partial";

export type ImportJobStatus =
  | "draft" // uploaded, not yet dry-run
  | "validated" // dry run complete
  | "awaitingConflicts" // has unresolved conflicts
  | "committing"
  | "completed"
  | "completedWithErrors"
  | "aborted";

/** A candidate record returned while resolving a lookup value. */
export interface LookupCandidate {
  id: string; // GUID of the candidate record
  entityLogicalName: string;
  primaryName: string;
  /** Selected display attributes → raw values, for the conflict dialog. */
  attributes: Record<string, unknown>;
  /** Deep link to open the record in Dataverse. */
  recordUrl?: string;
}

/** Outcome of resolving one lookup value on one row. */
export type LookupResolutionStatus =
  | "resolved"
  | "notFound"
  | "ambiguous"
  | "wrongTargetType"
  | "pending"; // not yet attempted

export interface LookupResolution {
  lookupConfigId: string;
  lookupAttribute: string;
  sourceValue: string | null;
  status: LookupResolutionStatus;
  /** How the match was obtained, for audit/UI. */
  method?: "guid" | "businessKey" | "searchMatch" | "manual";
  /** Set when `status === "resolved"`. */
  resolvedId?: string;
  resolvedEntity?: string;
  /** All candidates found (populated on `ambiguous`). */
  candidates?: LookupCandidate[];
  /** OData filter actually used, captured for audit. */
  appliedFilter?: string;
  /** Relative-date anchors resolved to concrete timestamps at run time. */
  resolvedTimeAnchors?: Record<string, string>;
}

export interface ImportRow {
  /** 1-based Excel row number (data rows, excluding header). */
  rowNumber: number;
  /** Raw cell values keyed by Excel header. */
  raw: Record<string, unknown>;
  /** Target record id from `lip__recordid`, if present. */
  targetRecordId?: string;
  status: RowStatus;
  messages: string[];
  lookups: LookupResolution[];
  /** Write result, populated after commit. */
  writeResult?: {
    success: boolean;
    recordId?: string;
    error?: string;
    httpStatus?: number;
  };
}

/** An audit record of a manual conflict resolution. */
export interface ResolutionDecision {
  id: string;
  rowNumber: number;
  lookupAttribute: string;
  sourceValue: string | null;
  candidates: LookupCandidate[];
  /** Chosen target, or null when the user chose to skip. */
  chosenId: string | null;
  chosenEntity?: string;
  appliedFilter?: string;
  decidedBy: string;
  decidedOn: string;
  /** True when the decision was applied to all matching conflicts in the job. */
  appliedToAll: boolean;
}

export interface ImportJob {
  id: string;
  configId: string;
  /** Immutable snapshot of the configuration used for this run. */
  configSnapshot: JobConfiguration;
  mode: ImportMode;
  status: ImportJobStatus;
  startedOn: string;
  finishedOn?: string;
  startedBy: string;
  fileName?: string;

  rowCount: number;
  readyCount: number;
  errorCount: number;
  conflictCount: number;
  committedCount: number;

  rows: ImportRow[];
  decisions: ResolutionDecision[];
}
