import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AppContainer } from "./container";
import { createContainer, type ClientMode, type Bootstrap } from "./clientFactory";
import type { ImportJob } from "@/domain/import";
import { detectLang, translate, type Lang, type I18nKey } from "@/i18n";

export type ScreenName =
  | "configs"
  | "editor"
  | "importrun"
  | "conflicts"
  | "resolve"
  | "history";

export interface NavParams {
  configId?: string;
  /** Conflict group key on the resolve screen. */
  sourceValue?: string;
  lookupAttribute?: string;
}

interface AppState {
  container: AppContainer;
  /** Whether we're bound to live Dataverse ("sdk") or demo data ("fake"). */
  mode: ClientMode;
  /** Dataverse org URL when connected (location indicator). */
  orgUrl?: string;
  environmentId?: string;
  screen: ScreenName;
  params: NavParams;
  navigate: (screen: ScreenName, params?: NavParams) => void;

  /** The active import run shared across ImportRun / Conflicts / Resolve. */
  job: ImportJob | null;
  setJob: (job: ImportJob | null) => void;

  /** Finished runs (in-memory history for the MVP). */
  history: ImportJob[];
  pushHistory: (job: ImportJob) => void;

  themeMode: "light" | "dark";
  toggleTheme: () => void;

  lang: Lang;
  toggleLang: () => void;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;

  /** Desktop-notification preference (persisted). */
  notify: boolean;
  setNotify: (on: boolean) => void;
  /** Fire a desktop notification when enabled and permitted. */
  notifyUser: (title: string, body: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [screen, setScreen] = useState<ScreenName>("configs");
  const [params, setParams] = useState<NavParams>({});
  const [job, setJob] = useState<ImportJob | null>(null);
  const [history, setHistory] = useState<ImportJob[]>([]);
  const [themeMode, setThemeMode] = useState<"light" | "dark">(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );
  const [lang, setLang] = useState<Lang>(detectLang());
  const [notify, setNotifyState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("lip:settings:notify") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let alive = true;
    createContainer().then((r) => {
      if (!alive) return;
      setBoot(r);
      setHistory(r.container.store.loadHistory());
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!boot) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", fontFamily: "Segoe UI, system-ui, sans-serif", color: "#605e6b" }}>
        {translate(lang, "app.loading")}
      </div>
    );
  }

  const value: AppState = {
    container: boot.container,
    mode: boot.mode,
    orgUrl: boot.orgUrl,
    environmentId: boot.environmentId,
    screen,
    params,
    navigate: (s, p = {}) => {
      setScreen(s);
      setParams(p);
    },
    job,
    setJob,
    history,
    pushHistory: (j) =>
      setHistory((h) => {
        const next = [j, ...h.filter((x) => x.id !== j.id)].slice(0, 25);
        // Persist a trimmed copy (counts/snapshot, without per-row data) to stay
        // well within localStorage limits.
        boot.container.store.saveHistory(next.map((x) => ({ ...x, rows: [], decisions: [] })));
        return next;
      }),
    themeMode,
    toggleTheme: () => setThemeMode((m) => (m === "dark" ? "light" : "dark")),
    lang,
    toggleLang: () => setLang((l) => (l === "de" ? "en" : "de")),
    t: (key, params) => translate(lang, key, params),
    notify,
    setNotify: (on) => {
      setNotifyState(on);
      try {
        localStorage.setItem("lip:settings:notify", on ? "1" : "0");
      } catch {
        // ignore storage errors
      }
      if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    },
    notifyUser: (title, body) => {
      if (!notify) return;
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(title, { body });
        }
      } catch {
        // notifications unavailable (e.g. embedded host) — ignore
      }
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
