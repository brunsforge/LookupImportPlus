/**
 * Structured condition model for lookup resolution filters.
 *
 * Conditions are NEVER stored as free-form OData strings. They are stored as
 * this structured tree and compiled to OData `$filter` at query time by the
 * resolver. This keeps them validated, editable in a builder UI, and safe to
 * serialize into a config snapshot.
 *
 * MVP: only `AND` grouping is honored by the resolver, but the group model
 * already carries a `logic` field so `OR` can be enabled later without a
 * migration.
 */

export type ConditionOperator =
  | "eq"
  | "ne"
  | "gt"
  | "ge"
  | "lt"
  | "le"
  | "contains"
  | "startswith"
  | "null"
  | "notnull"
  | "in"; // reserved for a later iteration

/** Where the right-hand comparison value comes from. */
export type ValueSourceKind =
  | "literal" // a fixed value entered in the config
  | "excelColumn" // a cell from the same Excel row
  | "relativeDate" // e.g. @utcToday(-7d), resolved at run time
  | "currentUser" // reserved: WhoAmI of the running user
  | "contextValue"; // reserved: a Dataverse context value

export interface LiteralValue {
  kind: "literal";
  value: string | number | boolean | null;
}

export interface ExcelColumnValue {
  kind: "excelColumn";
  /** Header of the Excel column whose value is used for this row. */
  column: string;
}

export interface RelativeDateValue {
  kind: "relativeDate";
  /**
   * Offset relative to "today" (UTC). Negative = past.
   * Unit is days in the MVP. Example: `-7` means `@utcToday(-7d)`.
   */
  offsetDays: number;
}

export interface CurrentUserValue {
  kind: "currentUser";
}

export interface ContextValue {
  kind: "contextValue";
  key: string;
}

export type ConditionValue =
  | LiteralValue
  | ExcelColumnValue
  | RelativeDateValue
  | CurrentUserValue
  | ContextValue;

export interface Condition {
  id: string;
  /** Logical name of the attribute on the target entity being filtered. */
  attribute: string;
  operator: ConditionOperator;
  /** Absent for `null` / `notnull` operators. */
  value?: ConditionValue;
}

export type GroupLogic = "and" | "or";

export interface ConditionGroup {
  id: string;
  logic: GroupLogic;
  conditions: Condition[];
  /** Nested groups — parsed and stored, but flattened to AND in the MVP. */
  groups?: ConditionGroup[];
}

export const EMPTY_CONDITION_GROUP: () => ConditionGroup = () => ({
  id: crypto.randomUUID(),
  logic: "and",
  conditions: [],
  groups: [],
});
