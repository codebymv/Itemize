import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { useGoogleLogin, googleLogout, CredentialResponse } from '@react-oauth/google';
import axios from 'axios';

export interface User {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
}

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
  handleGoogleSuccess: (credentialResponse: CredentialResponse) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token expiration buffer (1 day)
const EXPIRATION_BUFFER = 24 * 60 * 60 * 1000;

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
  const backendLogoutFailures = useRef(0);

  // Initialize authentication state from localStorage
  useEffect(() => {
    const initializeAuth = () => {
      try {
        const savedToken = localStorage.getItem('itemize_token');
        const tokenExpiry = localStorage.getItem('itemize_token_expiry');
        const savedUser = localStorage.getItem('itemize_user');
        
        if (savedToken && tokenExpiry && savedUser) {
          const expiryTime = parseInt(tokenExpiry);
          if (Date.now() < expiryTime - EXPIRATION_BUFFER) {
            // Token is still valid
            setToken(savedToken);
            setCurrentUser(JSON.parse(savedUser));
          } else {
            // Token expired or close to expiry, clear auth data
            console.log('Token expired or close to expiry, clearing auth data');
            localStorage.removeItem('itemize_token');
            localStorage.removeItem('itemize_token_expiry');
            localStorage.removeItem('itemize_user');
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        // Clear potentially corrupt data
        localStorage.removeItem('itemize_token');
        localStorage.removeItem('itemize_token_expiry');
        localStorage.removeItem('itemize_user');
      } finally {
        setLoading(false);
      }
    };
    
    initializeAuth();
  }, []);

  // Use Google Login hook
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        console.log('Google login successful, getting user info');
        
        // Get user info from Google using the access token
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${tokenResponse.access_token}`,
          },
        });
        
        const googleUser = await userInfoResponse.json();
        console.log('Received user info from Google');
        
        // Send the Google user info to your backend
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        console.log('Sending user info to backend:', `${apiUrl}/api/auth/google-login`);
        
        const response = await axios.post(`${apiUrl}/api/auth/google-login`, {
          googleId: googleUser.id,
          email: googleUser.email,
          name: googleUser.name,
          picture: googleUser.picture
        });

        const { token: backendToken, user: userData } = response.data;
        
        console.log('Backend auth successful');
        
        // Set token expiry (7 days)
        const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000);
        
        // Store auth data
        localStorage.setItem('itemize_token', backendToken);
        localStorage.setItem('itemize_token_expiry', expiryTime.toString());
        localStorage.setItem('itemize_user', JSON.stringify(userData));
        
        // Update state
        setToken(backendToken);
        setCurrentUser(userData);
        
      } catch (error) {
        console.error('Google login failed:', error);
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      console.error('Google login failed');
      setLoading(false);
    },
  });

  const login = () => {
    googleLogin();
  };

  const logout = () => {
    console.log('Logging out user...');
    
    // Clear state
    setToken(null);
    setCurrentUser(null);
    
    // Clear local storage
    localStorage.removeItem('itemize_token');
    localStorage.removeItem('itemize_token_expiry');
    localStorage.removeItem('itemize_user');
    
    // Sign out from Google
    try {
      googleLogout();
    } catch (googleError) {
      console.error('Error signing out from Google:', googleError);
    }
    
    // Call backend logout if needed
    if (backendLogoutFailures.current < 3) {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        axios.post(`${apiUrl}/api/auth/logout`).catch((error) => {
          console.error('Backend logout failed:', error);
          backendLogoutFailures.current++;
        });
      } catch (error) {
        console.error('Backend logout failed:', error);
        backendLogoutFailures.current++;
      }
    }
  };

  // For handling credential response from Google One Tap
  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    setLoading(true);
    try {
      console.log('Google One Tap login successful');
      
      // Send the credential to your backend
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await axios.post(`${apiUrl}/api/auth/google-credential`, {
        credential: credentialResponse.credential
      });

      const { token: backendToken, user: userData } = response.data;
      
      // Set token expiry (7 days)
      const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000);
      
      // Store auth data
      localStorage.setItem('itemize_token', backendToken);
      localStorage.setItem('itemize_token_expiry', expiryTime.toString());
      localStorage.setItem('itemize_user', JSON.stringify(userData));
      
      // Update state
      setToken(backendToken);
      setCurrentUser(userData);
      
    } catch (error) {
      console.error('Google credential login failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    logout,
    handleGoogleSuccess
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};