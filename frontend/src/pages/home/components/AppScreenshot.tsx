import React, { memo } from 'react';
import { Monitor } from 'lucide-react';

interface AppScreenshotProps {
  /** Label shown inside the placeholder (e.g. "Dashboard", "Pipeline View") */
  label: string;
  /** Optional sublabel for more context */
  sublabel?: string;
  /** Gradient accent colors for the placeholder */
  accentFrom?: string;
  accentTo?: string;
  /** Whether to show browser chrome (window frame) */
  showChrome?: boolean;
  /** Light/dark theme */
  isLight: boolean;
  /** Aspect ratio class (default: aspect-[16/10]) */
  aspectRatio?: string;
  /** Optional real screenshot src - when provided, shows image instead of placeholder */
  src?: string;
  /** Alt text for the image */
  alt?: string;
  /** Additional className */
  className?: string;
}

/**
 * Elegant placeholder for app screenshots with browser chrome frame.
 * When `src` is provided, renders the actual screenshot.
 * When absent, shows a styled gradient placeholder with label.
 * 
 * To swap in real screenshots later, just add src="/screenshots/dashboard.png".
 */
const AppScreenshot = memo(function AppScreenshot({
  label,
  sublabel,
  accentFrom = 'from-blue-500',
  accentTo = 'to-indigo-600',
  showChrome = true,
  isLight,
  aspectRatio = 'aspect-[16/10]',
  src,
  alt,
  className = '',
}: AppScreenshotProps) {
  const chromeBg = isLight ? 'bg-gray-100' : 'bg-slate-700';
  const chromeBtn = isLight ? 'bg-gray-300' : 'bg-slate-500';
  const chromeUrlBg = isLight ? 'bg-white' : 'bg-slate-600';
  const chromeUrlText = isLight ? 'text-gray-400' : 'text-slate-400';
  const frameBorder = isLight ? 'border-gray-200' : 'border-slate-600';
  const frameBg = isLight ? 'bg-white' : 'bg-slate-800';
  const frameShadow = isLight 
    ? 'shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15),0_10px_30px_-10px_rgba(0,0,0,0.1)]' 
    : 'shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5),0_10px_30px_-10px_rgba(0,0,0,0.3)]';

  return (
    <div className={`rounded-xl overflow-hidden border ${frameBorder} ${frameBg} ${frameShadow} ${className}`}>
      {/* Browser chrome */}
      {showChrome && (
        <div className={`${chromeBg} px-4 py-2.5 flex items-center gap-3 border-b ${frameBorder}`}>
          {/* Traffic lights */}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
            <div className="w-3 h-3 rounded-full bg-green-400/80" />
          </div>
          {/* URL bar */}
          <div className={`flex-1 ${chromeUrlBg} rounded-md px-3 py-1 flex items-center gap-2`}>
            <div className={`w-3 h-3 rounded-sm ${isLight ? 'bg-gray-200' : 'bg-slate-500'}`} />
            <span className={`text-xs ${chromeUrlText} select-none`}>app.itemize.com</span>
          </div>
        </div>
      )}

      {/* Screenshot area */}
      {src ? (
        <img 
          src={src} 
          alt={alt || label}
          className={`w-full ${aspectRatio} object-cover object-top`}
          loading="lazy"
        />
      ) : (
        <div className={`${aspectRatio} relative overflow-hidden`}>
          {/* Gradient background */}
          <div className={`absolute inset-0 bg-gradient-to-br ${accentFrom} ${accentTo} opacity-[0.07]`} />
          
          {/* Subtle grid pattern */}
          <div 
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(${isLight ? '#000' : '#fff'} 1px, transparent 1px), linear-gradient(to right, ${isLight ? '#000' : '#fff'} 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}
          />

          {/* Content placeholder - simulates UI structure */}
          <div className="absolute inset-0 p-6 flex flex-col">
            {/* Top bar simulation */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${accentFrom} ${accentTo} opacity-20`} />
                <div className={`h-3 w-24 rounded-full ${isLight ? 'bg-gray-200' : 'bg-slate-600'}`} />
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-3 w-16 rounded-full ${isLight ? 'bg-gray-200' : 'bg-slate-600'}`} />
                <div className={`w-7 h-7 rounded-full ${isLight ? 'bg-gray-200' : 'bg-slate-600'}`} />
              </div>
            </div>

            {/* Main content area - cards simulation */}
            <div className="flex-1 grid grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-3">
                  <div className={`h-20 rounded-lg ${isLight ? 'bg-gray-100' : 'bg-slate-700'} opacity-60`} />
                  <div className={`h-3 w-full rounded-full ${isLight ? 'bg-gray-100' : 'bg-slate-700'} opacity-40`} />
                  <div className={`h-3 w-2/3 rounded-full ${isLight ? 'bg-gray-100' : 'bg-slate-700'} opacity-30`} />
                </div>
              ))}
            </div>
          </div>

          {/* Centered label overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`p-3 rounded-2xl bg-gradient-to-br ${accentFrom} ${accentTo} opacity-10 mb-3`}>
              <Monitor className={`h-8 w-8 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
            </div>
            <span className={`text-sm font-semibold tracking-wide uppercase ${isLight ? 'text-gray-300' : 'text-slate-500'}`}>
              {label}
            </span>
            {sublabel && (
              <span className={`text-xs mt-1 ${isLight ? 'text-gray-300' : 'text-slate-600'}`}>
                {sublabel}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default AppScreenshot;