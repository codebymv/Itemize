import React, { createContext, useState, useContext, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin, googleLogout, CredentialResponse } from '@react-oauth/google';
import api, { getApiUrl, setAuthToken, getAuthToken } from '@/lib/api';
import axios from 'axios'; // Keep axios for Google API calls
import { toast } from '@/components/ui/use-toast'; // Import toast

export interface User {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  role?: 'USER' | 'ADMIN';
}

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (redirectTo?: string) => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  handleGoogleSuccess: (credentialResponse: CredentialResponse) => void;
  token: string | null;
  isAuthenticated: boolean;
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
  const [token, setToken] = useState<string | null>(null);
  
  // Store redirect path for post-auth navigation
  const pendingRedirectRef = useRef<string | null>(null);

  // Initialize authentication state from localStorage (Gleam-style approach)
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check for saved auth token and user data in localStorage
        const savedToken = getAuthToken();
        const savedUser = localStorage.getItem('itemize_user');
        const expiryTime = localStorage.getItem('itemize_expiry');
        
        // If we have token, user data, and not expired, restore auth state
        if (savedToken && savedUser && expiryTime && parseInt(expiryTime) > Date.now()) {
          try {
            const userData = JSON.parse(savedUser);
            setToken(savedToken);
            setCurrentUser(userData);
          } catch (parseError) {
            // Clean up invalid data
            setAuthToken(null);
            localStorage.removeItem('itemize_user');
            localStorage.removeItem('itemize_expiry');
          }
        } else {
          // Clean up expired data
          setAuthToken(null);
          localStorage.removeItem('itemize_user');
          localStorage.removeItem('itemize_expiry');
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeAuth();
  }, []);

  // Helper to save user data and token after successful auth (Gleam-style)
  const saveAuthState = (userData: User, authToken: string) => {
    // Set expiry to match refresh token duration (30 days)
    const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000);
    
    // Store token in localStorage (Gleam-style - works on mobile Safari)
    setAuthToken(authToken);
    
    // Store user data
    localStorage.setItem('itemize_user', JSON.stringify(userData));
    localStorage.setItem('itemize_expiry', expiryTime.toString());
    
    // Update React state
    setToken(authToken);
    setCurrentUser(userData);
  };

  // Use Google Login hook
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        console.log('Google login successful, getting user info');
        
        // Get user info from Google using the access token
        const userResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        });
        
        const googleUser = userResponse.data;
        console.log('Received user info from Google:', googleUser);
        
        // Now authenticate with your backend using the Google user info
        const apiUrl = getApiUrl();
        console.log('Sending user info to backend:', `${apiUrl}/api/auth/google-login`);
        
        // Make API request with proper data
        try {
          const response = await axios.post(`${apiUrl}/api/auth/google-login`, {
            googleId: googleUser.sub,
            email: googleUser.email,
            name: googleUser.name,
            picture: googleUser.picture
          }, { withCredentials: true });

          console.log('Backend auth response:', response.data);
          
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
          console.log('Google auth complete, redirecting to:', redirectTo);
          
          // Use window.location for reliable navigation after auth state change
          // This ensures the page reloads with fresh auth state
          window.location.href = redirectTo;
        } catch (backendError) {
          console.error('Backend auth error:', backendError);
          throw new Error(`Backend authentication failed: ${backendError.message}`);
        }
        
      } catch (error) {
        console.error('Google login failed:', error);
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
      console.error('Google login failed');
      setLoading(false);
      toast({
        title: 'Login failed',
        description: 'Google sign-in was cancelled or failed. Please try again.',
        variant: 'destructive',
      });
    },
    scope: 'email profile'
  });

  const login = (redirectTo?: string) => {
    // Store the redirect path for use after successful auth
    pendingRedirectRef.current = redirectTo || '/dashboard';
    console.log('Starting Google login, will redirect to:', pendingRedirectRef.current);
    googleLogin();
  };

  /**
   * Login with email and password (Gleam-style)
   */
  const loginWithEmail = async (email: string, password: string): Promise<void> => {
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
    } catch (error: any) {
      // Handle axios error response
      if (error.response?.data) {
        throw new AuthError(
          error.response.data.error || 'Login failed',
          error.response.data.code || 'UNKNOWN'
        );
      }
      throw error;
    }
  };

  /**
   * Register a new account with email and password
   */
  const register = async (email: string, password: string, name?: string): Promise<void> => {
    try {
      const response = await api.post('/api/auth/register', { email, password, name });
      
      if (!response.data.success) {
        throw new AuthError(response.data.error || 'Registration failed', response.data.code || 'UNKNOWN');
      }
      // Don't auto-login - user needs to verify email first
    } catch (error: any) {
      // Handle axios error response
      if (error.response?.data) {
        throw new AuthError(
          error.response.data.error || 'Registration failed',
          error.response.data.code || 'UNKNOWN'
        );
      }
      throw error;
    }
  };

  const logout = () => {
    // Clear state
    setToken(null);
    setCurrentUser(null);
    
    // Clear all auth data from localStorage (Gleam-style)
    setAuthToken(null);
    localStorage.removeItem('itemize_user');
    localStorage.removeItem('itemize_expiry');
    
    // Sign out from Google
    try {
      googleLogout();
    } catch (googleError) {
      console.error('Error signing out from Google:', googleError);
    }
    
    // Backend logout (optional - mainly for clearing any server-side sessions)
    try {
      api.post('/api/auth/logout').catch((error) => {
        console.error('Backend logout failed:', error);
      });
    } catch (error) {
      console.error('Backend logout failed:', error);
    }
  };

  // For handling credential response from Google One Tap
  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    setLoading(true);
    try {
      console.log('Google One Tap login successful');
      
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
      console.error('Google credential login failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const value: AuthContextType = useMemo(() => ({
    currentUser,
    loading,
    login,
    loginWithEmail,
    register,
    logout,
    handleGoogleSuccess,
    token,
    isAuthenticated: !!currentUser && !!token,
    setCurrentUser,
  }), [currentUser, loading, login, loginWithEmail, register, logout, handleGoogleSuccess, token, setCurrentUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
