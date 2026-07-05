import {
  Text,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from "@fluentui/react-components";
import { useApp } from "@/app/AppContext";
import { PageHead, Card } from "../PageHead";
import { Chip } from "../StatusChip";
import type { ImportJob, ImportJobStatus } from "@/domain/import";
import type { I18nKey } from "@/i18n";

const STATUS: Record<ImportJobStatus, { tone: "ready" | "ambiguous" | "error" | "neutral"; key: I18nKey }> = {
  draft: { tone: "neutral", key: "js.draft" },
  validated: { tone: "neutral", key: "js.validated" },
  awaitingConflicts: { tone: "ambiguous", key: "js.awaitingConflicts" },
  committing: { tone: "neutral", key: "js.committing" },
  completed: { tone: "ready", key: "js.completed" },
  completedWithErrors: { tone: "error", key: "js.completedWithErrors" },
  aborted: { tone: "error", key: "js.aborted" },
};

export function HistoryScreen() {
  const { history, job, container, t } = useApp();
  const all: ImportJob[] = [...history];
  if (job && !all.some((j) => j.id === job.id)) all.unshift(job);

  return (
    <>
      <PageHead title={t("nav.history")} subtitle={t("hist.subtitle")} />
      {all.length === 0 ? (
        <Card style={{ padding: 24 }}><Text>{t("hist.none")}</Text></Card>
      ) : (
        <Card style={{ overflow: "hidden" }}>
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t("hist.started")}</TableHeaderCell>
                <TableHeaderCell>{t("hist.config")}</TableHeaderCell>
                <TableHeaderCell>{t("hist.mode")}</TableHeaderCell>
                <TableHeaderCell>{t("hist.rows")}</TableHeaderCell>
                <TableHeaderCell>{t("hist.written")}</TableHeaderCell>
                <TableHeaderCell>{t("hist.conflicts")}</TableHeaderCell>
                <TableHeaderCell>{t("hist.status")}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((j) => {
                const s = STATUS[j.status];
                const name = container.getConfig(j.configId)?.name ?? j.configSnapshot.name;
                return (
                  <TableRow key={j.id}>
                    <TableCell>{new Date(j.startedOn).toLocaleString()}</TableCell>
                    <TableCell>{name} <Chip tone="neutral">v{j.configSnapshot.version}</Chip></TableCell>
                    <TableCell style={{ textTransform: "capitalize" }}>{j.mode}</TableCell>
                    <TableCell className="lip-mono">{j.rowCount}</TableCell>
                    <TableCell className="lip-mono">{j.committedCount}</TableCell>
                    <TableCell className="lip-mono">{j.conflictCount}</TableCell>
                    <TableCell><Chip tone={s.tone}>{t(s.key)}</Chip></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
