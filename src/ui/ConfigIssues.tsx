import { Button, Spinner, Text } from "@fluentui/react-components";
import { CheckmarkCircleRegular } from "@fluentui/react-icons";
import { useApp } from "@/app/AppContext";
import type { I18nKey } from "@/i18n";
import type { ConfigIssue, IssueSeverity } from "@/domain/issues";
import { Card } from "./PageHead";

const SEV_COLOR: Record<IssueSeverity, string> = {
  error: "var(--lip-error)",
  warning: "var(--lip-amber)",
  info: "var(--lip-info)",
};
const SEV_ICON: Record<IssueSeverity, string> = { error: "✕", warning: "⚠", info: "🛈" };

export function ConfigIssues({
  issues,
  checking,
  hasErrors,
  onRecheck,
}: {
  issues: ConfigIssue[];
  checking: boolean;
  hasErrors: boolean;
  onRecheck: () => void;
}) {
  const { t } = useApp();

  if (checking) {
    return (
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <Spinner label={t("val.checking")} labelPosition="after" size="tiny" />
      </Card>
    );
  }

  if (issues.length === 0) {
    return (
      <Card style={{ padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <CheckmarkCircleRegular style={{ color: "var(--lip-ready)", fontSize: 18 }} />
        <Text style={{ color: "var(--lip-ready)" }}>{t("val.ok")}</Text>
      </Card>
    );
  }

  return (
    <Card style={{ padding: "12px 16px", marginBottom: 16, borderColor: hasErrors ? "var(--lip-error)" : "var(--lip-amber)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Text weight="semibold">{t("val.title")}</Text>
        {hasErrors ? <Text style={{ color: "var(--lip-error)", fontSize: 12.5 }}>· {t("val.blocked")}</Text> : null}
        <div style={{ flex: 1 }} />
        <Button size="small" appearance="subtle" onClick={onRecheck}>{t("val.recheck")}</Button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {issues.map((iss, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13 }}>
            <span style={{ color: SEV_COLOR[iss.severity] }}>{SEV_ICON[iss.severity]}</span>
            <Text>{t(`val.${iss.code}` as I18nKey, { target: iss.target, ...iss.params })}</Text>
          </div>
        ))}
      </div>
    </Card>
  );
}
