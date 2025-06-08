import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { useGoogleLogin, googleLogout, CredentialResponse } from '@react-oauth/google';
import api from '@/lib/api';
import axios from 'axios'; // Keep axios for Google API calls

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

  // Initialize authentication state
  useEffect(() => {
    const initializeAuth = () => {
      try {
        // Supabase handles session persistence, so no need to check localStorage here.
        // The Supabase client will automatically manage the session.
        // We might need to listen to Supabase's auth state changes to update React state.
        setToken(null); // Or get from Supabase session if needed immediately
        setCurrentUser(null);  // Or get from Supabase session if needed immediately
      } catch (error) {
        console.error('Error initializing auth:', error);
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
        
        const response = await api.post(`/api/auth/google-login`, {
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
        api.post(`/api/auth/logout`).catch((error) => {
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