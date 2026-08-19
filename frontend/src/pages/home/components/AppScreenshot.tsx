import React, { memo } from 'react';
import { Monitor, Lock } from 'lucide-react';

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
  /** Whether this is a high-priority hero image (disables lazy loading) */
  priority?: boolean;
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
  aspectRatio = 'aspect-[16/10]',
  src,
  alt,
  className = '',
  priority = false,
}: AppScreenshotProps) {
  return (
    <div className={`rounded-xl overflow-hidden border border-gray-200 bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15),0_10px_30px_-10px_rgba(0,0,0,0.1)] dark:border-slate-600 dark:bg-slate-800 dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5),0_10px_30px_-10px_rgba(0,0,0,0.3)] ${className}`}>
      {/* Browser chrome */}
      {showChrome && (
        <div className="bg-gray-100 px-4 py-2.5 flex items-center gap-3 border-b border-gray-200 dark:bg-slate-700 dark:border-slate-600">
          {/* Traffic lights */}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
            <div className="w-3 h-3 rounded-full bg-green-400/80" />
          </div>
          {/* URL bar */}
          <div className="flex-1 mx-4 bg-white rounded-md px-3 py-1 flex items-center justify-center gap-1.5 shadow-sm dark:bg-slate-600">
            <Lock className="w-3 h-3 opacity-70 text-gray-600 dark:text-slate-300" />
            <span className="text-[11px] font-medium tracking-wide text-gray-600 dark:text-slate-300 select-none">itemize.cloud</span>
          </div>
        </div>
      )}

      {/* Screenshot area */}
      {src ? (
        <picture>
          {src.endsWith('.webp') ? (
            <source type="image/webp" srcSet={src} />
          ) : src.endsWith('.png') ? (
            <source type="image/webp" srcSet={src.replace(/\.png$/i, '.webp')} />
          ) : null}
          <img
            src={src.endsWith('.webp') ? src.replace(/\.webp$/i, '.png') : src}
            alt={alt || label}
            className={`w-full h-auto object-contain object-top`}
            loading={priority ? undefined : "lazy"}
            fetchPriority={priority ? "high" : undefined}
          />
        </picture>
      ) : (
        <div className={`${aspectRatio} relative overflow-hidden`}>
          {/* Gradient background */}
          <div className={`absolute inset-0 bg-gradient-to-br ${accentFrom} ${accentTo} opacity-[0.07]`} />

          {/* Subtle grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.04] text-black dark:text-white"
            style={{
              backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(to right, currentColor 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />

          {/* Content placeholder - simulates UI structure */}
          <div className="absolute inset-0 p-6 flex flex-col">
            {/* Top bar simulation */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${accentFrom} ${accentTo} opacity-20`} />
                <div className="h-3 w-24 rounded-full bg-gray-200 dark:bg-slate-600" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-16 rounded-full bg-gray-200 dark:bg-slate-600" />
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-600" />
              </div>
            </div>

            {/* Main content area - cards simulation */}
            <div className="flex-1 grid grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-3">
                  <div className="h-20 rounded-lg bg-gray-100 dark:bg-slate-700 opacity-60" />
                  <div className="h-3 w-full rounded-full bg-gray-100 dark:bg-slate-700 opacity-40" />
                  <div className="h-3 w-2/3 rounded-full bg-gray-100 dark:bg-slate-700 opacity-30" />
                </div>
              ))}
            </div>
          </div>

          {/* Centered label overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`p-3 rounded-2xl bg-gradient-to-br ${accentFrom} ${accentTo} opacity-10 mb-3`}>
              <Monitor className="h-8 w-8 text-gray-400 dark:text-slate-500" />
            </div>
            <span className="text-sm font-semibold tracking-wide uppercase text-gray-300 dark:text-slate-500">
              {label}
            </span>
            {sublabel && (
              <span className="text-xs mt-1 text-gray-300 dark:text-slate-600">
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
