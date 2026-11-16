import "./App.css";

import Dashboard from "./pages/Dashboard";
import { ToastProvider } from "./components/ui/ToastContainer";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import { useEffect } from "react";
import {
  LoadConfig,
  LogFrontendEvent,
  SetDefaultVideoDescription,
} from "../wailsjs/go/backend/App";
import { useAppStore } from "./store/useAppStore";

function App() {
  useEffect(() => {
    let cancelled = false;

    const hydrateConfig = async () => {
      try {
        const cfg = await LoadConfig();
        if (cancelled || !cfg) return;

        const backendDesc = cfg.default_video_description ?? "";
        if (backendDesc.length > 0) {
          useAppStore.getState().setDefaultVideoDescription(backendDesc);
          return;
        }

        const localDesc = useAppStore.getState().defaultVideoDescription;
        if (localDesc.length > 0) {
          await SetDefaultVideoDescription(localDesc);
        }
      } catch {
        // Ignore when running outside Wails runtime
      }
    };

    void hydrateConfig();

    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let timeoutId: any;
    let lastState = "";

    const checkState = async () => {
      const rt = (window as any).runtime;
      if (!rt) return;
      try {
        const size = await rt.WindowGetSize();
        const pos = await rt.WindowGetPosition();
        const isMin = await rt.WindowIsMinimised();
        const isMax = await rt.WindowIsMaximised();

        let state = "normal";
        if (isMin) state = "minimised";
        else if (isMax) state = "maximised";

        const currentState = `${state}|${size?.w}x${size?.h}|${pos?.x},${pos?.y}`;
        if (currentState !== lastState) {
          LogFrontendEvent(
            `Window state changed: ${state.toUpperCase()} (Size: ${size?.w}x${size?.h} | Pos: ${pos?.x},${pos?.y})`,
          );
          lastState = currentState;
        }
      } catch (e) {}
    };

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkState, 800); // Debounce
    };

    window.addEventListener("resize", handleResize);

    // Check initial state
    setTimeout(checkState, 1000);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <ErrorBoundary area="App">
      <ToastProvider>
        <div id="App">
          <Dashboard />
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
