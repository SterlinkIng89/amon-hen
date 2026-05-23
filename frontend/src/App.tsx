import "./App.css";

import Dashboard from "./pages/Dashboard";
import { ToastProvider } from "./components/ui/ToastContainer";

function App() {
  return (
    <ToastProvider>
      <div id="App">
        <Dashboard />
      </div>
    </ToastProvider>
  );
}

export default App;
