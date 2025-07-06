import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { useGoogleLogin, googleLogout, CredentialResponse } from '@react-oauth/google';
import api, { getApiUrl } from '@/lib/api';
import axios from 'axios'; // Keep axios for Google API calls
import { toast } from '@/components/ui/use-toast'; // Import toast

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
  token: string | null; // Expose the token to consumers
  isAuthenticated: boolean; // Add isAuthenticated flag
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

  // Initialize authentication state - simplified like Prototype2
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check for saved authentication data in localStorage
        const savedToken = localStorage.getItem('itemize_token');
        const savedUser = localStorage.getItem('itemize_user');
        const expiryTime = localStorage.getItem('itemize_expiry');
        
        // Simple check like Prototype2 - if we have token, user, and not expired, restore auth
        if (savedToken && savedUser && expiryTime && parseInt(expiryTime) > Date.now()) {
          try {
            const userData = JSON.parse(savedUser);
            setToken(savedToken);
            setCurrentUser(userData);
          } catch (parseError) {
            // Clean up invalid data
            localStorage.removeItem('itemize_token');
            localStorage.removeItem('itemize_user');
            localStorage.removeItem('itemize_expiry');
          }
        }
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
          });

          console.log('Backend auth response:', response.data);
          
          const { token: backendToken, user: userData } = response.data;
          
          // Set token expiry (7 days)
          const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000);
          
          // Store auth data
          localStorage.setItem('itemize_token', backendToken);
          localStorage.setItem('itemize_user', JSON.stringify(userData));
          localStorage.setItem('itemize_expiry', expiryTime.toString());
          
          // Update state
          setToken(backendToken);
          setCurrentUser(userData);
          
          toast({
            title: 'Welcome!',
            description: 'Successfully signed in with Google.',
          });
        } catch (backendError) {
          console.error('Backend auth error:', backendError);
          throw new Error(`Backend authentication failed: ${backendError.message}`);
        }
        
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
    scope: 'email profile'
  });

  const login = () => {
    googleLogin();
  };

  const logout = () => {
    // Clear state
    setToken(null);
    setCurrentUser(null);
    
    // Clear local storage
    localStorage.removeItem('itemize_token');
    localStorage.removeItem('itemize_user');
    localStorage.removeItem('itemize_expiry');
    
    // Sign out from Google
    try {
      googleLogout();
    } catch (googleError) {
      console.error('Error signing out from Google:', googleError);
    }
    
    // Optional backend logout - simple approach like Prototype2
    try {
      api.post(`/api/auth/logout`).catch((error) => {
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
      });

      const { token: backendToken, user: userData } = response.data;
      
      // Set token expiry (7 days)
      const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000);
      
      // Store auth data
      localStorage.setItem('itemize_token', backendToken);
      localStorage.setItem('itemize_user', JSON.stringify(userData));
      localStorage.setItem('itemize_expiry', expiryTime.toString());
      
      // Update state
      setToken(backendToken);
      setCurrentUser(userData);
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

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    logout,
    handleGoogleSuccess,
    token,
    isAuthenticated: !!currentUser && !!token
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};