import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import { getApiUrl } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { useAuthActions, type User } from '@/contexts/AuthContext';
import logger from '@/lib/logger';

/**
 * Google OAuth popup sign-in. Only use inside GoogleOAuthProvider
 * (login/register routes) so accounts.google.com/gsi/client stays off marketing.
 */
export function useGoogleSignIn() {
  const navigate = useNavigate();
  const { establishSession } = useAuthActions();
  const pendingRedirectRef = useRef<string>('/dashboard');

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        logger.debug('auth', 'Google login successful, getting user info');

        const userResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });

        const googleUser = userResponse.data;
        const apiUrl = getApiUrl();

        const response = await axios.post(
          `${apiUrl}/api/auth/google-login`,
          {
            googleId: googleUser.sub,
            email: googleUser.email,
            name: googleUser.name,
            picture: googleUser.picture,
          },
          { withCredentials: true }
        );

        const { user: userData } = response.data as { user: User };
        establishSession(userData);

        toast({
          title: 'Welcome!',
          description: 'Successfully signed in with Google.',
        });

        const redirectTo = pendingRedirectRef.current || '/dashboard';
        pendingRedirectRef.current = '/dashboard';
        navigate(redirectTo, { replace: true });
      } catch (error) {
        logger.error('Google login failed:', error);
        toast({
          title: 'Login failed',
          description: 'Failed to sign in with Google. Please try again.',
          variant: 'destructive',
        });
      }
    },
    onError: () => {
      logger.error('Google login failed');
      toast({
        title: 'Login failed',
        description: 'Google sign-in was cancelled or failed. Please try again.',
        variant: 'destructive',
      });
    },
    scope: 'email profile',
  });

  return useCallback((redirectTo?: string) => {
    pendingRedirectRef.current = redirectTo || '/dashboard';
    logger.debug('auth', 'Starting Google login, will redirect to:', pendingRedirectRef.current);
    googleLogin();
  }, [googleLogin]);
}
