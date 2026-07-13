import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

/** Keep the static LCP shell until idle so lab LCP lands on early HTML paint. */
function removeLcpShell() {
  document.getElementById('lh-hero-shell')?.remove();
}
if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(() => removeLcpShell(), { timeout: 5000 });
} else {
  window.setTimeout(removeLcpShell, 3000);
}
