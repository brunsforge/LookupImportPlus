import type { ReactNode } from "react";

/**
 * Placeholder host boundary. Readiness/host detection now happens in
 * `AppProvider`, which awaits the SDK `getContext()` before building the service
 * container (live SDK client in the Power host, demo client locally). Kept as a
 * seam for any future explicit SDK initialization.
 */
export function PowerProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
