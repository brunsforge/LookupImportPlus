import { useReducer, useState } from "react";
import {
  Button, Text, tokens,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
} from "@fluentui/react-components";
import { AddRegular, ArrowDownloadRegular, ArrowUploadRegular, EditRegular, DeleteRegular } from "@fluentui/react-icons";
import { useApp } from "@/app/AppContext";
import { PageHead, Card } from "../PageHead";
import { Chip } from "../StatusChip";
import { downloadXlsx } from "../download";

export function ConfigListScreen() {
  const { container, navigate, t } = useApp();
  const [, refresh] = useReducer((x) => x + 1, 0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const configs = container.listConfigs();
  const deleteName = configs.find((c) => c.id === deleteId)?.name ?? "";

  async function exportTemplate(configId: string) {
    const config = container.getConfig(configId)!;
    const buf = await container.template.build(config);
    downloadXlsx(buf, `${config.name}_Template`);
  }

  async function exportData(configId: string) {
    const config = container.getConfig(configId)!;
    setExportingId(configId);
    try {
      let viewXml: string | undefined;
      if (config.exportSource.kind === "savedView" && config.exportSource.reference) {
        const views = await container.views.listViews(config.targetEntity);
        viewXml = views.find((v) => v.id === config.exportSource.reference)?.fetchXml;
      }
      const recs = await container.export.fetchPreview(config, 5000, viewXml);
      const rows = recs.map((r) => container.export.toSchemaRow(config, r));
      downloadXlsx(await container.template.build(config, rows), `${config.name}_Export`);
    } finally {
      setExportingId(null);
    }
  }

  function newConfig() {
    // Start the guided editor on a fresh draft; nothing is saved until Save.
    navigate("editor");
  }

  function confirmDelete() {
    if (deleteId) container.deleteConfig(deleteId);
    setDeleteId(null);
    refresh();
  }

  return (
    <>
      <PageHead
        title={t("nav.configs")}
        subtitle={t("configs.subtitle")}
        actions={
          <>
            <Button icon={<AddRegular />} appearance="primary" onClick={newConfig}>{t("common.newConfig")}</Button>
            <Button icon={<ArrowUploadRegular />} onClick={() => navigate("importrun")}>{t("common.importExcel")}</Button>
          </>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {configs.map((c) => (
          <Card key={c.id} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Text weight="semibold" style={{ fontSize: 15.5 }}>{c.name || t("common.newConfig")}</Text>
                <Chip tone="neutral">v{c.version}</Chip>
                {c.isActive ? null : <Chip tone="skip">{t("configs.draft")}</Chip>}
              </div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8, color: tokens.colorNeutralForeground2, fontSize: 12.5 }}>
                <span>{t("configs.entity")} <b>{c.targetEntity || "—"}</b></span>
                <span>{t("configs.operation")} <b>{c.operation}</b></span>
                <span>{c.columns.length} {t("configs.columns")} · <b>{c.lookups.length} {t("configs.lookups")}</b></span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button size="small" icon={<ArrowDownloadRegular />} disabled={!c.targetEntity || exportingId === c.id}>
                    {exportingId === c.id ? "…" : t("common.export")} ▾
                  </Button>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem onClick={() => exportTemplate(c.id)}>{t("ed.emptyTemplate")}</MenuItem>
                    <MenuItem onClick={() => exportData(c.id)}>{t("ed.exportData")}</MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
              <Button size="small" icon={<EditRegular />} onClick={() => navigate("editor", { configId: c.id })}>{t("common.edit")}</Button>
              <Button size="small" appearance="primary" icon={<ArrowUploadRegular />} onClick={() => navigate("importrun", { configId: c.id })} disabled={!c.targetEntity} title={t("run.uploadXlsx")}>{t("common.startImport")}</Button>
              <Button size="small" appearance="subtle" icon={<DeleteRegular />} aria-label={t("common.delete")} onClick={() => setDeleteId(c.id)} />
            </div>
          </Card>
        ))}
        {configs.length === 0 ? (
          <Card style={{ padding: 24 }}><Text style={{ color: tokens.colorNeutralForeground2 }}>{t("configs.subtitle")}</Text></Card>
        ) : null}
      </div>

      <Dialog open={!!deleteId} onOpenChange={(_, d) => { if (!d.open) setDeleteId(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("configs.deleteTitle")}</DialogTitle>
            <DialogContent>{t("configs.deleteBody", { name: deleteName })}</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDeleteId(null)}>{t("common.cancel")}</Button>
              <Button appearance="primary" style={{ background: "var(--lip-error)" }} onClick={confirmDelete}>{t("common.delete")}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
