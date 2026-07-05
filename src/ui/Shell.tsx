import type { ReactNode } from "react";
import { Button, Text, tokens, Menu, MenuTrigger, MenuPopover, Switch } from "@fluentui/react-components";
import {
  TableSearch24Regular,
  ArrowSort24Regular,
  Warning24Regular,
  History24Regular,
  WeatherMoon20Regular,
  WeatherSunny20Regular,
  LocalLanguage20Regular,
} from "@fluentui/react-icons";
import { useApp, type ScreenName } from "@/app/AppContext";
import type { I18nKey } from "@/i18n";
import { BrandMark } from "./BrandMark";

export function Shell({ children }: { children: ReactNode }) {
  const { screen, navigate, themeMode, toggleTheme, job, mode, t, lang, toggleLang, orgUrl, notify, setNotify } = useApp();
  const live = mode === "sdk";
  let host = "";
  let slug = "";
  if (orgUrl) {
    try {
      host = new URL(orgUrl).host;
      slug = host.split(".")[0];
    } catch {
      host = orgUrl;
    }
  }

  const nav: { key: ScreenName; label: I18nKey; icon: ReactNode; badge?: number }[] = [
    { key: "configs", label: "nav.configs", icon: <TableSearch24Regular /> },
    { key: "importrun", label: "nav.importruns", icon: <ArrowSort24Regular /> },
    { key: "conflicts", label: "nav.conflicts", icon: <Warning24Regular />, badge: job?.conflictCount || undefined },
    { key: "history", label: "nav.history", icon: <History24Regular /> },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "228px 1fr", height: "100vh" }}>
      <aside style={{ background: tokens.colorNeutralBackground1, borderRight: `1px solid ${tokens.colorNeutralStroke2}`, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 8px 16px" }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, flex: "none", background: tokens.colorBrandBackground2, display: "grid", placeItems: "center" }}>
            <BrandMark />
          </div>
          <div>
            <Text weight="semibold" style={{ display: "block", fontSize: 15 }}>LookupImportPlus</Text>
            <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>Dataverse Control · v0.1</Text>
          </div>
        </div>

        {nav.map((n) => {
          const active = screen === n.key;
          return (
            <button key={n.key} onClick={() => navigate(n.key)}
              style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "9px 10px", border: 0, borderRadius: 7, cursor: "pointer", textAlign: "left", fontSize: 13.5, fontFamily: "inherit", background: active ? tokens.colorBrandBackground2 : "transparent", color: active ? tokens.colorBrandForeground1 : tokens.colorNeutralForeground2, fontWeight: active ? 600 : 400 }}>
              <span style={{ display: "grid", placeItems: "center" }}>{n.icon}</span>
              <span style={{ flex: 1 }}>{t(n.label)}</span>
              {n.badge ? (
                <span style={{ background: "var(--lip-amber-soft)", color: "var(--lip-amber)", borderRadius: 100, padding: "1px 8px", fontSize: 11.5, fontWeight: 700 }}>{n.badge}</span>
              ) : null}
            </button>
          );
        })}

        <div style={{ flex: 1 }} />
        <div style={{ border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: 7, padding: 10, fontSize: 12, color: tokens.colorNeutralForeground2, background: "var(--lip-info-soft)" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ width: 7, height: 7, borderRadius: 9, background: live ? "var(--lip-ready)" : "var(--lip-amber)", display: "inline-block", marginRight: 6, flex: "none" }} />
            {live ? t("shell.live") : t("shell.demo")}
          </div>
          {live && host ? (
            <>
              <div style={{ marginTop: 4, fontWeight: 600, fontSize: 12, color: tokens.colorNeutralForeground1 }}>{slug}</div>
              <div className="lip-mono" style={{ color: "var(--lip-info)", fontSize: 10, lineHeight: 1.35, wordBreak: "break-all" }}>{host}</div>
            </>
          ) : (
            <div className="lip-mono" style={{ marginTop: 4, color: "var(--lip-info)", fontSize: 10.5 }}>FakeDataverseClient · local</div>
          )}
        </div>
      </aside>

      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: "100vh", overflow: "hidden" }}>
        <header style={{ height: 56, flex: "none", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, background: tokens.colorNeutralBackground1, display: "flex", alignItems: "center", gap: 12, padding: "0 24px" }}>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>{t(nav.find((n) => n.key === screen)?.label ?? "nav.configs")}</Text>
          <div style={{ flex: 1 }} />
          <Button appearance="subtle" icon={<LocalLanguage20Regular />} onClick={toggleLang} aria-label="Language">
            {lang.toUpperCase()}
          </Button>
          <Button appearance="subtle" icon={themeMode === "dark" ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />} onClick={toggleTheme} aria-label={t("shell.theme")} />
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <button aria-label={t("set.title")} title={t("set.title")} style={{ width: 30, height: 30, borderRadius: "50%", background: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundInverted, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, border: 0, cursor: "pointer", fontFamily: "inherit" }}>DA</button>
            </MenuTrigger>
            <MenuPopover>
              <div style={{ padding: "12px 14px", minWidth: 250 }}>
                <Text weight="semibold" style={{ display: "block", marginBottom: 10 }}>{t("set.title")}</Text>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <Text style={{ display: "block", fontSize: 13 }}>{t("set.notify")}</Text>
                    <Text style={{ fontSize: 11.5, color: tokens.colorNeutralForeground3 }}>{t("set.notifyHint")}</Text>
                  </div>
                  <Switch checked={notify} onChange={(_, d) => setNotify(!!d.checked)} />
                </div>
              </div>
            </MenuPopover>
          </Menu>
        </header>

        <main style={{ overflow: "auto", padding: "24px 28px 64px", background: tokens.colorNeutralBackground2, flex: 1, minHeight: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
