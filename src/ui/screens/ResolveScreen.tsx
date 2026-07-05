import { useState } from "react";
import { Button, Checkbox, Text, tokens, Link } from "@fluentui/react-components";
import { WarningRegular } from "@fluentui/react-icons";
import { useApp } from "@/app/AppContext";
import { PageHead, Card } from "../PageHead";
import { Chip } from "../StatusChip";
import type { LookupCandidate, ResolutionDecision } from "@/domain/import";

export function ResolveScreen() {
  const { job, params, container, setJob, navigate, t } = useApp();
  const { lookupAttribute, sourceValue } = params;

  const matchingRows = (job?.rows ?? []).filter((r) =>
    r.lookups.some((l) => l.lookupAttribute === lookupAttribute && l.sourceValue === sourceValue && (l.status === "ambiguous" || l.status === "notFound")),
  );
  const sample = matchingRows[0]?.lookups.find((l) => l.lookupAttribute === lookupAttribute);
  const candidates: LookupCandidate[] = sample?.candidates ?? [];

  const [selected, setSelected] = useState<string | null>(candidates[0]?.id ?? null);
  const [applyAll, setApplyAll] = useState(true);

  if (!job || !sample) {
    return (
      <>
        <PageHead title={t("res.title")} />
        <Card style={{ padding: 24 }}>
          <Text>{t("res.notOpen")}</Text>
          <div style={{ marginTop: 12 }}><Button onClick={() => navigate("conflicts")}>{t("common.toList")}</Button></div>
        </Card>
      </>
    );
  }

  function apply(chosen: LookupCandidate | null) {
    const decision: ResolutionDecision = {
      id: crypto.randomUUID(),
      rowNumber: matchingRows[0].rowNumber,
      lookupAttribute: lookupAttribute!,
      sourceValue: sourceValue ?? null,
      candidates,
      chosenId: chosen?.id ?? null,
      chosenEntity: chosen?.entityLogicalName,
      appliedFilter: sample?.appliedFilter,
      decidedBy: job!.startedBy,
      decidedOn: new Date().toISOString(),
      appliedToAll: applyAll,
    };
    container.runner.applyDecision(job!, decision);
    setJob({ ...job! });
    navigate("conflicts");
  }

  return (
    <>
      <PageHead
        title={t("res.title")}
        subtitle={<>{t("res.sourceValue")} „{sourceValue}" · {t("res.targetField")} <span className="lip-mono">{lookupAttribute}</span></>}
        actions={<Button onClick={() => navigate("conflicts")}>{t("common.toList")}</Button>}
      />

      <Card style={{ padding: "14px 16px", marginBottom: 18, display: "flex", gap: 12, alignItems: "flex-start", background: "var(--lip-amber-soft)", borderColor: "var(--lip-amber)" }}>
        <WarningRegular style={{ color: "var(--lip-amber)", fontSize: 20 }} />
        <div>
          <Text weight="semibold" style={{ color: "var(--lip-amber)", display: "block" }}>
            {sample.status === "notFound" ? t("res.noTarget") : t("res.notUnique")}
          </Text>
          <Text style={{ fontSize: 13 }}>{matchingRows.length} {t("res.affected")}</Text>
        </div>
      </Card>

      {sample.appliedFilter ? (
        <Card style={{ padding: "12px 14px", marginBottom: 18, borderLeft: "3px solid var(--lip-info)" }}>
          <div className="lip-mono" style={{ fontSize: 12.5 }}>{sample.appliedFilter}</div>
          {sample.resolvedTimeAnchors && Object.keys(sample.resolvedTimeAnchors).length ? (
            <Text style={{ color: tokens.colorNeutralForeground3, fontSize: 11.5, display: "block", marginTop: 6 }}>
              {t("res.timeAnchor")}: {Object.entries(sample.resolvedTimeAnchors).map(([k, v]) => `${k} = ${v.slice(0, 10)}`).join(" · ")}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {candidates.length === 0 ? (
        <Card style={{ padding: 20 }}>
          <Text>{t("res.noCandidates")}</Text>
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}><Button onClick={() => apply(null)}>{t("res.skipRows")}</Button></div>
        </Card>
      ) : (
        <>
          <Text style={{ display: "block", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: tokens.colorNeutralForeground3, fontWeight: 600, margin: "6px 0 8px" }}>
            {t("res.chooseCandidate")}
          </Text>
          {candidates.map((c) => {
            const sel = selected === c.id;
            return (
              <Card key={c.id} style={{ padding: "13px 15px", marginBottom: 8, cursor: "pointer", borderColor: sel ? tokens.colorBrandStroke1 : undefined, background: sel ? tokens.colorBrandBackground2 : undefined, display: "flex", gap: 14, alignItems: "center" }}>
                <div onClick={() => setSelected(c.id)} style={{ display: "flex", gap: 14, alignItems: "center", flex: 1 }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", flex: "none", border: `2px solid ${sel ? tokens.colorBrandStroke1 : tokens.colorNeutralStroke1}`, display: "grid", placeItems: "center" }}>
                    {sel ? <span style={{ width: 9, height: 9, borderRadius: "50%", background: tokens.colorBrandForeground1 }} /> : null}
                  </span>
                  <div style={{ flex: 1 }}>
                    <Text weight="semibold">{c.primaryName}</Text>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 4, color: tokens.colorNeutralForeground2, fontSize: 12 }}>
                      {Object.entries(c.attributes).map(([k, v]) => (<span key={k}>{k}: <b>{String(v ?? "—")}</b></span>))}
                      <span className="lip-mono">{c.id.slice(0, 8)}…</span>
                      <Chip tone="info">{c.entityLogicalName}</Chip>
                    </div>
                  </div>
                </div>
                {c.recordUrl ? <Link href={c.recordUrl} target="_blank">{t("res.open")}</Link> : null}
              </Card>
            );
          })}

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16, paddingTop: 16, borderTop: `1px solid ${tokens.colorNeutralStroke2}`, flexWrap: "wrap" }}>
            <Checkbox checked={applyAll} onChange={(_, d) => setApplyAll(!!d.checked)} label={`${t("res.applyAll", { n: matchingRows.length })} „${sourceValue}"`} />
            <div style={{ flex: 1 }} />
            <Button appearance="subtle" onClick={() => apply(null)}>{t("common.skip")}</Button>
            <Button appearance="primary" disabled={!selected} onClick={() => apply(candidates.find((c) => c.id === selected) ?? null)}>{t("res.apply")}</Button>
          </div>
        </>
      )}
    </>
  );
}
