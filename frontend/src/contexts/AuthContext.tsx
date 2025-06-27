import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { useGoogleLogin, googleLogout, CredentialResponse } from '@react-oauth/google';
import api from '@/lib/api';
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
  const [lastAuthenticated, setLastAuthenticated] = useState<number>(0);
  const backendLogoutFailures = useRef(0);

  // Initialize authentication state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('Starting authentication initialization');
        // Check for saved authentication data in localStorage
        const savedToken = localStorage.getItem('itemize_token');
        const savedUser = localStorage.getItem('itemize_user');
        const expiryTime = localStorage.getItem('itemize_expiry');
        
        console.log('Auth data from storage:', { 
          hasToken: !!savedToken, 
          hasUser: !!savedUser, 
          hasExpiry: !!expiryTime 
        });
        
        // Safely check localStorage values
        if (savedToken && 
            typeof savedToken === 'string' && 
            savedUser && 
            typeof savedUser === 'string' && 
            savedUser !== 'undefined' && 
            expiryTime && 
            !isNaN(parseInt(expiryTime)) && 
            parseInt(expiryTime) > Date.now()) {
          
          try {
            const userData = JSON.parse(savedUser);
            
            // Validate user data has the expected structure
            if (userData && typeof userData === 'object' && userData.uid) {
              console.log('Restoring authentication with user:', userData);
              setToken(savedToken);
              setCurrentUser(userData);
              setLastAuthenticated(Date.now());
              console.log('Authentication restored successfully');
            } else {
              console.error('Invalid user data structure:', userData);
              throw new Error('Invalid user data structure');
            }
          } catch (parseError) {
            console.error('Failed to parse saved user data:', parseError);
            // Clean up invalid data
            localStorage.removeItem('itemize_token');
            localStorage.removeItem('itemize_user');
            localStorage.removeItem('itemize_expiry');
            setToken(null);
            setCurrentUser(null);
          }
        } else {
          // Clear any invalid or expired data
          console.log('No valid authentication found, cleaning up storage');
          localStorage.removeItem('itemize_token');
          localStorage.removeItem('itemize_user');
          localStorage.removeItem('itemize_expiry');
          setToken(null);
          setCurrentUser(null);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        // Reset state on error
        setToken(null);
        setCurrentUser(null);
      } finally {
        console.log('Authentication initialization complete');
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
        const apiUrl = import.meta.env.VITE_API_URL || (
          import.meta.env.MODE === 'production' 
            ? 'https://itemize.cloud' 
            : 'http://localhost:3001'
        );
        console.log('Sending user info to backend:', `${apiUrl}/api/auth/google-login`);
        
        // Make API request with proper data
        try {
          const response = await axios.post(`${apiUrl}/api/auth/google-login`, {
            googleId: googleUser.sub,  // Ensure we send the correct Google ID
            email: googleUser.email,
            name: googleUser.name,
            picture: googleUser.picture
          });

          console.log('Backend auth response:', response.data);
          
          // Extract data from response with proper error checking
          if (!response.data) {
            throw new Error('Empty response data from backend');
          }
          
          const backendToken = response.data.token;
          const userData = response.data.user;
          
          if (!backendToken) {
            throw new Error('Missing token in backend response');
          }
          
          if (!userData || !userData.uid) {
            throw new Error('Missing or invalid user data in backend response');
          }
          
          // Set token expiry (7 days)
          const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000);
          
          // Store auth data
          localStorage.setItem('itemize_token', backendToken);
          localStorage.setItem('itemize_user', JSON.stringify(userData));
          localStorage.setItem('itemize_expiry', expiryTime.toString());
          
          // Update state
          console.log('Setting authentication state with:', { token: backendToken, user: userData });
          setToken(backendToken);
          setCurrentUser(userData);
          
          // Force a re-render by setting a timestamp
          setLastAuthenticated(Date.now());
          
          console.log('Backend auth successful, state updated');
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
    scope: 'email profile',
    ux_mode: 'popup'
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
    localStorage.removeItem('itemize_user');
    localStorage.removeItem('itemize_expiry');
    
    // Sign out from Google
    try {
      googleLogout();
    } catch (googleError) {
      console.error('Error signing out from Google:', googleError);
    }
    
    // Call backend logout if needed
    if (backendLogoutFailures.current < 3) {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || (
          import.meta.env.MODE === 'production' 
            ? 'https://itemize.cloud' 
            : 'http://localhost:3001'
        );
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
      const apiUrl = import.meta.env.VITE_API_URL || (
        import.meta.env.MODE === 'production' 
          ? 'https://itemize.cloud' 
          : 'http://localhost:3001'
      );
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
      console.log('Setting authentication state with:', { token: backendToken, user: userData });
      setToken(backendToken);
      setCurrentUser(userData);
      setLastAuthenticated(Date.now());
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

  // Add extra logging for debugging
  useEffect(() => {
    console.log('Auth context changed:', { 
      isAuthenticated: !!currentUser && !!token,
      hasUser: !!currentUser,
      hasToken: !!token,
      lastAuthenticated,
      userData: currentUser
    });
  }, [currentUser, token, lastAuthenticated]);

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