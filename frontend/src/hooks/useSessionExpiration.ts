import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import api, { getRefreshToken, setAuthToken } from '@/lib/api';

/**
 * Hook to handle session expiration events
 * Listens for auth:session-expired custom events and shows user-friendly notifications
 */
export const useSessionExpiration = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleSessionExpired = () => {
      toast({
        title: 'Session Expired',
        description: 'Your session has expired. Please sign in again.',
        variant: 'destructive',
      });
    };

    // Listen for session expired events from API interceptor
    window.addEventListener('auth:session-expired', handleSessionExpired);

    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
    };
  }, [navigate]);
};

/**
 * Hook to show "session expiring soon" warning with "Stay signed in" action.
 * Listens for auth:session-expiring (dispatched by api.ts proactive timer).
 */
export const useSessionWarning = () => {
  const { toast: toastFn, dismiss } = useToast();
  const expiringToastIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handleSessionExpiring = () => {
      const t = toastFn({
        title: 'Your session expires soon',
        description: 'Stay signed in to continue.',
        variant: 'default',
        action: (
          <ToastAction
            altText="Stay signed in"
            onClick={async () => {
              try {
                const refreshToken = getRefreshToken();
                const res = await api.post('/api/auth/refresh', refreshToken ? { refreshToken } : undefined);
                if (res.data?.token) {
                  setAuthToken(res.data.token);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('auth:token-refreshed', {
                      detail: { token: res.data.token },
                    }));
                  }
                  if (expiringToastIdRef.current) {
                    dismiss(expiringToastIdRef.current);
                    expiringToastIdRef.current = null;
                  }
                  toastFn({
                    title: "You're signed in",
                    description: 'Your session has been extended.',
                  });
                }
              } catch {
                toastFn({
                  title: 'Could not extend session',
                  description: 'Please sign in again.',
                  variant: 'destructive',
                });
              }
            }}
          >
            Stay signed in
          </ToastAction>
        ),
      });
      expiringToastIdRef.current = typeof t?.id === 'string' ? t.id : null;
    };

    window.addEventListener('auth:session-expiring', handleSessionExpiring);
    return () => {
      window.removeEventListener('auth:session-expiring', handleSessionExpiring);
    };
  }, []);
};

/**
 * Hook to handle token refresh events
 * Useful for reconnecting WebSockets or refreshing data after token refresh
 */
export const useTokenRefresh = (onTokenRefreshed?: (token: string) => void) => {
  useEffect(() => {
    const handleTokenRefreshed = (event: CustomEvent) => {
      const { token } = event.detail;
      console.log('[Session] Token refreshed, updating connections...');
      
      if (onTokenRefreshed) {
        onTokenRefreshed(token);
      }
    };

    window.addEventListener('auth:token-refreshed', handleTokenRefreshed as EventListener);

    return () => {
      window.removeEventListener('auth:token-refreshed', handleTokenRefreshed as EventListener);
    };
  }, [onTokenRefreshed]);
};
