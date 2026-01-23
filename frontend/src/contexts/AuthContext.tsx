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

  // Initialize authentication state from localStorage (user data only, token is in httpOnly cookie)
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check for saved user data in localStorage (token is now in httpOnly cookie)
        const savedUser = localStorage.getItem('itemize_user');
        const expiryTime = localStorage.getItem('itemize_expiry');
        
        // If we have user data and not expired, restore auth state
        // The actual token is stored in httpOnly cookie and sent automatically
        if (savedUser && expiryTime && parseInt(expiryTime) > Date.now()) {
          try {
            const userData = JSON.parse(savedUser);
            setToken('httponly'); // Placeholder - actual token is in cookie
            setCurrentUser(userData);
          } catch (parseError) {
            // Clean up invalid data
            localStorage.removeItem('itemize_user');
            localStorage.removeItem('itemize_expiry');
          }
        } else {
          // Clean up expired data
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
          
          const { user: userData } = response.data;
          
          // Set expiry (7 days) - token is now stored in httpOnly cookie by backend
          const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000);
          
          // Store user data only (token is in httpOnly cookie, not accessible to JS)
          localStorage.setItem('itemize_user', JSON.stringify(userData));
          localStorage.setItem('itemize_expiry', expiryTime.toString());
          
          // Update state - token placeholder since actual token is in httpOnly cookie
          setToken('httponly');
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
    
    // Clear local storage (user data only, token is in httpOnly cookie)
    localStorage.removeItem('itemize_user');
    localStorage.removeItem('itemize_expiry');
    
    // Sign out from Google
    try {
      googleLogout();
    } catch (googleError) {
      console.error('Error signing out from Google:', googleError);
    }
    
    // Backend logout clears the httpOnly cookie
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

      const { user: userData } = response.data;
      
      // Set expiry (7 days) - token is now stored in httpOnly cookie by backend
      const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000);
      
      // Store user data only (token is in httpOnly cookie, not accessible to JS)
      localStorage.setItem('itemize_user', JSON.stringify(userData));
      localStorage.setItem('itemize_expiry', expiryTime.toString());
      
      // Update state - token placeholder since actual token is in httpOnly cookie
      setToken('httponly');
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