import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

/** Clear brand shell after first paint — not a multi-second cover. */
function removeLcpShell() {
  document.getElementById('lh-hero-shell')?.remove();
}
requestAnimationFrame(() => {
  requestAnimationFrame(removeLcpShell);
});
window.setTimeout(removeLcpShell, 1500);
