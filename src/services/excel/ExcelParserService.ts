/**
 * ExcelParserService — reads an uploaded XLSX back into headers + rows and the
 * embedded {@link TemplateManifest}. The importer uses the manifest (not the
 * visible headers alone) to know the mapping, target entity and version, and to
 * detect a tampered/outdated template.
 */

import ExcelJS from "exceljs";
import type { TemplateManifest } from "@/domain/template";
import { DATA_SHEET, MANIFEST_SHEET } from "@/domain/template";
import { hashManifest } from "./manifestHash";

export interface ParsedRow {
  /** 1-based data row number (excludes the header row). */
  rowNumber: number;
  /** Cell values keyed by column header. */
  values: Record<string, unknown>;
}

export interface ParsedWorkbook {
  manifest?: TemplateManifest;
  /** True when a manifest was present and its hash verified. */
  manifestValid: boolean;
  headers: string[];
  rows: ParsedRow[];
  warnings: string[];
}

/** Normalize an exceljs cell value into a plain JS value. */
function normalizeCell(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("text" in v) return v.text; // hyperlink / rich text
    if ("result" in v) return v.result; // formula
    if ("richText" in v && Array.isArray(v.richText))
      return v.richText.map((r) => (r as { text: string }).text).join("");
    if ("error" in v) return null;
  }
  return value;
}

export class ExcelParserService {
  async parse(data: ArrayBuffer): Promise<ParsedWorkbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data);
    const warnings: string[] = [];

    // ── manifest ──
    let manifest: TemplateManifest | undefined;
    let manifestValid = false;
    const manifestSheet = wb.getWorksheet(MANIFEST_SHEET);
    if (manifestSheet) {
      const raw = manifestSheet.getCell("A2").value;
      try {
        manifest = JSON.parse(String(raw)) as TemplateManifest;
        const { hash, generatedOn: _g, ...core } = manifest;
        manifestValid = hashManifest(core) === hash;
        if (!manifestValid) warnings.push("Template-Manifest verändert (Hash stimmt nicht) – Zuordnung bitte prüfen.");
      } catch {
        warnings.push("Verstecktes Konfigurationsblatt konnte nicht gelesen werden.");
      }
    } else {
      warnings.push("Kein LookupImportPlus-Manifest gefunden – ist das eine mit dieser App erzeugte Datei?");
    }

    // ── data sheet ──
    const ws =
      wb.getWorksheet(DATA_SHEET) ??
      wb.worksheets.find((w) => w.name !== MANIFEST_SHEET);
    if (!ws) {
      return { manifest, manifestValid, headers: [], rows: [], warnings: [...warnings, "Kein Datenblatt gefunden."] };
    }

    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    const colIndexToHeader = new Map<number, string>();
    headerRow.eachCell((cell, col) => {
      const h = String(normalizeCell(cell.value) ?? "").trim();
      if (h) {
        headers.push(h);
        colIndexToHeader.set(col, h);
      }
    });

    const rows: ParsedRow[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const values: Record<string, unknown> = {};
      let hasValue = false;
      colIndexToHeader.forEach((header, col) => {
        const v = normalizeCell(row.getCell(col).value);
        values[header] = v;
        if (v !== null && v !== "") hasValue = true;
      });
      if (hasValue) rows.push({ rowNumber: r - 1, values });
    }

    // ── manifest vs actual headers ──
    if (manifest) {
      const missing = manifest.columns
        .map((c) => c.header)
        .filter((h) => !headers.includes(h));
      if (missing.length) {
        warnings.push(`Erwartete Spalten fehlen: ${missing.join(", ")}.`);
      }
    }

    return { manifest, manifestValid, headers, rows, warnings };
  }
}
