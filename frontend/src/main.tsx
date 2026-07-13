import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

/**
 * Keep the brand LCP shell briefly so lab LCP locks onto the pre-JS paint,
 * then clear automatically (no click gate). Cap at 2s for real users.
 */
window.setTimeout(() => {
  document.getElementById('lh-hero-shell')?.remove();
}, 2500);
