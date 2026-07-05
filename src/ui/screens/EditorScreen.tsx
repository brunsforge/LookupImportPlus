import { useEffect, useMemo, useState } from "react";
import {
  Button, Tab, TabList, Text, tokens, Input, Textarea, Checkbox, Spinner, Field,
} from "@fluentui/react-components";
import { ArrowUploadRegular, SaveRegular, ArrowDownloadRegular, EyeRegular } from "@fluentui/react-icons";
import { useApp } from "@/app/AppContext";
import { PageHead, Card } from "../PageHead";
import { Chip } from "../StatusChip";
import { DataPreviewModal } from "../DataPreviewModal";
import { downloadXlsx } from "../download";
import type { JobConfiguration, ColumnUsage } from "@/domain/config";
import type { AttributeMetadata, EntityMetadata } from "@/domain/metadata";
import type { SavedView } from "@/services/ViewService";
import { blankConfig, columnFromAttribute, lookupFromAttribute, deriveLookupColumns } from "@/services/configBuilder";
import { fingerprintEntity } from "@/services/ConfigValidationService";
import { LookupConditionEditor } from "../LookupConditionEditor";

type TabKey = "general" | "entity" | "cols" | "lookups";

const selectStyle: React.CSSProperties = {
  padding: "6px 8px", borderRadius: 6, border: `1px solid ${tokens.colorNeutralStroke1}`,
  background: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1, fontFamily: "inherit", fontSize: 13,
};

export function EditorScreen() {
  const { container, params, navigate, t } = useApp();
  const existing = params.configId ? container.getConfig(params.configId) : undefined;

  const [draft, setDraft] = useState<JobConfiguration>(() => (existing ? structuredClone(existing) : blankConfig()));
  const [entity, setEntity] = useState<EntityMetadata | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [targetMetas, setTargetMetas] = useState<Record<string, EntityMetadata>>({});
  const [tab, setTab] = useState<TabKey>(existing ? "cols" : "entity");

  // filters
  const [search, setSearch] = useState("");
  const [lookupsOnly, setLookupsOnly] = useState(false);
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [writableOnly, setWritableOnly] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const viewFetchXml = draft.exportSource.kind === "savedView"
    ? views.find((v) => v.id === draft.exportSource.reference)?.fetchXml
    : undefined;

  async function exportData() {
    setExporting(true);
    try {
      const recs = await container.export.fetchPreview(draft, 5000, viewFetchXml);
      const rows = recs.map((r) => container.export.toSchemaRow(draft, r));
      downloadXlsx(await container.template.build(draft, rows), `${draft.name || draft.targetEntity}_Export`);
    } finally {
      setExporting(false);
    }
  }

  async function emptyTemplate() {
    downloadXlsx(await container.template.build(draft), `${draft.name || draft.targetEntity}_Template`);
  }

  useEffect(() => {
    if (!draft.targetEntity) { setEntity(null); setViews([]); return; }
    let alive = true;
    setLoadingMeta(true);
    container.metadata.getEntity(draft.targetEntity)
      .then((m) => {
        if (!alive) return;
        setEntity(m);
        setDraft((d) => ({ ...d, entitySetName: m.entitySetName, primaryIdAttribute: m.primaryIdAttribute }));
      })
      .catch(() => alive && setEntity(null))
      .finally(() => alive && setLoadingMeta(false));
    container.views.listViews(draft.targetEntity).then((v) => alive && setViews(v)).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.targetEntity]);

  // Load target-entity metadata for lookup field dropdowns + condition editor.
  const targetKey = [...new Set(draft.lookups.flatMap((l) => l.targetEntities))].sort().join(",");
  useEffect(() => {
    const targets = targetKey ? targetKey.split(",").filter(Boolean) : [];
    for (const tgt of targets) {
      if (targetMetas[tgt]) continue;
      container.metadata.getEntity(tgt).then((m) => setTargetMetas((prev) => (prev[tgt] ? prev : { ...prev, [tgt]: m }))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);
  const excelColumns = draft.columns.map((c) => c.header);

  const patch = (p: Partial<JobConfiguration>) => setDraft((d) => ({ ...d, ...p }));

  function changeEntity(logical: string) {
    setDraft((d) => ({ ...d, targetEntity: logical, entitySetName: "", primaryIdAttribute: "", columns: [], lookups: [] }));
    if (!logical) setTab("entity");
  }

  function toggleColumn(attr: AttributeMetadata, on: boolean) {
    setDraft((d) => {
      let columns = d.columns.filter((c) => c.attribute !== attr.logicalName);
      let lookups = d.lookups;
      if (on) {
        columns = [...columns, columnFromAttribute(attr, columns.length + 1)];
        if (attr.kind === "Lookup" && !d.lookups.some((l) => l.lookupAttribute === attr.logicalName))
          lookups = [...d.lookups, lookupFromAttribute(attr)];
      } else {
        lookups = d.lookups.filter((l) => l.lookupAttribute !== attr.logicalName);
      }
      return { ...d, columns, lookups };
    });
  }

  function setUsage(attribute: string, usage: ColumnUsage) {
    setDraft((d) => ({ ...d, columns: d.columns.map((c) => (c.attribute === attribute ? { ...c, usage } : c)) }));
  }

  function useViewColumns(view: SavedView) {
    if (!entity) return;
    const byName = new Map((entity.attributes ?? []).map((a) => [a.logicalName, a]));
    for (const col of view.columns) {
      const attr = byName.get(col);
      if (attr && !draft.columns.some((c) => c.attribute === col)) toggleColumn(attr, true);
    }
  }

  function save() {
    const fp = entity ? fingerprintEntity(entity) : draft.metadataFingerprint;
    const next: JobConfiguration = { ...draft, metadataFingerprint: fp, version: (existing?.version ?? 0) + 1, modifiedOn: new Date().toISOString(), isActive: true };
    container.saveConfig(next);
    navigate("configs");
  }

  const canSave = draft.name.trim() !== "" && draft.targetEntity !== "" && draft.columns.length > 0;

  const includedAttrs = new Set(draft.columns.map((c) => c.attribute));

  const filteredAttrs = useMemo(() => {
    const attrs = entity?.attributes ?? [];
    const q = search.toLowerCase();
    const included = new Set(draft.columns.map((c) => c.attribute));
    return attrs.filter((a) => {
      if (selectedOnly && !included.has(a.logicalName)) return false;
      if (lookupsOnly && a.kind !== "Lookup") return false;
      if (requiredOnly && !a.isRequired) return false;
      if (writableOnly && !a.isWritable) return false;
      if (q && !a.logicalName.toLowerCase().includes(q) && !a.displayName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entity, search, lookupsOnly, requiredOnly, writableOnly, selectedOnly, draft.columns]);

  return (
    <>
      <PageHead
        title={draft.name || t("common.newConfig")}
        subtitle={draft.targetEntity ? <>{t("configs.entity")} <b>{draft.targetEntity}</b> · v{draft.version}</> : "—"}
        actions={
          <>
            <Button appearance="subtle" onClick={() => navigate("configs")}>{t("common.cancel")}</Button>
            <Button appearance="primary" icon={<SaveRegular />} disabled={!canSave} onClick={save}>{t("common.save")}</Button>
            {existing ? <Button icon={<ArrowUploadRegular />} onClick={() => navigate("importrun", { configId: draft.id })}>{t("common.startImport")}</Button> : null}
          </>
        }
      />

      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as TabKey)} style={{ marginBottom: 18 }}>
        <Tab value="entity">1 · {t("ed.tabEntitySource")}</Tab>
        <Tab value="general" disabled={!draft.targetEntity}>2 · {t("ed.tabGeneral")}</Tab>
        <Tab value="cols" disabled={!draft.targetEntity}>3 · {t("ed.tabColumns")} {draft.columns.length ? `(${draft.columns.length})` : ""}</Tab>
        <Tab value="lookups" disabled={!draft.targetEntity}>4 · {t("ed.tabLookups")} {draft.lookups.length ? `(${draft.lookups.length})` : ""}</Tab>
      </TabList>

      {tab === "general" ? (
        <Card style={{ padding: 20, display: "grid", gap: 16, maxWidth: 620 }}>
          <Field label={t("ed.name")} required><Input value={draft.name} placeholder="e.g. Contacts – Parent Account" onChange={(_, d) => patch({ name: d.value })} /></Field>
          <Field label={t("ed.description")}><Textarea value={draft.description ?? ""} onChange={(_, d) => patch({ description: d.value })} /></Field>
          <Field label={t("ed.operation")}>
            <select style={selectStyle} value={draft.operation} onChange={(e) => patch({ operation: e.target.value as JobConfiguration["operation"] })}>
              <option value="create">create</option>
              <option value="update">update</option>
              <option value="createOrUpdate">createOrUpdate</option>
            </select>
          </Field>
          <Field label={t("ed.defaultMode")}>
            <select style={selectStyle} value={draft.defaultMode} onChange={(e) => patch({ defaultMode: e.target.value as "strict" | "partial" })}>
              <option value="strict">strict</option>
              <option value="partial">partial</option>
            </select>
          </Field>
        </Card>
      ) : null}

      {tab === "entity" ? (
        <Card style={{ padding: 20, display: "grid", gap: 16, maxWidth: 620 }}>
          <Field label={t("ed.targetEntity")} required>
            <select style={selectStyle} value={draft.targetEntity} onChange={(e) => changeEntity(e.target.value)}>
              <option value="">{t("ed.select")}</option>
              {container.availableEntities.map((en) => <option key={en} value={en}>{en}</option>)}
            </select>
          </Field>
          {loadingMeta ? <Spinner size="tiny" label={t("ed.loadingMeta")} labelPosition="after" /> : entity ? (
            <Text className="lip-mono" style={{ color: tokens.colorNeutralForeground3, fontSize: 12 }}>
              {t("ed.entitySetInfo", { set: entity.entitySetName, id: entity.primaryIdAttribute })}
            </Text>
          ) : null}

          <Field label={t("ed.exportSource")}>
            <select style={selectStyle} value={draft.exportSource.kind} onChange={(e) => patch({ exportSource: { kind: e.target.value as "entity" | "savedView", reference: undefined } })}>
              <option value="entity">{t("ed.sourceEntity")}</option>
              <option value="savedView">{t("ed.sourceView")}</option>
            </select>
          </Field>
          {draft.exportSource.kind === "savedView" ? (
            <Field label={t("ed.view")}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select style={selectStyle} value={draft.exportSource.reference ?? ""} onChange={(e) => patch({ exportSource: { kind: "savedView", reference: e.target.value } })}>
                  <option value="">{t("ed.select")}</option>
                  {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <Button size="small" disabled={!draft.exportSource.reference} onClick={() => { const v = views.find((x) => x.id === draft.exportSource.reference); if (v) useViewColumns(v); setTab("cols"); }}>
                  {t("ed.useViewColumns")}
                </Button>
              </div>
            </Field>
          ) : null}
        </Card>
      ) : null}

      {tab === "cols" ? (
        !entity ? <Card style={{ padding: 20 }}><Text>{t("ed.selectEntityFirst")}</Text></Card> : (
          <>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <Input placeholder={t("ed.searchCols")} value={search} onChange={(_, d) => setSearch(d.value)} style={{ minWidth: 220 }} />
              <Checkbox label={t("ed.selectedOnly")} checked={selectedOnly} onChange={(_, d) => setSelectedOnly(!!d.checked)} />
              <Checkbox label={t("ed.lookupsOnly")} checked={lookupsOnly} onChange={(_, d) => setLookupsOnly(!!d.checked)} />
              <Checkbox label={t("ed.requiredOnly")} checked={requiredOnly} onChange={(_, d) => setRequiredOnly(!!d.checked)} />
              <Checkbox label={t("ed.writableOnly")} checked={writableOnly} onChange={(_, d) => setWritableOnly(!!d.checked)} />
              <div style={{ flex: 1 }} />
              <Text style={{ color: tokens.colorNeutralForeground3, fontSize: 12.5 }}>{draft.columns.length} {t("ed.selected")}</Text>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <Button size="small" icon={<EyeRegular />} disabled={draft.columns.length === 0} onClick={() => setPreviewOpen(true)}>{t("ed.previewData")}</Button>
              <Button size="small" icon={<ArrowDownloadRegular />} disabled={draft.columns.length === 0} onClick={emptyTemplate}>{t("ed.emptyTemplate")}</Button>
              <Button size="small" appearance="primary" icon={<ArrowDownloadRegular />} disabled={draft.columns.length === 0 || exporting} onClick={exportData}>{exporting ? "…" : t("ed.exportData")}</Button>
            </div>
            <Card style={{ overflow: "hidden", maxHeight: 460, overflowY: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>
                  {["", t("ed.displayName"), t("ed.logicalName"), t("ed.type"), t("ed.usage")].map((h, i) => (
                    <th key={i} style={{ textAlign: "left", padding: "8px 12px", position: "sticky", top: 0, background: tokens.colorNeutralBackground1, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: tokens.colorNeutralForeground3 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredAttrs.map((a) => {
                    const included = includedAttrs.has(a.logicalName);
                    const col = draft.columns.find((c) => c.attribute === a.logicalName);
                    return (
                      <tr key={a.logicalName} style={{ borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
                        <td style={{ padding: "6px 12px" }}><Checkbox checked={included} onChange={(_, d) => toggleColumn(a, !!d.checked)} /></td>
                        <td style={{ padding: "6px 12px" }}>{a.displayName} {a.isRequired ? <Chip tone="error">{t("ed.req")}</Chip> : null}</td>
                        <td style={{ padding: "6px 12px" }} className="lip-mono">{a.logicalName}</td>
                        <td style={{ padding: "6px 12px" }}>{a.kind}</td>
                        <td style={{ padding: "6px 12px" }}>
                          {included ? (
                            <select style={selectStyle} value={col?.usage} onChange={(e) => setUsage(a.logicalName, e.target.value as ColumnUsage)}>
                              <option value="importExport">{t("ed.usageImportExport")}</option>
                              <option value="exportOnly">{t("ed.usageExportOnly")}</option>
                              <option value="importOnly">{t("ed.usageImportOnly")}</option>
                            </select>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </>
        )
      ) : null}

      {tab === "lookups" ? (
        draft.lookups.length === 0 ? <Card style={{ padding: 20 }}><Text>{t("ed.selectLookupHint")}</Text></Card> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card style={{ padding: "14px 16px", background: "var(--lip-info-soft)" }}>
              <Text weight="semibold" style={{ display: "block", marginBottom: 8 }}>{t("ed.lookupIntroTitle")}</Text>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[t("ed.match1"), t("ed.match2"), t("ed.match3")].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: tokens.colorNeutralForeground2, alignItems: "flex-start" }}>
                    <span style={{ flex: "none", width: 18, height: 18, borderRadius: "50%", background: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundInverted, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                    <span>{s}</span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, fontSize: 12.5, color: "var(--lip-amber)", alignItems: "flex-start", marginTop: 2 }}>
                  <span style={{ flex: "none", width: 18, textAlign: "center" }}>⚠</span>
                  <span>{t("ed.matchConflict")}</span>
                </div>
              </div>
              <Text style={{ display: "block", fontSize: 11.5, color: tokens.colorNeutralForeground3, marginTop: 8 }}>{t("ed.matchNote")}</Text>
            </Card>
            {draft.lookups.map((lk) => {
              const attr = entity?.attributes?.find((a) => a.logicalName === lk.lookupAttribute);
              const allowedTargets = attr?.lookup?.targets.map((tg) => tg.logicalName) ?? lk.targetEntities;
              const patchLookup = (p: Partial<typeof lk>) => setDraft((d) => ({ ...d, lookups: d.lookups.map((x) => (x.id === lk.id ? { ...x, ...p } : x)) }));
              return (
                <Card key={lk.id} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Chip tone="info">Lookup</Chip>
                    <Text weight="semibold">{lk.visibleColumn} → </Text>
                    <span className="lip-mono" style={{ color: tokens.colorNeutralForeground2 }}>{lk.lookupAttribute}</span>
                  </div>

                  <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                    <Field label={t("ed.visibleColumn")} hint={t("ed.hVisibleColumn")}>
                      <Input value={lk.visibleColumn} placeholder="e.g. Parent Account" onChange={(_, d) => { const tech = deriveLookupColumns(d.value); patchLookup({ visibleColumn: d.value, guidColumn: tech.guidColumn, logicalNameColumn: lk.logicalNameColumn ? tech.logicalNameColumn : undefined }); }} />
                    </Field>
                    <Field label={t("ed.bkColumnLabel")} hint={t("ed.hBkColumn")}>
                      <Input value={lk.businessKeyColumn ?? ""} placeholder="e.g. Parent Account Number" onChange={(_, d) => patchLookup({ businessKeyColumn: d.value || undefined, strategy: { ...lk.strategy, useBusinessKey: !!d.value } })} />
                    </Field>
                    <Field label={t("ed.conflictStrategy")} hint={t("ed.hConflictStrategy")}>
                      <select style={selectStyle} value={lk.conflictStrategy} onChange={(e) => patchLookup({ conflictStrategy: e.target.value as typeof lk.conflictStrategy })}>
                        <option value="escalate">escalate</option>
                        <option value="skipRow">skip row</option>
                        <option value="failRow">fail row</option>
                      </select>
                    </Field>
                  </div>

                  {/* Step 1: which target table(s) to search in */}
                  <div>
                    <Text style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: tokens.colorNeutralForeground3, fontWeight: 600 }}>{t("ed.targetEntitiesLabel")}</Text>
                    <Text style={{ display: "block", fontSize: 12, color: tokens.colorNeutralForeground2, margin: "3px 0 8px" }}>{t("ed.hTargetEntities")}</Text>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {allowedTargets.map((tg) => (
                        <Checkbox key={tg} label={tg} checked={lk.targetEntities.includes(tg)}
                          onChange={(_, d) => patchLookup({ targetEntities: d.checked ? [...lk.targetEntities, tg] : lk.targetEntities.filter((x) => x !== tg) })} />
                      ))}
                    </div>
                  </div>

                  {/* Step 2: per selected target — search field, business key, conditions */}
                  <div>
                    <Text style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: tokens.colorNeutralForeground3, fontWeight: 600 }}>{t("ed.perTargetConfig")}</Text>
                    {lk.targetEntities.length === 0 ? (
                      <Text style={{ display: "block", fontSize: 12.5, color: "var(--lip-amber)", marginTop: 6 }}>{t("ed.selectTargetFirst")}</Text>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                        {lk.targetEntities.map((tg) => {
                          const attrs = targetMetas[tg]?.attributes ?? [];
                          const ov = lk.targetOverrides?.[tg] ?? {};
                          const setOv = (p: { searchAttribute?: string; businessKeyAttribute?: string; conditions?: typeof lk.conditions }) =>
                            patchLookup({ targetOverrides: { ...lk.targetOverrides, [tg]: { ...ov, ...p } } });
                          const conds = ov.conditions ?? lk.conditions;
                          return (
                            <div key={tg} style={{ border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: 8, padding: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                                <Chip tone="info">{tg}</Chip>
                                <span style={{ fontSize: 11.5, color: tokens.colorNeutralForeground3 }}>{t("ed.searchFieldLabel")}:</span>
                                {attrs.length ? (
                                  <select style={selectStyle} value={ov.searchAttribute ?? lk.searchAttribute} onChange={(e) => setOv({ searchAttribute: e.target.value })}>
                                    {attrs.map((a) => <option key={a.logicalName} value={a.logicalName}>{a.displayName} ({a.logicalName})</option>)}
                                  </select>
                                ) : (
                                  <Input value={ov.searchAttribute ?? lk.searchAttribute} onChange={(_, d) => setOv({ searchAttribute: d.value })} />
                                )}
                                <span style={{ fontSize: 11.5, color: tokens.colorNeutralForeground3 }}>{t("ed.bkFieldLabel")}:</span>
                                {attrs.length ? (
                                  <select style={selectStyle} value={ov.businessKeyAttribute ?? ""} onChange={(e) => setOv({ businessKeyAttribute: e.target.value || undefined })}>
                                    <option value="">—</option>
                                    {attrs.map((a) => <option key={a.logicalName} value={a.logicalName}>{a.displayName} ({a.logicalName})</option>)}
                                  </select>
                                ) : (
                                  <Input value={ov.businessKeyAttribute ?? ""} onChange={(_, d) => setOv({ businessKeyAttribute: d.value || undefined })} />
                                )}
                              </div>
                              <Text style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: tokens.colorNeutralForeground3, fontWeight: 600 }}>{t("ed.conditionsLabel")}</Text>
                              <Text style={{ display: "block", fontSize: 11.5, color: tokens.colorNeutralForeground2, margin: "2px 0 8px" }}>{t("ed.conditionsHint")}</Text>
                              <LookupConditionEditor group={conds} targetAttrs={attrs} excelColumns={excelColumns} onChange={(g) => setOv({ conditions: g })} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : null}

      <DataPreviewModal config={draft} viewFetchXml={viewFetchXml} open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </>
  );
}
