/**
 * ExcelTemplateService — generates the import/export XLSX.
 *
 * Produces a `Daten` sheet with the visible + technical columns (technical
 * lookup columns and `lip__recordid` hidden by default) and a very-hidden
 * `_LookupImportPlus` sheet carrying the {@link TemplateManifest}, so the
 * importer can trust the mapping/version regardless of visible headers.
 */

import ExcelJS from "exceljs";
import type { JobConfiguration } from "@/domain/config";
import type { TemplateColumn, TemplateManifest } from "@/domain/template";
import {
  DATA_SHEET,
  MANIFEST_SHEET,
  TEMPLATE_SCHEMA_VERSION,
} from "@/domain/template";
import { buildTemplateColumns } from "./templateColumns";
import { hashManifest } from "./manifestHash";

export class ExcelTemplateService {
  /** Build the manifest (without I/O) — exposed for inspection/tests. */
  buildManifest(config: JobConfiguration, columns?: TemplateColumn[]): TemplateManifest {
    const cols = columns ?? buildTemplateColumns(config);
    const core = {
      configId: config.id,
      configName: config.name,
      configVersion: config.version,
      schemaVersion: TEMPLATE_SCHEMA_VERSION,
      targetEntity: config.targetEntity,
      entitySetName: config.entitySetName,
      operation: config.operation,
      columns: cols,
    };
    return { ...core, hash: hashManifest(core), generatedOn: new Date().toISOString() };
  }

  /**
   * Build the workbook. Pass `dataRows` (keyed by column header) for a data
   * export; omit for an empty template.
   */
  async build(
    config: JobConfiguration,
    dataRows?: Record<string, unknown>[],
  ): Promise<ArrayBuffer> {
    const columns = buildTemplateColumns(config);
    const manifest = this.buildManifest(config, columns);

    const wb = new ExcelJS.Workbook();
    wb.creator = "LookupImportPlus";
    wb.created = new Date();

    const ws = wb.addWorksheet(DATA_SHEET, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = columns.map((c) => ({
      header: c.header,
      key: c.header,
      width: Math.max(12, c.header.length + 2),
      hidden: c.technical,
    }));
    ws.getRow(1).font = { bold: true };

    for (const row of dataRows ?? []) ws.addRow(row);

    const hidden = wb.addWorksheet(MANIFEST_SHEET, { state: "veryHidden" });
    hidden.getCell("A1").value = "LookupImportPlus-Manifest — do not edit";
    hidden.getCell("A2").value = JSON.stringify(manifest);

    return wb.xlsx.writeBuffer();
  }
}
