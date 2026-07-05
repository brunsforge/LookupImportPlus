import { tokens } from "@fluentui/react-components";

/** Product signet: a data path forking into two candidates, reconverging to one. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <path
        d="M5 14 H11 M11 14 L18 7 M11 14 L18 21 M18 7 L23 14 M18 21 L23 14"
        fill="none"
        stroke={tokens.colorBrandForeground1}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="5" cy="14" r="2.1" fill={tokens.colorBrandForeground1} />
      <circle cx="18" cy="7" r="2.2" fill={tokens.colorNeutralBackground1} stroke={tokens.colorBrandForeground1} strokeWidth="1.6" />
      <circle cx="18" cy="21" r="2.2" fill={tokens.colorNeutralBackground1} stroke={tokens.colorBrandForeground1} strokeWidth="1.6" />
      <circle cx="23" cy="14" r="2.7" fill={tokens.colorBrandForeground1} />
    </svg>
  );
}
