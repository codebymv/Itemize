import React from 'react';

interface IntegrationLogoProps {
  name: string;
  isLight: boolean;
  comingSoon?: boolean;
  children: React.ReactNode;
}

const IntegrationLogo = React.memo(function IntegrationLogo({ name, isLight, comingSoon, children }: IntegrationLogoProps) {
  return (
    <div 
      className={`
        group relative flex flex-col items-center gap-3 p-6 rounded-2xl border transition-all duration-300
        ${isLight 
          ? 'bg-white border-gray-200 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5' 
          : 'bg-slate-800 border-slate-700 hover:border-blue-700 hover:shadow-lg hover:shadow-blue-500/10'}
        ${comingSoon ? 'opacity-60' : ''}
      `}
    >
      <div className="w-10 h-10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
        {children}
      </div>
      <span className={`text-sm font-semibold ${isLight ? 'text-gray-700' : 'text-slate-300'}`}>
        {name}
      </span>
      {comingSoon && (
        <span className={`absolute -top-2 -right-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-900/50 text-amber-300'}`}>
          SOON
        </span>
      )}
    </div>
  );
});

/**
 * Renders integration logos as inline SVGs for maximum quality and theme-awareness.
 * These are simplified brand marks (not full logos to avoid trademark issues).
 */
export const IntegrationGrid = React.memo(function IntegrationGrid({ isLight }: { isLight: boolean }) {
  const iconColor = isLight ? '#374151' : '#94a3b8';
  const accentColor = isLight ? '#2563eb' : '#60a5fa';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {/* Stripe */}
      <IntegrationLogo name="Stripe" isLight={isLight}>
        <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
          <rect width="40" height="40" rx="8" fill={isLight ? '#635BFF' : '#7B73FF'} fillOpacity="0.1" />
          <path d="M18.5 15.2c0-.9.7-1.3 1.9-1.3 1.7 0 3.8.5 5.5 1.4V10c-1.8-.7-3.7-1-5.5-1-4.5 0-7.5 2.3-7.5 6.2 0 6.1 8.4 5.1 8.4 7.7 0 1.1-.9 1.4-2.2 1.4-1.9 0-4.3-.8-6.2-1.8v5.4c2.1.9 4.2 1.3 6.2 1.3 4.6 0 7.7-2.3 7.7-6.2-.1-6.5-8.3-5.4-8.3-7.8z" fill={isLight ? '#635BFF' : '#7B73FF'} />
        </svg>
      </IntegrationLogo>

      {/* Google Calendar */}
      <IntegrationLogo name="Google Calendar" isLight={isLight}>
        <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
          <rect width="40" height="40" rx="8" fill={isLight ? '#4285F4' : '#5B9AF5'} fillOpacity="0.1" />
          <path d="M28 12H12a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V14a2 2 0 00-2-2z" stroke={isLight ? '#4285F4' : '#5B9AF5'} strokeWidth="1.5" fill="none" />
          <path d="M26 10v4M14 10v4M10 18h20" stroke={isLight ? '#4285F4' : '#5B9AF5'} strokeWidth="1.5" strokeLinecap="round" />
          <rect x="14" y="21" width="4" height="3" rx="0.5" fill="#EA4335" />
          <rect x="22" y="21" width="4" height="3" rx="0.5" fill="#34A853" />
          <rect x="14" y="26" width="4" height="3" rx="0.5" fill="#FBBC04" />
          <rect x="22" y="26" width="4" height="3" rx="0.5" fill={isLight ? '#4285F4' : '#5B9AF5'} />
        </svg>
      </IntegrationLogo>

      {/* Gmail */}
      <IntegrationLogo name="Gmail" isLight={isLight}>
        <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
          <rect width="40" height="40" rx="8" fill="#EA4335" fillOpacity="0.1" />
          <path d="M10 14l10 7 10-7v14H10V14z" stroke="#EA4335" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
          <path d="M10 14l10 7 10-7" stroke="#EA4335" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 28l8-6M30 28l-8-6" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </IntegrationLogo>

      {/* Twilio */}
      <IntegrationLogo name="Twilio" isLight={isLight}>
        <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
          <rect width="40" height="40" rx="8" fill="#F22F46" fillOpacity="0.1" />
          <circle cx="20" cy="20" r="10" stroke="#F22F46" strokeWidth="1.5" fill="none" />
          <circle cx="16.5" cy="16.5" r="2" fill="#F22F46" />
          <circle cx="23.5" cy="16.5" r="2" fill="#F22F46" />
          <circle cx="16.5" cy="23.5" r="2" fill="#F22F46" />
          <circle cx="23.5" cy="23.5" r="2" fill="#F22F46" />
        </svg>
      </IntegrationLogo>

      {/* Webhooks */}
      <IntegrationLogo name="Webhooks" isLight={isLight}>
        <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
          <rect width="40" height="40" rx="8" fill={accentColor} fillOpacity="0.1" />
          <circle cx="20" cy="14" r="3" stroke={accentColor} strokeWidth="1.5" fill="none" />
          <circle cx="13" cy="26" r="3" stroke={accentColor} strokeWidth="1.5" fill="none" />
          <circle cx="27" cy="26" r="3" stroke={accentColor} strokeWidth="1.5" fill="none" />
          <path d="M20 17v3l-5.5 4M20 20l5.5 4" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </IntegrationLogo>

      {/* Zapier */}
      <IntegrationLogo name="Zapier" isLight={isLight} comingSoon>
        <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
          <rect width="40" height="40" rx="8" fill="#FF4A00" fillOpacity="0.1" />
          <path d="M24 16l-4 8h6l-4 8" stroke="#FF4A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 16h6M14 24h4" stroke="#FF4A00" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </IntegrationLogo>
    </div>
  );
});