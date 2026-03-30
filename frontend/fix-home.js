import fs from 'fs';

let content = fs.readFileSync('src/pages/Home.tsx', 'utf8');

// 1. Imports
content = content.replace(
  `import { PricingCards } from '@/components/subscription';\nimport AppScreenshot from './home/components/AppScreenshot';\nimport FeatureShowcase from './home/components/FeatureShowcase';\nimport { IntegrationGrid } from './home/components/IntegrationLogos';`,
  `import { lazy, Suspense } from 'react';\nimport AppScreenshot from './home/components/AppScreenshot';\n\nconst FeatureShowcase = lazy(() => import('./home/components/FeatureShowcase'));\nconst IntegrationGrid = lazy(() => import('./home/components/IntegrationLogos').then(module => ({ default: module.IntegrationGrid })));\nconst PricingCards = lazy(() => import('@/components/subscription').then(module => ({ default: module.PricingCards })));`
);

// 2. RevealSection signature
content = content.replace(/,\s*isFastScrolling = false/g, '');
content = content.replace(/isFastScrolling\?: boolean;/g, '');
content = content.replace(/const reveal = useRevealClass\(variant, \{ delay, isFastScrolling \}\);/g, 'const reveal = useRevealClass(variant, { delay });');

// 3. State and effect removal
content = content.replace(/[ \t]*\/\/ Scroll velocity tracking[\s\S]*?}, \[velocityThreshold, scrollCooldown\]\);\n\n/g, '');

// 4. Props removal
content = content.replace(/ isFastScrolling=\{isFastScrolling\}/g, '');

// 5. Blur orbs memory leak fix
content = content.replace(/ style={{ willChange: 'transform' }}/g, '');

// 6. Suspense wrappers
content = content.replace(/<div className="space-y-28 md:space-y-36">/, 
  `<div className="space-y-28 md:space-y-36">\n              <Suspense fallback={<div className="h-[600px] w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-3xl" />}>`
);

content = content.replace(/src="\/screenshots\/automations\.png"\n\s*\/>\n\s*<\/div>/, 
  `src="/screenshots/automations.png"\n              />\n              </Suspense>\n            </div>`
);

content = content.replace(/<IntegrationGrid isLight=\{isLight\} \/>/, 
  `<Suspense fallback={<div className="h-40 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />}><IntegrationGrid isLight={isLight} /></Suspense>`
);

content = content.replace(/<PricingCards isLight=\{isLight\} \/>/, 
  `<Suspense fallback={<div className="h-96 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-3xl" />}><PricingCards isLight={isLight} /></Suspense>`
);

// 7. Hero screenshot priority
content = content.replace(/src="\/screenshots\/dashboard\.png"/, 
  `src="/screenshots/dashboard.png"\n                priority={true}`
);

fs.writeFileSync('src/pages/Home.tsx', content);
console.log('Update complete.');
