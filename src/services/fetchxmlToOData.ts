/**
 * Translate a saved view's FetchXML into an OData query (select/filter/orderBy/
 * top). The SDK data client speaks OData, not FetchXML, so a view-based export
 * or preview must be translated. Pragmatic/regex-based: covers the common view
 * shape (attributes, a flat filter with and/or, order, count). Unsupported
 * constructs (nested filters, link-entity, aggregates) are ignored, not fatal.
 */

import type { QueryOptions } from "@/data/DataverseClient";
import { parseFetchXmlColumns } from "./fetchxml";

const FETCH_OP_MAP: Record<string, string> = {
  eq: "eq", ne: "ne", neq: "ne", gt: "gt", ge: "ge", le: "le", lt: "lt",
};

function attr(tag: string, name: string): string | undefined {
  // Match double- or single-quoted values, allowing the other quote inside.
  const m = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? (m[1] ?? m[2]) : undefined;
}

function isNumeric(v: string): boolean {
  return v !== "" && !Number.isNaN(Number(v));
}

function literal(v: string): string {
  if (isNumeric(v)) return v;
  if (v === "true" || v === "false") return v;
  return `'${v.replace(/'/g, "''")}'`;
}

function translateCondition(tag: string): string | null {
  const a = attr(tag, "attribute");
  const op = (attr(tag, "operator") ?? "").toLowerCase();
  const value = attr(tag, "value");
  if (!a) return null;

  if (op === "null") return `${a} eq null`;
  if (op === "not-null" || op === "notnull") return `${a} ne null`;
  if (op === "like" || op === "contains") {
    if (value == null) return null;
    return `contains(${a},'${value.replace(/%/g, "").replace(/'/g, "''")}')`;
  }
  if (op === "begins-with" || op === "beginswith") {
    if (value == null) return null;
    return `startswith(${a},'${value.replace(/%/g, "").replace(/'/g, "''")}')`;
  }
  const odataOp = FETCH_OP_MAP[op];
  if (odataOp && value != null) return `${a} ${odataOp} ${literal(value)}`;
  return null; // unsupported operator — skip rather than break the query
}

export function fetchXmlToOData(fetchXml: string): QueryOptions & { entity: string | null } {
  const parsed = parseFetchXmlColumns(fetchXml);

  // top: fetch count or top attribute
  const fetchTag = /<fetch\b[^>]*>/i.exec(fetchXml)?.[0] ?? "";
  const topStr = attr(fetchTag, "count") ?? attr(fetchTag, "top");
  const top = topStr && isNumeric(topStr) ? Number(topStr) : undefined;

  // orderBy
  const orderBy: string[] = [];
  for (const m of fetchXml.matchAll(/<order\b[^>]*\/?>/gi)) {
    const a = attr(m[0], "attribute");
    if (!a) continue;
    const desc = (attr(m[0], "descending") ?? "false").toLowerCase() === "true";
    orderBy.push(`${a} ${desc ? "desc" : "asc"}`);
  }

  // filter (first flat filter block; and/or)
  const filterTag = /<filter\b[^>]*>/i.exec(fetchXml)?.[0] ?? "";
  const join = (attr(filterTag, "type") ?? "and").toLowerCase() === "or" ? " or " : " and ";
  const parts: string[] = [];
  for (const m of fetchXml.matchAll(/<condition\b[^>]*\/?>/gi)) {
    const c = translateCondition(m[0]);
    if (c) parts.push(c);
  }

  return {
    entity: parsed.entity,
    select: parsed.attributes.length ? parsed.attributes : undefined,
    filter: parts.length ? parts.join(join) : undefined,
    orderBy: orderBy.length ? orderBy : undefined,
    top,
  };
}
