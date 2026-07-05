import {
  Button, Text, tokens,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from "@fluentui/react-components";
import { WarningRegular } from "@fluentui/react-icons";
import { useApp } from "@/app/AppContext";
import { PageHead, Card } from "../PageHead";
import { StatusChip, Chip } from "../StatusChip";
import type { ImportJob } from "@/domain/import";

interface Group {
  lookupAttribute: string;
  sourceValue: string;
  rowCount: number;
  candidateCount: number;
  kind: "ambiguous" | "notFound";
}

export function collectConflictGroups(job: ImportJob | null): Group[] {
  if (!job) return [];
  const map = new Map<string, Group>();
  for (const row of job.rows) {
    for (const lk of row.lookups) {
      if (lk.status !== "ambiguous" && lk.status !== "notFound") continue;
      const key = `${lk.lookupAttribute}|${lk.sourceValue}`;
      const g = map.get(key);
      if (g) g.rowCount++;
      else map.set(key, { lookupAttribute: lk.lookupAttribute, sourceValue: lk.sourceValue ?? "", rowCount: 1, candidateCount: lk.candidates?.length ?? 0, kind: lk.status });
    }
  }
  return [...map.values()];
}

export function ConflictBasketScreen() {
  const { job, navigate, t } = useApp();
  const groups = collectConflictGroups(job);

  if (!job) return <Text>{t("conf.noRun")}</Text>;

  return (
    <>
      <PageHead
        title={t("nav.conflicts")}
        subtitle={t("conf.subtitle")}
        actions={<Button onClick={() => navigate("importrun")}>{t("conf.backToRun")}</Button>}
      />

      {groups.length === 0 ? (
        <Card style={{ padding: 24, display: "flex", gap: 10, alignItems: "center" }}>
          <Chip tone="ready">✓ {t("conf.allResolved")}</Chip>
          <Text>{t("conf.allResolvedHint")}</Text>
        </Card>
      ) : (
        <>
          <Card style={{ padding: "14px 16px", marginBottom: 18, display: "flex", gap: 12, alignItems: "flex-start", background: "var(--lip-amber-soft)", borderColor: "var(--lip-amber)" }}>
            <WarningRegular style={{ color: "var(--lip-amber)", fontSize: 20 }} />
            <Text style={{ color: "var(--lip-amber)" }}><b>{job.conflictCount}</b> {t("conf.needDecisionFull")}</Text>
          </Card>

          <Card style={{ overflow: "hidden" }}>
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>{t("conf.colSource")}</TableHeaderCell>
                  <TableHeaderCell>{t("conf.colField")}</TableHeaderCell>
                  <TableHeaderCell>{t("conf.colAffected")}</TableHeaderCell>
                  <TableHeaderCell>{t("conf.colCandidates")}</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={`${g.lookupAttribute}|${g.sourceValue}`}>
                    <TableCell><b>{g.sourceValue}</b></TableCell>
                    <TableCell className="lip-mono">{g.lookupAttribute}</TableCell>
                    <TableCell><Chip tone="neutral">{g.rowCount} {t("conf.rows")}</Chip></TableCell>
                    <TableCell style={{ color: g.kind === "notFound" ? "var(--lip-error)" : "var(--lip-amber)" }}>
                      {g.kind === "notFound" ? t("conf.hits0") : `${g.candidateCount} ${t("conf.colCandidates")}`}
                    </TableCell>
                    <TableCell><StatusChip status={g.kind === "notFound" ? "LookupNotFound" : "LookupAmbiguous"} /></TableCell>
                    <TableCell>
                      <Button size="small" appearance="primary" onClick={() => navigate("resolve", { lookupAttribute: g.lookupAttribute, sourceValue: g.sourceValue })}>
                        {g.kind === "notFound" ? t("conf.editRow") : t("conf.resolve")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Text style={{ display: "block", marginTop: 14, color: tokens.colorNeutralForeground3, fontSize: 12.5 }}>🛈 {t("conf.audit")}</Text>
        </>
      )}
    </>
  );
}
