import React, { createContext, useState, useContext, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import api, { markAuthenticatedSession, clearAuthenticatedSession, isLoggedOut, setLoggedOut, hasSessionHint } from '@/lib/api';
import { storage } from '@/lib/storage';
import axios from 'axios';
import { toast } from '@/components/ui/use-toast';
import logger from '@/lib/logger';
import {
  getCurrentUserViaGraphql,
  isAuthSessionGraphqlEnabled,
  loginViaGraphql,
  logoutViaGraphql,
} from '@/services/authGraphql';
import { GraphqlRequestError } from '@/services/graphqlClient';

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
  /** @deprecated Prefer useGoogleSignIn on login/register — kept for API compatibility */
  login: (redirectTo?: string) => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  establishSession: (userData: User) => void;
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

interface ApiErrorPayload {
  error?: string | {
    message?: string;
    code?: string;
  };
  message?: string;
  code?: string;
}

const getAuthErrorDetails = (payload: unknown, fallbackMessage: string): { message: string; code: string } => {
  if (payload && typeof payload === 'object') {
    const data = payload as ApiErrorPayload;

    if (typeof data.error === 'string') {
      return {
        message: data.error,
        code: data.code || 'UNKNOWN',
      };
    }

    if (data.error && typeof data.error === 'object') {
      return {
        message: data.error.message || fallbackMessage,
        code: data.error.code || data.code || 'UNKNOWN',
      };
    }

    if (typeof data.message === 'string') {
      return {
        message: data.message,
        code: data.code || 'UNKNOWN',
      };
    }
  }

  return {
    message: fallbackMessage,
    code: 'UNKNOWN',
  };
};

/** Public/marketing paths where guests must not trigger /api/auth/me or refresh. */
export const isPublicAuthSkipPath = (pathname: string): boolean => {
  const exact = [
    '/home',
    '/status',
    '/login',
    '/register',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
    '/auth/callback',
  ];
  if (exact.includes(pathname)) return true;
  if (pathname.startsWith('/help')) return true;
  if (pathname.startsWith('/shared/')) return true;
  if (pathname.startsWith('/legal/')) return true;
  return false;
};

const normalizeUser = (data: Record<string, unknown>): User | null => {
  const uid = (data.id || data.uid) as string | undefined;
  if (!uid) return null;
  return {
    uid,
    name: (data.name as string) || '',
    email: (data.email as string) || '',
    photoURL: data.photoURL as string | undefined,
    role: data.role as User['role'],
  };
};

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
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // Helper to save user data after successful auth (cookies handle the token)
  const establishSession = useCallback((userData: User) => {
    const normalized =
      normalizeUser(userData as unknown as Record<string, unknown>) || userData;
    const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000);

    storage.setJson('itemize_user', normalized as unknown as Record<string, unknown>);
    storage.setItem('itemize_expiry', expiryTime.toString());
    markAuthenticatedSession();
    setLoggedOut(false);

    setToken(null);
    setCurrentUser(normalized);
  }, []);

  // Initialize authentication — skip network probes for guests / public marketing
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        if (isLoggedOut()) {
          setToken(null);
          setCurrentUser(null);
          setLoading(false);
          return;
        }

        const sessionHint = hasSessionHint();
        const onPublic = isPublicAuthSkipPath(location.pathname);
        const allowHintlessDevProbe =
          import.meta.env.DEV &&
          import.meta.env.VITE_DEV_AUTH_PROBE_WITHOUT_HINT === 'true';

        // Guests: never call /api/auth/me (avoids 401 → /refresh Best Practices noise)
        if (!sessionHint && !allowHintlessDevProbe) {
          setToken(null);
          setCurrentUser(null);
          setLoading(false);
          return;
        }

        // Returning visitors on marketing/public: hydrate from cache, skip probe
        if (onPublic) {
          const cached = storage.getJson<Record<string, unknown>>('itemize_user');
          if (cached) {
            const user = normalizeUser(cached);
            if (user) {
              setCurrentUser(user);
              setToken(null);
            }
          }
          setLoading(false);
          return;
        }

        const responseData = isAuthSessionGraphqlEnabled()
          ? await getCurrentUserViaGraphql()
          : (await api.get('/api/auth/me')).data;

        if (responseData && (responseData.id || responseData.uid)) {
          const user = normalizeUser(responseData as unknown as Record<string, unknown>);
          if (user) {
            setCurrentUser(user);
            markAuthenticatedSession();
            setToken(null);
          } else {
            throw new Error('Invalid user data received');
          }
        } else {
          throw new Error('Invalid user data received');
        }
      } catch (error) {
        clearAuthenticatedSession();
        storage.removeItem('itemize_user');
        storage.removeItem('itemize_expiry');
        setCurrentUser(null);
        setToken(null);

        if (axios.isAxiosError(error) && error.response?.status === 401) {
          logger.debug('Not authenticated (user not logged in)');
        } else {
          console.error('Auth Error:', error);
          logger.debug('Not authenticated (user not logged in)');
        }
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, [location.pathname]);

  /**
   * Deprecated stub — Google sign-in lives in useGoogleSignIn (login/register only).
   */
  const login = useCallback((redirectTo?: string) => {
    logger.warn('login() via AuthContext is deprecated; use useGoogleSignIn on /login or /register', redirectTo);
    window.location.assign(redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login');
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string): Promise<void> => {
    try {
      if (isAuthSessionGraphqlEnabled()) {
        const response = await loginViaGraphql(email, password);
        establishSession(response.user);
        return;
      }
      const response = await api.post('/api/auth/login', { email, password });

      if (response.data.success || response.data.user) {
        const userData = response.data.user;
        establishSession(userData);
      } else {
        const { message, code } = getAuthErrorDetails(response.data, 'Login failed');
        throw new AuthError(message, code);
      }
    } catch (error) {
      if (
        error instanceof GraphqlRequestError ||
        (error instanceof Error && error.name === 'GraphqlRequestError')
      ) {
        const graphqlError = error as GraphqlRequestError;
        throw new AuthError(
          graphqlError.message,
          graphqlError.reason || graphqlError.code || 'UNKNOWN',
        );
      }
      if (axios.isAxiosError(error) && error.response?.data) {
        const { message, code } = getAuthErrorDetails(error.response.data, 'Login failed');
        throw new AuthError(message, code);
      }
      throw error;
    }
  }, [establishSession]);

  const register = useCallback(async (email: string, password: string, name?: string): Promise<void> => {
    try {
      // Axios rejects non-2xx responses. Successful response envelopes are
      // unwrapped by the shared interceptor, so a 201 resolves with `{ email }`
      // rather than the original `{ success, data }` object.
      await api.post('/api/auth/register', { email, password, name });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        const { message, code } = getAuthErrorDetails(error.response.data, 'Registration failed');
        throw new AuthError(message, code);
      }
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setCurrentUser(null);

    clearAuthenticatedSession();
    storage.removeItem('itemize_user');
    storage.removeItem('itemize_expiry');
    setLoggedOut(true);

    // Best-effort Google sign-out without requiring GSI on this route
    void import('@react-oauth/google')
      .then(({ googleLogout }) => {
        try {
          googleLogout();
        } catch (googleError) {
          logger.error('Error signing out from Google:', googleError);
        }
      })
      .catch(() => {
        /* GSI not loaded — fine on marketing routes */
      });

    try {
      const request = isAuthSessionGraphqlEnabled()
        ? logoutViaGraphql()
        : api.post('/api/auth/logout');
      request.catch((error) => {
        logger.error('Backend logout failed:', error);
      });
    } catch (error) {
      logger.error('Backend logout failed:', error);
    }
  }, []);

  const stateValue = useMemo<AuthStateContextType>(() => ({
    currentUser,
    loading,
    token,
    isAuthenticated: !!currentUser,
  }), [currentUser, loading, token]);

  const actionsValue = useMemo<AuthActionsContextType>(() => ({
    login,
    loginWithEmail,
    register,
    logout,
    establishSession,
    setCurrentUser,
  }), [login, loginWithEmail, register, logout, establishSession, setCurrentUser]);

  return (
    <AuthStateContext.Provider value={stateValue}>
      <AuthActionsContext.Provider value={actionsValue}>
        {children}
      </AuthActionsContext.Provider>
    </AuthStateContext.Provider>
  );
};
