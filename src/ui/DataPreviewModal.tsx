import { useEffect, useMemo, useState } from "react";
import {
  Button, Spinner, Text, tokens,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from "@fluentui/react-components";
import { useApp } from "@/app/AppContext";
import { buildTemplateColumns } from "@/services/excel/templateColumns";
import type { JobConfiguration } from "@/domain/config";
import type { DataverseRecord } from "@/data/DataverseClient";

const COUNTS = [10, 25, 50];
/** Distinct colors for lookup groups (solid = legend swatch; +22 = header tint). */
const GROUP_COLORS = ["#5B3CC4", "#0F6CBD", "#B95A00", "#2F7D43", "#146C94", "#9A3B8C", "#B0271F"];

export function DataPreviewModal({
  config,
  viewFetchXml,
  open,
  onClose,
}: {
  config: JobConfiguration;
  viewFetchXml?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { container, t } = useApp();
  const [mode, setMode] = useState<"crm" | "schema">("schema");
  const [count, setCount] = useState(10);
  const [records, setRecords] = useState<DataverseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !config.targetEntity) return;
    let alive = true;
    setLoading(true);
    setError(null);
    container.export
      .fetchPreview(config, count, viewFetchXml)
      .then((r) => alive && setRecords(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, count, config.id, viewFetchXml]);

  const view = useMemo(() => {
    if (mode === "crm") {
      const cols = container.export.crmColumns(config);
      return {
        columns: cols.map((h) => ({ header: h, color: undefined as string | undefined })),
        rows: records.map((r) => cols.map((c) => stringify(r[c]))),
        legend: [] as { color: string; label: string; attr: string }[],
      };
    }
    const tcols = buildTemplateColumns(config);
    const colorByLookup = new Map<string, string>();
    config.lookups.forEach((lk, i) => colorByLookup.set(lk.id, GROUP_COLORS[i % GROUP_COLORS.length]));
    const columns = tcols.map((c) => ({ header: c.header, color: c.lookupId ? colorByLookup.get(c.lookupId) : undefined }));
    const mapped = records.map((r) => container.export.toSchemaRow(config, r));
    const rows = mapped.map((m) => tcols.map((c) => stringify(m[c.header])));
    const legend = config.lookups.map((lk, i) => ({ color: GROUP_COLORS[i % GROUP_COLORS.length], label: lk.visibleColumn, attr: lk.lookupAttribute }));
    return { columns, rows, legend };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, records, config]);

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface style={{ maxWidth: "min(1680px, 97vw)", width: "97vw" }}>
        <DialogBody>
          <DialogTitle>{t("preview.title")} · {config.targetEntity}</DialogTitle>
          <DialogContent>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ display: "inline-flex", border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: 7, overflow: "hidden" }}>
                {(["crm", "schema"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)}
                    style={{ padding: "6px 12px", border: 0, cursor: "pointer", fontSize: 12.5, fontFamily: "inherit", background: mode === m ? tokens.colorBrandBackground : tokens.colorNeutralBackground1, color: mode === m ? tokens.colorNeutralForegroundInverted : tokens.colorNeutralForeground2, fontWeight: mode === m ? 600 : 400 }}>
                    {m === "crm" ? t("preview.crmCols") : t("preview.schemaCols")}
                  </button>
                ))}
              </div>
              <label style={{ fontSize: 12.5, color: tokens.colorNeutralForeground2 }}>
                {t("preview.rows")}:{" "}
                <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${tokens.colorNeutralStroke1}`, background: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1 }}>
                  {COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <div style={{ flex: 1 }} />
              <Text style={{ fontSize: 11.5, color: tokens.colorNeutralForeground3, maxWidth: "52ch" }}>{t("preview.hint")}</Text>
            </div>

            {/* Legend: which columns belong to which lookup (schema view) */}
            {mode === "schema" && view.legend.length ? (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 10, padding: "8px 10px", background: tokens.colorNeutralBackground2, borderRadius: 6 }}>
                <Text style={{ fontSize: 11.5, color: tokens.colorNeutralForeground3, fontWeight: 600 }}>{t("preview.legend")}:</Text>
                {view.legend.map((l) => (
                  <span key={l.attr} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: l.color, flex: "none" }} />
                    {l.label} <span className="lip-mono" style={{ color: tokens.colorNeutralForeground3 }}>({l.attr})</span>
                  </span>
                ))}
              </div>
            ) : null}

            {loading ? (
              <Spinner label={t("preview.loading")} labelPosition="after" size="small" />
            ) : error ? (
              <Text style={{ color: "var(--lip-error)" }}>{error}</Text>
            ) : view.rows.length === 0 ? (
              <Text style={{ color: tokens.colorNeutralForeground2 }}>{t("preview.empty")}</Text>
            ) : (
              <div style={{ overflow: "auto", maxHeight: "74vh", border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: 6 }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      {view.columns.map((c) => (
                        <th key={c.header} className="lip-mono"
                          style={{
                            textAlign: "left", padding: "7px 10px", position: "sticky", top: 0, whiteSpace: "nowrap",
                            background: c.color ? `${c.color}22` : tokens.colorNeutralBackground1,
                            borderBottom: c.color ? `2px solid ${c.color}` : `1px solid ${tokens.colorNeutralStroke2}`,
                            color: c.color ?? tokens.colorNeutralForeground2,
                          }}>{c.header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
                        {r.map((v, j) => (
                          <td key={j} style={{ padding: "6px 10px", whiteSpace: "nowrap", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", background: view.columns[j].color ? `${view.columns[j].color}0d` : undefined }}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>{t("common.close")}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}
