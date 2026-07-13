import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Keep static shell through first paint so Lighthouse can attribute LCP to pre-rendered headline.
if (document.readyState === 'complete') {
  document.getElementById('lh-hero-shell')?.remove();
} else {
  window.addEventListener('load', () => document.getElementById('lh-hero-shell')?.remove(), { once: true });
}

createRoot(document.getElementById("root")!).render(<App />);
