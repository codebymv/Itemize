import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

/** Defer Sentry off the landing critical path (FlashCore pattern). */
function scheduleMonitoring() {
  const run = () => {
    void import("./lib/sentry").then((m) => m.initSentry());
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => run(), { timeout: 4000 });
  } else {
    window.setTimeout(run, 2000);
  }
}
scheduleMonitoring();
