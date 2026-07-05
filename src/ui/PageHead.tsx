import type { ReactNode } from "react";
import { Text, tokens } from "@fluentui/react-components";

export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
      <div style={{ flex: 1 }}>
        <Text as="h1" weight="semibold" style={{ fontSize: 24, letterSpacing: "-0.02em", display: "block" }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: tokens.colorNeutralForeground2, marginTop: 4, display: "block", maxWidth: "70ch" }}>
            {subtitle}
          </Text>
        ) : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: tokens.colorNeutralBackground1,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        borderRadius: 12,
        boxShadow: tokens.shadow4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
