import React, { createContext, useContext, useEffect, useState } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface AuthContextType {
  currentUser: User | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const login = async () => {
    try {
      // Get the client ID from environment
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        throw new Error('Google Client ID not configured');
      }
      
      // Use one of several authorized redirect URIs that match Google OAuth settings
      // Make sure these URIs are ALL added to your Google OAuth console
      let redirectUri;
      
      // EXACT match with Google OAuth settings
      if (window.location.hostname === 'itemize.up.railway.app') {
        // Use EXACTLY the URI from Google OAuth console - without port number
        redirectUri = 'https://itemize.up.railway.app/auth/callback';
        console.log('Using production redirect URI (no port):', redirectUri);
      } else {
        // For local development
        redirectUri = window.location.origin + '/auth/callback';
      }

      console.log('Using redirect URI:', redirectUri);
      console.log('Client ID:', clientId ? clientId.substring(0, 10) + '...' : 'missing');
      
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile`;
      
      console.log('OAuth login initiated with:', { 
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ? import.meta.env.VITE_GOOGLE_CLIENT_ID.substring(0, 10) + '...' : 'missing',
        redirectUri,
        url: googleAuthUrl
      });
      
      // Open popup window for Google OAuth
      const popup = window.open(googleAuthUrl, 'google-auth', 'width=500,height=600');
      
      // Listen for the popup to close or send a message
      return new Promise<void>((resolve, reject) => {
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            // Check if user was authenticated by looking for stored token
            const token = localStorage.getItem('auth_token');
            if (token) {
              loadUserFromToken();
              resolve();
            } else {
              reject(new Error('Authentication cancelled'));
            }
          }
        }, 1000);
        
        // Listen for messages from popup
        const messageListener = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          
          if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
            clearInterval(checkClosed);
            popup?.close();
            window.removeEventListener('message', messageListener);
            loadUserFromToken();
            resolve();
          } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
            clearInterval(checkClosed);
            popup?.close();
            window.removeEventListener('message', messageListener);
            reject(new Error(event.data.error));
          }
        };
        
        window.addEventListener('message', messageListener);
      });
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // First, call backend logout endpoint if you want to handle server-side cleanup
      try {
        await fetch(`${import.meta.env.VITE_API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });
      } catch (error) {
        // Continue with local logout even if backend call fails
        console.error('Error logging out on server:', error);
      }
      
      // Clear local storage
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('token_expiry');
      localStorage.removeItem('user');
      
      // Update state
      setCurrentUser(null);
      
      // No need to redirect to Google's endpoints
      // Just let the app handle the state change naturally
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const loadUserFromToken = async () => {
    const token = localStorage.getItem('auth_token');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      try {
        setCurrentUser(JSON.parse(userData));
      } catch (error) {
        console.error('Error parsing user data:', error);
        logout();
      }
    }
  };

  useEffect(() => {
    // Check for existing authentication on mount
    const initAuth = async () => {
      setLoading(true);
      await loadUserFromToken();
      setLoading(false);
    };
    
    initAuth();
  }, []);

  const value: AuthContextType = {
    currentUser,
    login,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};