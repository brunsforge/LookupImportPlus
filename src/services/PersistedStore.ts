/**
 * Persistence abstraction for configurations and run history.
 *
 * MVP uses the browser's localStorage (no custom Dataverse tables — the only
 * Dataverse artifact stays the code app itself). The interface is the seam:
 * a future `DataverseStore` (backed by `lip_*` tables) can replace it without
 * touching the container or UI. Keys are namespaced per environment+app so
 * different code apps on the same player origin never collide.
 */

import type { JobConfiguration } from "@/domain/config";
import type { ImportJob } from "@/domain/import";

export interface PersistedStore {
  loadConfigs(): JobConfiguration[];
  saveConfigs(configs: JobConfiguration[]): void;
  loadHistory(): ImportJob[];
  saveHistory(jobs: ImportJob[]): void;
}

/** In-memory store — used in tests and when localStorage is unavailable. */
export class MemoryStore implements PersistedStore {
  private configs: JobConfiguration[] = [];
  private history: ImportJob[] = [];
  loadConfigs() { return this.configs; }
  saveConfigs(c: JobConfiguration[]) { this.configs = c; }
  loadHistory() { return this.history; }
  saveHistory(h: ImportJob[]) { this.history = h; }
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

export class LocalStorageStore implements PersistedStore {
  private readonly configsKey: string;
  private readonly historyKey: string;

  constructor(namespace: string) {
    this.configsKey = `lip:${namespace}:configs`;
    this.historyKey = `lip:${namespace}:history`;
  }

  private read<T>(key: string): T[] {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T[]) : [];
    } catch {
      return [];
    }
  }

  private write(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded / private mode — degrade silently (session-only).
    }
  }

  loadConfigs() { return this.read<JobConfiguration>(this.configsKey); }
  saveConfigs(c: JobConfiguration[]) { this.write(this.configsKey, c); }
  loadHistory() { return this.read<ImportJob>(this.historyKey); }
  saveHistory(h: ImportJob[]) { this.write(this.historyKey, h); }
}

export function createStore(namespace: string): PersistedStore {
  return hasLocalStorage() ? new LocalStorageStore(namespace) : new MemoryStore();
}
