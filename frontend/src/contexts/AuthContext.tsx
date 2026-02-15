import React, { createContext, useState, useContext, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin, googleLogout, CredentialResponse } from '@react-oauth/google';
import api, { getApiUrl, setAuthToken, getAuthToken } from '@/lib/api';
import { storage } from '@/lib/storage';
import axios from 'axios'; // Keep axios for Google API calls
import { toast } from '@/components/ui/use-toast'; // Import toast
import logger from '@/lib/logger';

export interface User {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  role?: 'USER' | 'ADMIN';
}

interface AuthStateContextType {
  currentUser: User | null;
  loading: boolean;
  token: string | null;
  isAuthenticated: boolean;
}

interface AuthActionsContextType {
  login: (redirectTo?: string) => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  handleGoogleSuccess: (credentialResponse: CredentialResponse) => void;
  setCurrentUser: (user: User | null) => void;
}

// Custom error class for auth errors with code
export class AuthError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = 'AuthError';
  }
}

const AuthStateContext = createContext<AuthStateContextType | undefined>(undefined);
const AuthActionsContext = createContext<AuthActionsContextType | undefined>(undefined);

export const useAuthState = () => {
  const context = useContext(AuthStateContext);
  if (context === undefined) {
    throw new Error('useAuthState must be used within an AuthProvider');
  }
  return context;
};

export const useAuthActions = () => {
  const context = useContext(AuthActionsContext);
  if (context === undefined) {
    throw new Error('useAuthActions must be used within an AuthProvider');
  }
  return context;
};

export const useAuth = () => {
  const state = useAuthState();
  const actions = useAuthActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  
  // Store redirect path for post-auth navigation
  const pendingRedirectRef = useRef<string | null>(null);

  // Initialize authentication state using cookie-based auth
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Fetch user from backend using httpOnly cookies
        const response = await api.get('/api/auth/me');

        // After api.ts transformation, response.data is directly the user object
        if (response.data && response.data.id) {
          setCurrentUser({
            uid: response.data.id,
            name: response.data.name,
            email: response.data.email,
            role: response.data.role,
          });
          setToken(null); // null = using cookies
        }
      } catch (error) {
        // 401 or other errors mean user is not authenticated
        // Clear any stale data
        setAuthToken(null);
        storage.removeItem('itemize_user');
        storage.removeItem('itemize_expiry');
        logger.debug('Not authenticated (user not logged in)');
      } finally {
        setLoading(false);
      }
    };
    
    initializeAuth();
  }, []);

  // Helper to save user data after successful auth (cookies handle the token)
  const saveAuthState = useCallback((userData: User, authToken: string) => {
    // Set expiry to match refresh token duration (30 days)
    const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000);
    
    // Store user data (token is handled by httpOnly cookies now, set to null to avoid sending auth header)
    storage.setJson('itemize_user', userData);
    storage.setItem('itemize_expiry', expiryTime.toString());
    
    // Update React state - token is null since we use cookies
    setToken(null);
    setCurrentUser(userData);
  }, []);

  // Use Google Login hook
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        logger.debug('auth', 'Google login successful, getting user info');
        
        // Get user info from Google using the access token
        const userResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        });
        
        const googleUser = userResponse.data;
        logger.debug('auth', 'Received user info from Google:', googleUser);
        
        // Now authenticate with your backend using the Google user info
        const apiUrl = getApiUrl();
        logger.debug('auth', 'Sending user info to backend:', `${apiUrl}/api/auth/google-login`);
        
        // Make API request with proper data
        try {
          const response = await axios.post(`${apiUrl}/api/auth/google-login`, {
            googleId: googleUser.sub,
            email: googleUser.email,
            name: googleUser.name,
            picture: googleUser.picture
          }, { withCredentials: true });

          logger.debug('auth', 'Backend auth response:', response.data);
          
          const { user: userData, token: authToken } = response.data;
          
          // Save auth state with token (Gleam-style)
          if (!authToken) {
            throw new Error('No token received from backend');
          }
          saveAuthState(userData, authToken);
          
          toast({
            title: 'Welcome!',
            description: 'Successfully signed in with Google.',
          });

          // Navigate to the pending redirect path after successful auth
          const redirectTo = pendingRedirectRef.current || '/dashboard';
          pendingRedirectRef.current = null;
          logger.debug('auth', 'Google auth complete, redirecting to:', redirectTo);
          
          navigate(redirectTo, { replace: true });
        } catch (backendError) {
          logger.error('Backend auth error:', backendError);
          throw new Error(`Backend authentication failed: ${backendError.message}`);
        }
        
      } catch (error) {
        logger.error('Google login failed:', error);
        toast({
          title: 'Login failed',
          description: 'Failed to sign in with Google. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      logger.error('Google login failed');
      setLoading(false);
      toast({
        title: 'Login failed',
        description: 'Google sign-in was cancelled or failed. Please try again.',
        variant: 'destructive',
      });
    },
    scope: 'email profile'
  });

  const login = useCallback((redirectTo?: string) => {
    // Store the redirect path for use after successful auth
    pendingRedirectRef.current = redirectTo || '/dashboard';
    logger.debug('auth', 'Starting Google login, will redirect to:', pendingRedirectRef.current);
    googleLogin();
  }, [googleLogin]);

  /**
   * Login with email and password (Gleam-style)
   */
  const loginWithEmail = useCallback(async (email: string, password: string): Promise<void> => {
    try {
      const response = await api.post('/api/auth/login', { email, password });
      
      if (response.data.success || response.data.user) {
        const userData = response.data.user;
        const authToken = response.data.token;
        
        if (!authToken) {
          throw new AuthError('No token received from server', 'NO_TOKEN');
        }
        
        // Save auth state with token (Gleam-style)
        saveAuthState(userData, authToken);
      } else {
        throw new AuthError(response.data.error || 'Login failed', response.data.code || 'UNKNOWN');
      }
    } catch (error) {
      // Handle axios error response
      if (error.response?.data) {
        throw new AuthError(
          error.response.data.error || 'Login failed',
          error.response.data.code || 'UNKNOWN'
        );
      }
      throw error;
    }
  }, [saveAuthState]);

  /**
   * Register a new account with email and password
   */
  const register = useCallback(async (email: string, password: string, name?: string): Promise<void> => {
    try {
      const response = await api.post('/api/auth/register', { email, password, name });
      
      if (!response.data.success) {
        throw new AuthError(response.data.error || 'Registration failed', response.data.code || 'UNKNOWN');
      }
      // Don't auto-login - user needs to verify email first
    } catch (error) {
      // Handle axios error response
      if (error.response?.data) {
        throw new AuthError(
          error.response.data.error || 'Registration failed',
          error.response.data.code || 'UNKNOWN'
        );
      }
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    // Clear state
    setToken(null);
    setCurrentUser(null);
    
    // Clear all auth data from localStorage (Gleam-style)
    setAuthToken(null);
    storage.removeItem('itemize_user');
    storage.removeItem('itemize_expiry');
    
    // Sign out from Google
    try {
      googleLogout();
    } catch (googleError) {
      logger.error('Error signing out from Google:', googleError);
    }
    
    // Backend logout (optional - mainly for clearing any server-side sessions)
    try {
      api.post('/api/auth/logout').catch((error) => {
        logger.error('Backend logout failed:', error);
      });
    } catch (error) {
      logger.error('Backend logout failed:', error);
    }
  }, []);

  // For handling credential response from Google One Tap
  const handleGoogleSuccess = useCallback(async (credentialResponse: CredentialResponse) => {
    setLoading(true);
    try {
      logger.debug('auth', 'Google One Tap login successful');
      
      // Send the credential to your backend
      const apiUrl = getApiUrl();
      const response = await axios.post(`${apiUrl}/api/auth/google-credential`, {
        credential: credentialResponse.credential
      }, { withCredentials: true });

      const { user: userData, token: authToken } = response.data;
      
      if (!authToken) {
        throw new Error('No token received from backend');
      }
      
      // Save auth state with token (Gleam-style)
      saveAuthState(userData, authToken);
      
      toast({
        title: 'Welcome!',
        description: 'Successfully signed in with Google.',
      });
    } catch (error) {
      logger.error('Google credential login failed:', error);
    } finally {
      setLoading(false);
    }
  }, [saveAuthState]);

  const stateValue = useMemo<AuthStateContextType>(() => ({
    currentUser,
    loading,
    token,
    isAuthenticated: !!currentUser && !!token,
  }), [currentUser, loading, token]);

  const actionsValue = useMemo<AuthActionsContextType>(() => ({
    login,
    loginWithEmail,
    register,
    logout,
    handleGoogleSuccess,
    setCurrentUser,
  }), [login, loginWithEmail, register, logout, handleGoogleSuccess, setCurrentUser]);

  return (
    <AuthStateContext.Provider value={stateValue}>
      <AuthActionsContext.Provider value={actionsValue}>
        {children}
      </AuthActionsContext.Provider>
    </AuthStateContext.Provider>
  );
};
