import type { ReactNode } from "react";
import { Badge } from "@fluentui/react-components";
import type { RowStatus } from "@/domain/import";
import { useApp } from "@/app/AppContext";
import type { I18nKey } from "@/i18n";

type Tone = "ready" | "ambiguous" | "error" | "skip" | "info" | "neutral";

const TONE_STYLE: Record<Tone, { bg: string; fg: string }> = {
  ready: { bg: "var(--lip-ready-soft)", fg: "var(--lip-ready)" },
  ambiguous: { bg: "var(--lip-amber-soft)", fg: "var(--lip-amber)" },
  error: { bg: "var(--lip-error-soft)", fg: "var(--lip-error)" },
  skip: { bg: "var(--lip-skip-soft)", fg: "var(--lip-skip)" },
  info: { bg: "var(--lip-info-soft)", fg: "var(--lip-info)" },
  neutral: { bg: "var(--lip-surface-2)", fg: "var(--lip-slate)" },
};

const STATUS_META: Record<RowStatus, { tone: Tone; label: string; icon: string }> = {
  Ready: { tone: "ready", label: "Bereit", icon: "✓" },
  LookupResolved: { tone: "ready", label: "Aufgelöst", icon: "✓" },
  Committed: { tone: "ready", label: "Geschrieben", icon: "✓" },
  Warning: { tone: "ambiguous", label: "Hinweis", icon: "!" },
  LookupAmbiguous: { tone: "ambiguous", label: "Mehrdeutig", icon: "⚠" },
  LookupNotFound: { tone: "error", label: "Nicht gefunden", icon: "✕" },
  LookupWrongTargetType: { tone: "error", label: "Falscher Zieltyp", icon: "✕" },
  MissingRequiredValue: { tone: "error", label: "Pflichtfeld fehlt", icon: "✕" },
  InvalidFormat: { tone: "error", label: "Ungültiges Format", icon: "✕" },
  PermissionIssue: { tone: "error", label: "Keine Berechtigung", icon: "✕" },
  WriteBlocked: { tone: "error", label: "Schreiben blockiert", icon: "✕" },
  CommitFailed: { tone: "error", label: "Schreiben fehlgeschlagen", icon: "✕" },
  DuplicateInFile: { tone: "ambiguous", label: "Dublette in Datei", icon: "⚠" },
  Skipped: { tone: "skip", label: "Übersprungen", icon: "–" },
};

export function StatusChip({ status }: { status: RowStatus }) {
  const { t } = useApp();
  const meta = STATUS_META[status];
  const s = TONE_STYLE[meta.tone];
  return (
    <Badge
      appearance="filled"
      style={{ backgroundColor: s.bg, color: s.fg, fontWeight: 600 }}
    >
      {meta.icon} {t(`st.${status}` as I18nKey)}
    </Badge>
  );
}

export function Chip({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  const s = TONE_STYLE[tone];
  return (
    <Badge appearance="filled" style={{ backgroundColor: s.bg, color: s.fg, fontWeight: 600 }}>
      {children}
    </Badge>
  );
}
