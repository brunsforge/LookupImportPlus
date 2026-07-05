import { useEffect } from "react";
import { FluentProvider } from "@fluentui/react-components";
import { useApp } from "./app/AppContext";
import { lightTheme, darkTheme } from "./theme";
import { Shell } from "./ui/Shell";
import { ConfigListScreen } from "./ui/screens/ConfigListScreen";
import { EditorScreen } from "./ui/screens/EditorScreen";
import { ImportRunScreen } from "./ui/screens/ImportRunScreen";
import { ConflictBasketScreen } from "./ui/screens/ConflictBasketScreen";
import { ResolveScreen } from "./ui/screens/ResolveScreen";
import { HistoryScreen } from "./ui/screens/HistoryScreen";

export function App() {
  const { screen, themeMode } = useApp();

  useEffect(() => {
    document.documentElement.dataset.lipDark = themeMode === "dark" ? "true" : "false";
  }, [themeMode]);

  return (
    <FluentProvider theme={themeMode === "dark" ? darkTheme : lightTheme} style={{ height: "100vh" }}>
      <Shell>
        {screen === "configs" && <ConfigListScreen />}
        {screen === "editor" && <EditorScreen />}
        {screen === "importrun" && <ImportRunScreen />}
        {screen === "conflicts" && <ConflictBasketScreen />}
        {screen === "resolve" && <ResolveScreen />}
        {screen === "history" && <HistoryScreen />}
      </Shell>
    </FluentProvider>
  );
}
