import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

/** Defer Sentry off the landing critical path (FlashCore pattern). */
function scheduleMonitoring() {
  const run = () => {
    void import("./lib/sentry").then((m) => m.initSentry());
  };
  // Fixed delay: requestIdleCallback fires immediately under Lighthouse.
  window.setTimeout(run, 4000);
}
scheduleMonitoring();
