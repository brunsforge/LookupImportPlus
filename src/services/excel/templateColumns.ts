/**
 * Pure derivation of the Excel column layout from a job configuration.
 * Kept separate from the exceljs I/O so the column logic is unit-testable.
 */

import type { JobConfiguration, LookupConfig } from "@/domain/config";
import type { TemplateColumn } from "@/domain/template";
import { RECORD_ID_COLUMN } from "@/domain/template";

function lookupColumns(lk: LookupConfig): TemplateColumn[] {
  const cols: TemplateColumn[] = [];
  if (lk.guidColumn)
    cols.push({ header: lk.guidColumn, role: "lookupId", technical: true, lookupId: lk.id, attribute: lk.lookupAttribute });
  if (lk.logicalNameColumn)
    cols.push({ header: lk.logicalNameColumn, role: "lookupLogicalName", technical: true, lookupId: lk.id, attribute: lk.lookupAttribute });
  if (lk.businessKeyColumn)
    cols.push({ header: lk.businessKeyColumn, role: "lookupBusinessKey", technical: true, lookupId: lk.id, attribute: lk.lookupAttribute });
  return cols;
}

/**
 * Ordered template columns: each configured column in order, and immediately
 * after a lookup's visible column its technical columns (__id / __logicalname /
 * business key). `lip__recordid` is appended for operations that can update.
 */
export function buildTemplateColumns(config: JobConfiguration): TemplateColumn[] {
  const lookupByAttr = new Map(config.lookups.map((l) => [l.lookupAttribute, l]));
  const ordered = [...config.columns].sort((a, b) => a.order - b.order);
  const out: TemplateColumn[] = [];

  for (const col of ordered) {
    const lk = lookupByAttr.get(col.attribute);
    out.push({
      header: col.header,
      attribute: col.attribute,
      role: lk ? "lookupVisible" : "value",
      technical: col.usage === "technical",
      ...(lk ? { lookupId: lk.id } : {}),
    });
    if (lk) out.push(...lookupColumns(lk));
  }

  if (config.operation !== "create") {
    out.push({ header: RECORD_ID_COLUMN, role: "recordId", technical: true });
  }
  return out;
}
