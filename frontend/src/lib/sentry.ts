import * as Sentry from '@sentry/react';

export const initSentry = () => {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  const environment = import.meta.env.MODE || 'production';

  if (!sentryDsn && environment === 'production') {
    console.log('[Sentry] VITE_SENTRY_DSN not set - error tracking disabled');
    return;
  }

  if (!sentryDsn) {
    return;
  }

  try {
    Sentry.init({
      dsn: sentryDsn,
      environment,
      integrations: [
        Sentry.browserTracingIntegration()
      ],
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
      beforeBreadcrumb(breadcrumb) {
        return breadcrumb.category === 'xhr' ? null : breadcrumb;
      },
      beforeSend(event, hint) {
        if (event.exception) {
          event.exception.values?.forEach(exception => {
            if (exception.type === 'ChunkLoadError') {
              return null;
            }
            if (exception.value?.includes('Loading CSS chunk')) {
              return null;
            }
          });
        }
        return event;
      }
    });

    console.log(`[Sentry] Error tracking initialized (${environment})`);
  } catch (error) {
    console.error('[Sentry] Failed to initialize:', error);
  }
};