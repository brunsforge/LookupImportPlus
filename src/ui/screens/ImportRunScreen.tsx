import { useEffect, useRef, useState } from "react";
import {
  Button, Spinner, Text, tokens, ProgressBar, Field,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from "@fluentui/react-components";
import { DocumentAddRegular, ArrowUploadRegular, WarningRegular } from "@fluentui/react-icons";
import { useApp } from "@/app/AppContext";
import { PageHead, Card } from "../PageHead";
import { StatusChip } from "../StatusChip";
import { ConfigIssues } from "../ConfigIssues";
import type { ImportMode } from "@/domain/import";
import type { ConfigIssue } from "@/domain/issues";

const DEMO_ROWS: Record<string, unknown>[] = [
  { "First Name": "Max", "Last Name": "Mustermann", "Parent Account": "Contoso GmbH" }, // ambiguous
  { "First Name": "Erika", "Last Name": "Schmidt", "Parent Account": "Fabrikam Inc." }, // resolved
  { "First Name": "Tom", "Parent Account": "Adventure Works" }, // missing Last Name
  { "First Name": "Lena", "Last Name": "Berg", "Parent Account": "Unknown Corp" }, // not found
];

export function ImportRunScreen() {
  const { container, params, job, setJob, navigate, pushHistory, t, notifyUser } = useApp();
  const config = container.getConfig(params.configId ?? "") ?? container.listConfigs()[0];
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [mode, setMode] = useState<ImportMode>(config?.defaultMode ?? "strict");
  const [check, setCheck] = useState<{ issues: ConfigIssue[]; hasErrors: boolean } | null>(null);
  const [checking, setChecking] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const configId = config?.id;
  useEffect(() => {
    if (!config) return;
    let alive = true;
    setChecking(true);
    setCheck(null);
    container.validation
      .validate(config)
      .then((r) => alive && setCheck({ issues: r.issues, hasErrors: r.hasErrors }))
      .catch(() => alive && setCheck({ issues: [], hasErrors: false }))
      .finally(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId]);

  if (!config) return <Text>{t("conf.noRun")}</Text>;

  function recheck() {
    setChecking(true);
    container.validation.validate(config).then((r) => { setCheck({ issues: r.issues, hasErrors: r.hasErrors }); }).finally(() => setChecking(false));
  }
  const gated = checking || (check?.hasErrors ?? false);

  async function runDry(parsedRows: { rowNumber: number; values: Record<string, unknown> }[]) {
    setBusy(t("run.busyDry"));
    setProgress({ done: 0, total: parsedRows.length });
    try {
      const j = await container.runner.dryRun(config, parsedRows, { mode, onProgress: (done, total) => setProgress({ done, total }) });
      setJob(j);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function loadDemo() {
    setBusy(t("run.busyDemo"));
    try {
      const buf = await container.template.build(config, DEMO_ROWS);
      const parsed = await container.parser.parse(buf);
      await runDry(parsed.rows);
    } finally {
      setBusy(null);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(t("run.busyRead"));
    try {
      const parsed = await container.parser.parse(await file.arrayBuffer());
      await runDry(parsed.rows);
    } finally {
      setBusy(null);
      e.target.value = "";
    }
  }

  async function commit() {
    if (!job) return;
    setBusy(t("run.busyWrite"));
    setProgress({ done: 0, total: job.readyCount });
    try {
      const committed = await container.runner.commit({ ...job, mode }, { onProgress: (done, total) => setProgress({ done, total }) });
      pushHistory(committed);
      setJob({ ...committed });
      notifyUser(t("notif.doneTitle"), t("notif.doneBody", { written: committed.committedCount, errors: committed.errorCount, conflicts: committed.conflictCount }));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const active = job && job.configId === config.id ? job : null;
  const blocked = mode === "strict" && (active?.errorCount ?? 0) + (active?.conflictCount ?? 0) > 0;

  return (
    <>
      <PageHead
        title={`${t("run.title")} · ${config.name}`}
        subtitle={<>{t("run.targetEntity")} <b>{config.targetEntity}</b> · {t("run.snapshot")} v{config.version}</>}
        actions={
          <>
            <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onFile} />
            <Button icon={<DocumentAddRegular />} onClick={loadDemo} disabled={gated}>{t("run.loadDemo")}</Button>
            <Button icon={<ArrowUploadRegular />} appearance="primary" onClick={() => fileRef.current?.click()} disabled={gated}>{t("run.uploadXlsx")}</Button>
          </>
        }
      />

      <ConfigIssues
        issues={check?.issues ?? []}
        checking={checking}
        hasErrors={check?.hasErrors ?? false}
        onRecheck={recheck}
      />

      {busy ? (
        <Card style={{ padding: 16, marginBottom: 16 }}>
          {progress && progress.total > 0 ? (
            <Field validationState="none" hint={`${progress.done} / ${progress.total} ${t("run.rowsUnit")}`}>
              <Text style={{ marginBottom: 8, display: "block" }}>{busy}</Text>
              <ProgressBar value={progress.done / progress.total} thickness="large" />
            </Field>
          ) : (
            <Spinner label={busy} labelPosition="after" size="small" />
          )}
        </Card>
      ) : null}

      {!active ? (
        <Card style={{ padding: 24 }}><Text>{t("run.empty")}</Text></Card>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
            <Stat n={active.readyCount} label={t("run.ready")} color="var(--lip-ready)" />
            <Stat n={active.conflictCount} label={t("run.conflicts")} color="var(--lip-amber)" />
            <Stat n={active.errorCount} label={t("run.errors")} color="var(--lip-error)" />
            <Stat n={active.rowCount} label={t("run.totalRows")} />
          </div>

          {active.conflictCount > 0 ? (
            <Card style={{ padding: "14px 18px", marginBottom: 18, display: "flex", alignItems: "center", gap: 16, background: "var(--lip-amber-soft)", borderColor: "var(--lip-amber)" }}>
              <WarningRegular style={{ color: "var(--lip-amber)", fontSize: 20 }} />
              <Text style={{ color: "var(--lip-amber)", flex: 1 }}><b>{active.conflictCount}</b> {t("run.needDecision")}</Text>
              <Button appearance="primary" onClick={() => navigate("conflicts")}>{t("run.openBasket")}</Button>
            </Card>
          ) : null}

          <Card style={{ padding: 14, marginBottom: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Text weight="semibold">{t("run.writeMode")}</Text>
            <ModeToggle mode={mode} onChange={setMode} />
            <div style={{ flex: 1 }} />
            <Button appearance="primary" disabled={blocked || gated || active.rowCount === 0} onClick={commit}>
              {blocked ? t("run.commitBlocked") : `${t("run.commit")} (${active.readyCount})`}
            </Button>
          </Card>

          <Card style={{ overflow: "hidden" }}>
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>{t("run.colRow")}</TableHeaderCell>
                  <TableHeaderCell>Last Name</TableHeaderCell>
                  <TableHeaderCell>Parent Account</TableHeaderCell>
                  <TableHeaderCell>{t("run.colResolution")}</TableHeaderCell>
                  <TableHeaderCell>{t("run.colStatus")}</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.rows.map((r) => {
                  const lk = r.lookups[0];
                  return (
                    <TableRow key={r.rowNumber}>
                      <TableCell className="lip-mono">{r.rowNumber}</TableCell>
                      <TableCell>{String(r.raw["Last Name"] ?? "—")}</TableCell>
                      <TableCell>{String(r.raw["Parent Account"] ?? "—")}</TableCell>
                      <TableCell style={{ color: tokens.colorNeutralForeground2 }}>
                        {lk?.status === "resolved" ? <span className="lip-mono">→ {lk.resolvedId?.slice(0, 8)}… ({lk.resolvedEntity})</span>
                          : lk?.status === "ambiguous" ? `${lk.candidates?.length ?? 0} ${t("run.candidates")}`
                          : lk?.status === "notFound" ? t("run.noMatch") : "—"}
                      </TableCell>
                      <TableCell><StatusChip status={r.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <Card style={{ padding: "15px 16px" }}>
      <Text style={{ fontSize: 26, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{n.toLocaleString()}</Text>
      <Text style={{ display: "block", fontSize: 12, color: tokens.colorNeutralForeground2 }}>{label}</Text>
    </Card>
  );
}

function ModeToggle({ mode, onChange }: { mode: ImportMode; onChange: (m: ImportMode) => void }) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: 7, overflow: "hidden" }}>
      {(["strict", "partial"] as ImportMode[]).map((m) => (
        <button key={m} onClick={() => onChange(m)}
          style={{ padding: "6px 14px", border: 0, cursor: "pointer", fontSize: 12.5, fontFamily: "inherit", textTransform: "capitalize", background: mode === m ? tokens.colorBrandBackground : tokens.colorNeutralBackground1, color: mode === m ? tokens.colorNeutralForegroundInverted : tokens.colorNeutralForeground2, fontWeight: mode === m ? 600 : 400 }}>
          {m}
        </button>
      ))}
    </div>
  );
}
