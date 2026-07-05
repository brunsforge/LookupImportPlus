import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { PowerProvider } from "./PowerProvider";
import { AppProvider } from "./app/AppContext";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PowerProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </PowerProvider>
  </StrictMode>,
);
