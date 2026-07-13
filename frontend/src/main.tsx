import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Remove brand LCP shell as soon as React hydrates (SampleSeeker pattern).
document.getElementById('lh-hero-shell')?.remove();

createRoot(document.getElementById("root")!).render(<App />);
