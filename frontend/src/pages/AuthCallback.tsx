import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiUrl } from '@/lib/api';
import { storage } from '@/lib/storage';
import { Spinner } from '@/components/ui/Spinner';

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the authorization code from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        
        console.log('AuthCallback received:', { 
          hasCode: !!code, 
          codeLength: code?.length, 
          error: error || 'none',
          searchParams: window.location.search
        });

        if (error) {
          console.error('OAuth error:', error);
          // Send error message to parent window if this is a popup
          if (window.opener) {
            window.opener.postMessage({
              type: 'GOOGLE_AUTH_ERROR',
              error: error
            }, window.location.origin);
            window.close();
          } else {
            navigate('/', { replace: true });
          }
          return;
        }

        if (!code) {
          console.error('No authorization code received');
          if (window.opener) {
            window.opener.postMessage({
              type: 'GOOGLE_AUTH_ERROR',
              error: 'No authorization code received'
            }, window.location.origin);
            window.close();
          } else {
            navigate('/', { replace: true });
          }
          return;
        }

        const apiUrl = getApiUrl();
        console.log('Authorization code found, length:', code.length);
        console.log('Sending request to backend at:', `${apiUrl}/api/auth/google-login`);

        // Send the authorization code to the backend
        const response = await fetch(`${apiUrl}/api/auth/google-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Required for httpOnly cookies
          body: JSON.stringify({ code }),
        });

        console.log('Backend response received, status:', response.status);

        if (!response.ok) {
          throw new Error('Failed to authenticate with backend');
        }

        const data = await response.json();
        
        console.log('User authenticated successfully:', data.user?.email || 'unknown');

        // Store the tokens


        // Send success message to parent window if this is a popup
        if (window.opener) {
          console.log('Window opener found, posting success message');
          window.opener.postMessage({
            type: 'GOOGLE_AUTH_SUCCESS',
            user: data.user,
            token: data.accessToken
          }, window.location.origin);
          window.close();
        } else {
          console.log('No opener window (mobile flow), saving auth state directly');
          // Mobile flow: save user data to localStorage and redirect to dashboard
          if (data.user) {
            const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
            storage.setJson('itemize_user', data.user);
            storage.setItem('itemize_expiry', expiryTime.toString());
          }
          navigate('/dashboard', { replace: true });
        }
      } catch (error) {
        console.error('Error during auth callback:', error);
        console.error('Response data:', (error as any).response?.data);
        console.error('Response status:', (error as any).response?.status);
        
        // Send error to opener window if it exists
        if (window.opener) {
          window.opener.postMessage({
            type: 'GOOGLE_AUTH_ERROR',
            error: error instanceof Error ? error.message : 'Authentication failed'
          }, window.location.origin);
          window.close();
        } else {
          // Mobile flow: redirect to login with error
          navigate('/login?error=auth_failed', { replace: true });
        }
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Spinner size="lg" variant="brand" className="mx-auto mb-4" />
        <p className="text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;