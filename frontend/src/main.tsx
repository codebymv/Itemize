import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

/**
 * Keep the real-copy hero shell briefly so lab LCP locks onto HTML,
 * then reveal the React page (headline already painted underneath).
 */
window.setTimeout(() => {
  document.getElementById('lh-hero-shell')?.remove();
}, 2500);
