/**
 * DataExportService — pulls records for a configuration's target entity, either
 * for a data export or a preview. Uses OData (translated from a saved view's
 * FetchXML when the config is view-based, since the SDK client speaks OData).
 *
 * It can present the records two ways:
 *  - CRM columns:    the real Dataverse attributes selected.
 *  - Schema columns: the Excel template layout (visible + technical lookup
 *                    columns + lip__recordid) mapped from each record.
 */

import type { JobConfiguration } from "@/domain/config";
import type { DataverseClient, DataverseRecord, QueryOptions } from "@/data/DataverseClient";
import { RECORD_ID_COLUMN } from "@/domain/template";
import { buildTemplateColumns } from "./excel/templateColumns";
import { fetchXmlToOData } from "./fetchxmlToOData";
import type { MetadataService } from "./MetadataService";

const FMT_SUFFIX = "@OData.Community.Display.V1.FormattedValue";
const LOGICAL_SUFFIX = "@Microsoft.Dynamics.CRM.lookuplogicalname";
/** Custom key where we stash the resolved business-key value for a lookup. */
const BK_SUFFIX = "@lip.businesskey";

export class DataExportService {
  constructor(
    private readonly client: DataverseClient,
    private readonly metadata: MetadataService,
  ) {}

  /** Real Dataverse attributes to select for a config (business + lookup value fields). */
  crmColumns(config: JobConfiguration): string[] {
    const cols = new Set<string>([config.primaryIdAttribute]);
    for (const c of config.columns) {
      if (config.lookups.some((l) => l.lookupAttribute === c.attribute)) {
        cols.add(`_${c.attribute}_value`);
      } else {
        cols.add(c.attribute);
      }
    }
    return [...cols].filter(Boolean);
  }

  /** Build the OData query for a config, honoring a view when configured. */
  buildQuery(config: JobConfiguration, viewFetchXml?: string): QueryOptions {
    const base: QueryOptions = {
      select: this.crmColumns(config),
      prefer: ['odata.include-annotations="*"'],
    };
    if (config.exportSource.kind === "savedView" && viewFetchXml) {
      const v = fetchXmlToOData(viewFetchXml);
      // Merge: keep the config's needed columns, adopt the view's filter/order.
      base.select = [...new Set([...(base.select ?? []), ...(v.select ?? [])])];
      base.filter = v.filter;
      base.orderBy = v.orderBy;
    }
    return base;
  }

  async fetchPreview(
    config: JobConfiguration,
    count: number,
    viewFetchXml?: string,
  ): Promise<DataverseRecord[]> {
    const q = this.buildQuery(config, viewFetchXml);
    // `top` alone isn't honored past the SDK's default page size — set
    // maxPageSize too so the requested number of rows actually comes back.
    const res = await this.client.retrieveMultiple(config.entitySetName, {
      ...q,
      top: count,
      maxPageSize: count,
    });
    await this.enrichLookupNames(config, res.records);
    return res.records;
  }

  /**
   * Fill the visible lookup value (name) when the FormattedValue annotation
   * isn't present in the read (the SDK's typed read doesn't send the Prefer
   * header). Collects the lookup GUIDs, resolves their names from the target
   * table in batches, and writes a synthetic FormattedValue back onto each
   * record so {@link toSchemaRow} shows the name. No-op if annotations exist.
   */
  private async enrichLookupNames(config: JobConfiguration, records: DataverseRecord[]): Promise<void> {
    for (const lk of config.lookups) {
      const valueField = `_${lk.lookupAttribute}_value`;
      const fmtField = `${valueField}${FMT_SUFFIX}`;
      const logicalField = `${valueField}${LOGICAL_SUFFIX}`;
      const bkField = `${valueField}${BK_SUFFIX}`;

      // Type (__logicalname) fallback for single-target lookups — no query needed.
      if (lk.targetEntities.length === 1) {
        for (const r of records) if (r[valueField] && r[logicalField] == null) r[logicalField] = lk.targetEntities[0];
      }

      const needName = records.some((r) => r[valueField]) && !records.some((r) => r[fmtField] != null);
      const needBk = !!(lk.businessKeyAttribute && lk.businessKeyColumn);
      if (!needName && !needBk) continue;

      // Group GUIDs by target table (from __logicalname, else single target).
      const byTarget = new Map<string, Set<string>>();
      for (const r of records) {
        const guid = r[valueField];
        if (!guid) continue;
        const target =
          (typeof r[logicalField] === "string" ? (r[logicalField] as string) : undefined) ??
          (lk.targetEntities.length === 1 ? lk.targetEntities[0] : undefined);
        if (!target) continue;
        let set = byTarget.get(target);
        if (!set) { set = new Set(); byTarget.set(target, set); }
        set.add(String(guid));
      }

      const nameByGuid = new Map<string, string>();
      const bkByGuid = new Map<string, string>();
      for (const [target, guidSet] of byTarget) {
        const summary = await this.metadata.getEntitySummary(target).catch(() => null);
        if (!summary) continue;
        const select = [...new Set([summary.primaryIdAttribute, summary.primaryNameAttribute, ...(needBk && lk.businessKeyAttribute ? [lk.businessKeyAttribute] : [])])];
        const ids = [...guidSet];
        for (let i = 0; i < ids.length; i += 40) {
          const chunk = ids.slice(i, i + 40);
          const filter = chunk.map((g) => `${summary.primaryIdAttribute} eq ${g}`).join(" or ");
          try {
            const res = await this.client.retrieveMultiple(summary.entitySetName, { select, filter, top: chunk.length, maxPageSize: chunk.length });
            for (const rec of res.records) {
              const id = String(rec[summary.primaryIdAttribute]);
              nameByGuid.set(id, String(rec[summary.primaryNameAttribute] ?? ""));
              if (needBk && lk.businessKeyAttribute) bkByGuid.set(id, String(rec[lk.businessKeyAttribute] ?? ""));
            }
          } catch {
            // ignore a failed batch — those rows just keep the GUID
          }
        }
      }

      for (const r of records) {
        const guid = r[valueField];
        if (!guid) continue;
        const id = String(guid);
        if (needName) { const name = nameByGuid.get(id); if (name) r[fmtField] = name; }
        if (needBk) { const bk = bkByGuid.get(id); if (bk != null && bk !== "") r[bkField] = bk; }
      }
    }
  }

  /** Map a raw record to the Excel schema row (keyed by template header). */
  toSchemaRow(config: JobConfiguration, record: DataverseRecord): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const col of buildTemplateColumns(config)) {
      const a = col.attribute;
      switch (col.role) {
        case "value":
          row[col.header] = a ? record[a] : "";
          break;
        case "lookupVisible":
          row[col.header] = a
            ? formatted(record, a) ?? record[`_${a}_value`] ?? ""
            : "";
          break;
        case "lookupId":
          row[col.header] = a ? record[`_${a}_value`] ?? "" : "";
          break;
        case "lookupLogicalName":
          row[col.header] = a ? record[`_${a}_value${LOGICAL_SUFFIX}`] ?? "" : "";
          break;
        case "lookupBusinessKey":
          row[col.header] = a ? record[`_${a}_value${BK_SUFFIX}`] ?? "" : "";
          break;
        case "recordId":
          row[RECORD_ID_COLUMN] = record[config.primaryIdAttribute] ?? "";
          break;
      }
    }
    return row;
  }
}

function formatted(record: DataverseRecord, attr: string): unknown {
  return record[`_${attr}_value@OData.Community.Display.V1.FormattedValue`];
}
