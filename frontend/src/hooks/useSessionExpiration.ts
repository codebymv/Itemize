import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

/**
 * Hook to handle session expiration events
 * Listens for auth:session-expired custom events and shows user-friendly notifications
 */
export const useSessionExpiration = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleSessionExpired = () => {
      toast.error('Session Expired', {
        description: 'Your session has expired. Please sign in again.',
        duration: 5000,
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
