import React from 'react';
import { ServiceMark } from '@/components/brand/ServiceMark';

interface IntegrationLogoProps {
  name: string;
  comingSoon?: boolean;
  children: React.ReactNode;
}

const IntegrationLogo = React.memo(function IntegrationLogo({ name, comingSoon, children }: IntegrationLogoProps) {
  return (
    <div
      className={`
        group relative flex flex-col items-center justify-center text-center gap-3 p-6 rounded-2xl border transition-all duration-300 h-full
        bg-white border-gray-200 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5
        dark:bg-slate-800 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:shadow-blue-500/10
        ${comingSoon ? 'opacity-60' : ''}
      `}
    >
      <div className="w-10 h-10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
        {children}
      </div>
      <span className="text-sm font-semibold leading-tight text-gray-700 dark:text-slate-300">
        {name}
      </span>
      {comingSoon && (
        <span className="absolute -top-2 -right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
          SOON
        </span>
      )}
    </div>
  );
});

/**
 * Renders integrations with the shared service-mark registry where available,
 * plus product-specific inline artwork for the remaining homepage integrations.
 */
export const IntegrationGrid = React.memo(function IntegrationGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {/* Stripe */}
      <IntegrationLogo name="Stripe">
        <ServiceMark service="stripe" />
      </IntegrationLogo>

      {/* Google Calendar */}
      <IntegrationLogo name="Google Calendar">
        <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
          <rect width="40" height="40" rx="8" fill="#4285F4" fillOpacity="0.1" />
          <g transform="translate(8, 8) scale(0.5)">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </g>
        </svg>
      </IntegrationLogo>

      {/* Gmail */}
      <IntegrationLogo name="Gmail">
        <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
          <rect width="40" height="40" rx="8" fill="#EA4335" fillOpacity="0.1" />
          <g transform="translate(8, 8)">
            <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.271H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 8.41l8.073-4.917c1.618-1.214 3.927-.059 3.927 1.964Z" fill="#EA4335"/>
            <path d="M18.545 21h3.819C23.268 21 24 20.268 24 19.364V11.73l-5.455 3.54v5.73Z" fill="#34A853"/>
            <path d="M5.455 21H1.636C.732 21 0 20.268 0 19.364V11.73l5.455 3.54v5.73Z" fill="#4285F4"/>
            <path d="M12 16.639 5.455 11.73V5.456l6.545 4.912L18.545 5.456v6.273L12 16.639Z" fill="#FBBC04"/>
          </g>
        </svg>
      </IntegrationLogo>

      {/* Twilio */}
      <IntegrationLogo name="Twilio">
        <ServiceMark service="twilio" />
      </IntegrationLogo>

      {/* Webhooks */}
      <IntegrationLogo name="Webhooks">
        <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10 text-blue-600 dark:text-blue-400">
          <rect width="40" height="40" rx="8" fill="currentColor" fillOpacity="0.1" />
          <circle cx="20" cy="14" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <circle cx="13" cy="26" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <circle cx="27" cy="26" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M20 17v3l-5.5 4M20 20l5.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </IntegrationLogo>

      {/* Gleam */}
      <IntegrationLogo name="Gleam">
        <ServiceMark service="gleam" />
      </IntegrationLogo>
    </div>
  );
});
