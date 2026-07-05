/**
 * Compiles the structured {@link ConditionGroup} model into a Dataverse OData
 * `$filter` string, resolving row- and time-relative values against a run
 * context. Conditions are NEVER stored or built as raw OData — this is the only
 * place structured conditions become a query string.
 *
 * MVP: groups are flattened with `AND` (the `logic` field is honored only as
 * `and`; `or` is parsed but AND-joined). Every relative-date anchor that gets
 * resolved is recorded so the import job can log the concrete timestamp used.
 */

import type {
  Condition,
  ConditionGroup,
  ConditionValue,
} from "@/domain/conditions";

export interface CompileContext {
  /** Excel row values keyed by header — source for `excelColumn` values. */
  row: Record<string, unknown>;
  /** Run timestamp; `relativeDate` values are computed from this. Defaults to now. */
  now?: Date;
}

export interface CompileResult {
  /** OData `$filter` fragment, or "" when the group has no conditions. */
  filter: string;
  /** Resolved relative-date anchors, keyed by a human-readable expression. */
  timeAnchors: Record<string, string>;
}

/** UTC midnight of `base` shifted by `offsetDays`, as an ISO string. */
export function resolveRelativeDate(offsetDays: number, base: Date): string {
  const d = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}

function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Format an OData literal from a raw JS value (string quoted, number/bool raw). */
function literalToken(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return quote(value);
}

const OPERATOR_KIND: Record<string, "binary" | "fn" | "unary"> = {
  eq: "binary", ne: "binary", gt: "binary", ge: "binary", lt: "binary", le: "binary",
  contains: "fn", startswith: "fn",
  null: "unary", notnull: "unary",
};

/**
 * Compile one condition. Returns null when it can't be represented (e.g. an
 * `excelColumn` whose cell is empty — such a condition is dropped rather than
 * producing a filter that matches everything or nothing unexpectedly).
 */
function compileCondition(
  cond: Condition,
  ctx: CompileContext,
  anchors: Record<string, string>,
): string | null {
  const kind = OPERATOR_KIND[cond.operator];
  if (cond.operator === "null") return `${cond.attribute} eq null`;
  if (cond.operator === "notnull") return `${cond.attribute} ne null`;
  if (cond.operator === "in") {
    throw new Error("Operator 'in' is not supported in the MVP compiler yet.");
  }

  const token = valueToken(cond.value, cond.attribute, cond.operator, ctx, anchors);
  if (token === null) return null;

  if (kind === "fn") {
    return `${cond.operator}(${cond.attribute},${token})`;
  }
  return `${cond.attribute} ${cond.operator} ${token}`;
}

function valueToken(
  value: ConditionValue | undefined,
  attribute: string,
  operator: string,
  ctx: CompileContext,
  anchors: Record<string, string>,
): string | null {
  if (!value) return null;
  switch (value.kind) {
    case "literal":
      return literalToken(value.value);
    case "excelColumn": {
      const raw = ctx.row[value.column];
      if (raw === undefined || raw === null || raw === "") return null;
      return literalToken(
        typeof raw === "number" || typeof raw === "boolean" ? raw : String(raw),
      );
    }
    case "relativeDate": {
      const iso = resolveRelativeDate(value.offsetDays, ctx.now ?? new Date());
      anchors[`${attribute} ${operator} @utcToday(${value.offsetDays}d)`] = iso;
      return iso; // Edm.DateTimeOffset literal is unquoted
    }
    case "currentUser":
    case "contextValue":
      throw new Error(
        `Value source '${value.kind}' is not supported in the MVP compiler yet.`,
      );
  }
}

export function compileConditionGroup(
  group: ConditionGroup | undefined,
  ctx: CompileContext,
): CompileResult {
  const anchors: Record<string, string> = {};
  if (!group) return { filter: "", timeAnchors: anchors };

  const parts: string[] = [];
  for (const c of group.conditions) {
    const compiled = compileCondition(c, ctx, anchors);
    if (compiled) parts.push(compiled);
  }
  for (const nested of group.groups ?? []) {
    const sub = compileConditionGroup(nested, { ...ctx, now: ctx.now });
    Object.assign(anchors, sub.timeAnchors);
    if (sub.filter) parts.push(`(${sub.filter})`);
  }

  // MVP: always AND-join (see module doc).
  return { filter: parts.join(" and "), timeAnchors: anchors };
}

/** AND-combine two `$filter` fragments, skipping empties. */
export function andFilters(...parts: (string | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" and ");
}
