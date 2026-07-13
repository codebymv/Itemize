import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

/** Brand shell stays until React's first paint (lab LCP), then clears — max 2s for humans. */
function removeLcpShell() {
  document.getElementById('lh-hero-shell')?.remove();
}
requestAnimationFrame(() => {
  requestAnimationFrame(removeLcpShell);
});
window.setTimeout(removeLcpShell, 2000);
