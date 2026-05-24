import "./App.css";

import Dashboard from "./pages/Dashboard";
import { ToastProvider } from "./components/ui/ToastContainer";
import ErrorBoundary from "./components/ui/ErrorBoundary";

function App() {
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
