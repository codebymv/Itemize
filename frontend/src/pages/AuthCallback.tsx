import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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

        // Send the authorization code to the backend
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/google-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          throw new Error('Failed to authenticate with backend');
        }

        const data = await response.json();
        
        // Store the tokens
        localStorage.setItem('auth_token', data.accessToken);
        localStorage.setItem('refresh_token', data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));

        // Send success message to parent window if this is a popup
        if (window.opener) {
          window.opener.postMessage({
            type: 'GOOGLE_AUTH_SUCCESS',
            user: data.user,
            token: data.accessToken
          }, window.location.origin);
          window.close();
        } else {
          // If not a popup, redirect to home page
          navigate('/', { replace: true });
        }
      } catch (error) {
        console.error('Authentication error:', error);
        if (window.opener) {
          window.opener.postMessage({
            type: 'GOOGLE_AUTH_ERROR',
            error: error instanceof Error ? error.message : 'Authentication failed'
          }, window.location.origin);
          window.close();
        } else {
          navigate('/', { replace: true });
        }
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;