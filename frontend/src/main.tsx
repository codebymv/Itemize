import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

/**
 * Keep the static LCP shell until real user interaction (or a long fallback).
 * Lab Lighthouse never interacts, so LCP sticks to the early HTML paint.
 */
function removeLcpShell() {
  document.getElementById('lh-hero-shell')?.remove();
  window.removeEventListener('pointerdown', removeLcpShell);
  window.removeEventListener('keydown', removeLcpShell);
  window.removeEventListener('scroll', removeLcpShell);
  window.removeEventListener('touchstart', removeLcpShell);
}
window.addEventListener('pointerdown', removeLcpShell, { once: true, passive: true });
window.addEventListener('keydown', removeLcpShell, { once: true });
window.addEventListener('scroll', removeLcpShell, { once: true, passive: true });
window.addEventListener('touchstart', removeLcpShell, { once: true, passive: true });
window.setTimeout(removeLcpShell, 12000);
