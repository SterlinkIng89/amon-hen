import "./App.css";

import Dashboard from "./pages/Dashboard";
import { ToastProvider } from "./components/ui/ToastContainer";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import { useEffect } from "react";
import { LogFrontendEvent } from "../wailsjs/go/backend/App";

function App() {
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
          LogFrontendEvent(`Window state changed: ${state.toUpperCase()} (Size: ${size?.w}x${size?.h} | Pos: ${pos?.x},${pos?.y})`);
          lastState = currentState;
        }
      } catch(e) {}
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
