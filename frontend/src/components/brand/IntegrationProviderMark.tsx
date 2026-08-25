import { Link2 } from 'lucide-react';
import { ServiceMark } from '@/components/brand/ServiceMark';
import { cn } from '@/lib/utils';

export type IntegrationProviderMarkName =
  | 'google-calendar'
  | 'facebook'
  | 'stripe'
  | 'webhooks'
  | 'outlook-calendar';

interface IntegrationProviderMarkProps {
  provider: IntegrationProviderMarkName;
  className?: string;
}

export function IntegrationProviderMark({ provider, className }: IntegrationProviderMarkProps) {
  const markClassName = cn('h-6 w-6 shrink-0', className);

  if (provider === 'stripe') {
    return <ServiceMark service="stripe" className={markClassName} />;
  }

  if (provider === 'webhooks') {
    return <Link2 aria-hidden="true" className={cn(markClassName, 'text-blue-600')} />;
  }

  if (provider === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" className={markClassName} aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#1877F2" />
        <path
          fill="#fff"
          d="M13.6 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.4V13h2.8v8h3.4Z"
        />
      </svg>
    );
  }

  if (provider === 'outlook-calendar') {
    return (
      <svg viewBox="0 0 24 24" className={markClassName} aria-hidden="true">
        <path
          fill="#0078D4"
          d="M24 7.387v10.478c0 .23-.08.424-.238.576-.16.154-.352.23-.576.23h-8.547v-6.959l1.6 1.229c.102.086.221.127.357.127.14 0 .26-.041.358-.127l6.766-5.178c.156.134.23.337.23.616v8.293c0 .23-.076.424-.228.576a.78.78 0 0 1-.576.23H14.64v-3.508h6.77V7.44l-8.547 6.545-8.547-6.545v5.733h6.77v3.508H2.538a.78.78 0 0 1-.576-.23.778.778 0 0 1-.228-.576v-8.98l.51-.51 9.619 7.365 9.618-7.365.52.51V5.86c0-.259-.086-.475-.256-.648a.878.878 0 0 0-.647-.257H0V3.11c0-.23.076-.424.228-.576.153-.154.346-.23.576-.23h22.638c.23 0 .424.076.576.23.152.152.228.345.228.575v4.278Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={markClassName} aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335" />
    </svg>
  );
}
