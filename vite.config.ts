import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Power Apps Code Apps are served from a relative base and expect the dev
// server on a fixed port that `pac code run` proxies. `pac code init` will
// adjust these if it needs different values.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
  },
});
