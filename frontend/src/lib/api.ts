import axios, { AxiosHeaders, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getUserFriendlyError } from './error-messages';

// Create a list of blocked endpoint patterns that shouldn't be called
const BLOCKED_ENDPOINTS = [
  '/api/credits/recent-expirations',
  '/api/subscription/tier-info'
];

// Get API URL from environment variable or fall back to localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Production URL for the backend (override via env)
const PRODUCTION_URL = import.meta.env.VITE_PRODUCTION_API_URL || API_BASE_URL;
const PRODUCTION_DOMAIN = import.meta.env.VITE_PRODUCTION_DOMAIN;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// HTTP status codes that should trigger a retry
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

// Extend axios config to track retry count
export interface RetryConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
  retryOn429?: boolean;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
const getRetryDelay = (retryCount: number): number => {
  // Exponential backoff: 1s, 2s, 4s, etc.
  const exponentialDelay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
  // Add random jitter (0-500ms) to prevent thundering herd
  const jitter = Math.random() * 500;
  return exponentialDelay + jitter;
};

/**
 * Check if a request should be retried
 */
const shouldRetry = (error: AxiosError, config: RetryConfig): boolean => {
  // Don't retry if max retries reached
  const retryCount = config.__retryCount || 0;
  if (retryCount >= MAX_RETRIES) {
    return false;
  }

  // Don't retry cancelled requests
  if (axios.isCancel(error)) {
    return false;
  }

  // Don't retry non-idempotent requests (POST, PUT, DELETE) by default
  // unless they're explicitly marked as retryable or are specific safe endpoints
  const method = config.method?.toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  
  // Only retry idempotent requests or network errors
  if (!isIdempotent && error.response) {
    return config.retryOn429 === true && error.response.status === 429;
  }

  // Retry network errors (no response)
  if (!error.response) {
    return true;
  }

  // Retry specific status codes
  return RETRYABLE_STATUS_CODES.includes(error.response.status);
};

// Create axios instance with dynamic baseURL
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Still send cookies as fallback
  timeout: 30000, // 30 second timeout
});

// Token storage key (matching Gleam's approach)
const AUTH_TOKEN_KEY = 'itemize_auth_token';
const REFRESH_TOKEN_KEY = 'itemize_refresh_token';
const LOGGED_OUT_KEY = 'itemize_logged_out';

// Proactive session-expiring warning: fire 2 min before access token expiry
const SESSION_WARNING_BEFORE_EXPIRY_MS = 2 * 60 * 1000;
let sessionExpiringTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Decode JWT payload (no verification; we only need exp for client-side scheduling).
 * Returns { exp } (seconds since epoch) or null if invalid.
 */
function decodeJwtExp(token: string): { exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof decoded.exp !== 'number') return null;
    return { exp: decoded.exp };
  } catch {
    return null;
  }
}

function clearSessionExpiringTimer(): void {
  if (sessionExpiringTimeoutId !== null) {
    clearTimeout(sessionExpiringTimeoutId);
    sessionExpiringTimeoutId = null;
  }
}

function scheduleSessionExpiringWarning(token: string): void {
  clearSessionExpiringTimer();
  const decoded = decodeJwtExp(token);
  if (!decoded) return;
  const nowSec = Math.floor(Date.now() / 1000);
  const msUntilWarning = (decoded.exp - nowSec) * 1000 - SESSION_WARNING_BEFORE_EXPIRY_MS;
  if (msUntilWarning <= 0) return;
  sessionExpiringTimeoutId = setTimeout(() => {
    sessionExpiringTimeoutId = null;
    if (typeof window !== 'undefined' && !isLoggedOut()) {
      window.dispatchEvent(new CustomEvent('auth:session-expiring'));
    }
  }, msUntilWarning);
}

/**
 * Get the stored auth token
 */
export const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
};

export const getRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
};

export const isLoggedOut = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(LOGGED_OUT_KEY) === '1';
};

export const setLoggedOut = (loggedOut: boolean): void => {
  if (typeof window === 'undefined') return;
  if (loggedOut) {
    window.localStorage.setItem(LOGGED_OUT_KEY, '1');
  } else {
    window.localStorage.removeItem(LOGGED_OUT_KEY);
  }
};

/**
 * Set the auth token (called after login or refresh)
 */
export const setAuthToken = (token: string | null): void => {
  if (typeof window === 'undefined') return;
  if (!token) {
    clearSessionExpiringTimer();
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem('token_check');
    return;
  }
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  sessionStorage.setItem('token_check', 'token');
  scheduleSessionExpiringWarning(token);
};

export const setRefreshToken = (token: string | null): void => {
  if (typeof window === 'undefined') return;
  if (!token) {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
};

// Add a request interceptor to handle dynamic baseURL, blocked endpoints, and authentication
api.interceptors.request.use(
  (config) => {
    // Update baseURL based on current hostname
    const isProductionDomain = PRODUCTION_DOMAIN
      ? window.location.hostname === PRODUCTION_DOMAIN
      : false;
    config.baseURL = isProductionDomain ? PRODUCTION_URL : API_BASE_URL;

    // Check if the request URL matches any blocked endpoint
    const requestPath = config.url || '';
    const isBlocked = BLOCKED_ENDPOINTS.some(endpoint => 
      requestPath.includes(endpoint)
    );

    // If this is a blocked endpoint, cancel the request
    if (isBlocked) {
      const cancelToken = axios.CancelToken;
      const source = cancelToken.source();
      config.cancelToken = source.token;
      source.cancel(`Request to ${requestPath} was blocked by interceptor`);
    }

    // Attach Authorization header when available (fallback to cookies if not)
    const authToken = getAuthToken();
    if (authToken) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${authToken}`,
      };
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Track if we're currently refreshing to prevent multiple refresh calls
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

// Track token refresh attempts to prevent infinite loops
let refreshAttempts = 0;
const MAX_REFRESH_ATTEMPTS = 3;
const REFRESH_ATTEMPT_RESET_TIME = 60000; // 1 minute

// Reset refresh attempts counter periodically
setInterval(() => {
  refreshAttempts = 0;
}, REFRESH_ATTEMPT_RESET_TIME);

// Add a response interceptor for error handling and retry logic
api.interceptors.response.use(
  (response) => {
    const payload = response.data;
    if (payload && typeof payload === 'object' && 'data' in payload && 'success' in payload) {
      response.data = payload.data;
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    
    // Transform error to user-friendly message
    const userError = getUserFriendlyError(error);
    (error as any).userFriendlyError = userError;
    
    // Handle 401 unauthorized - attempt token refresh
    if (error.response?.status === 401 && config && !config.url?.includes('/auth/refresh') && !config.url?.includes('/auth/login')) {
      if (isLoggedOut()) {
        return Promise.reject(error);
      }
      // Prevent infinite refresh loops
      if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
        console.error('[Auth] Max refresh attempts reached, forcing logout');
        // Clear auth state and redirect
        setAuthToken(null);
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.removeItem('itemize_user');
          window.sessionStorage.removeItem('itemize_expiry');
        }
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login?session=expired';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(config)).catch(err => Promise.reject(err));
      }

      isRefreshing = true;
      refreshAttempts++;

      try {
        console.log('[Auth] Attempting token refresh...');
        
        // Attempt to refresh the token - withCredentials ensures cookies are sent
        const refreshToken = getRefreshToken();
        const refreshResponse = await axios.create({
          baseURL: config.baseURL,
          withCredentials: true,
          timeout: 10000,
        }).post('/api/auth/refresh', refreshToken ? { refreshToken } : undefined);
        
        // If refresh returns a new token, save it
        if (refreshResponse.data?.token) {
          console.log('[Auth] Token refreshed successfully');
          setAuthToken(refreshResponse.data.token);
          
          // Also update user data if provided
          if (refreshResponse.data?.user && typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.setItem('itemize_user', JSON.stringify(refreshResponse.data.user));
          }
          
          // Reset refresh attempts on success
          refreshAttempts = 0;
          processQueue(null);
          isRefreshing = false;
          
          // Dispatch custom event for other parts of app (like WebSocket)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:token-refreshed', {
              detail: { token: refreshResponse.data.token }
            }));
          }
          
          // Retry the original request with new token
          return api(config);
        } else {
          throw new Error('No token received from refresh endpoint');
        }
      } catch (refreshError: any) {
        console.error('[Auth] Token refresh failed:', refreshError.message);
        
        // Refresh failed - clear auth state
        processQueue(refreshError as Error);
        isRefreshing = false;
        
        // Clear all auth data
        setAuthToken(null);
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.removeItem('itemize_user');
          window.sessionStorage.removeItem('itemize_expiry');
        }
        
        // Show user-friendly message and redirect
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          // Dispatch event to show toast notification
          window.dispatchEvent(new CustomEvent('auth:session-expired'));
          
          // Redirect to login with session expired message
          setTimeout(() => {
            window.location.href = '/login?session=expired';
          }, 2000); // Give time for toast to show
        }
        
        return Promise.reject(error);
      }
    }

    // Handle retry logic for other errors
    if (config && shouldRetry(error, config)) {
      config.__retryCount = (config.__retryCount || 0) + 1;
      
      const delay = getRetryDelay(config.__retryCount - 1);
      
      // Log retry attempt in development
      if (import.meta.env.DEV) {
        console.log(
          `[API Retry] Attempt ${config.__retryCount}/${MAX_RETRIES} for ${config.method?.toUpperCase()} ${config.url} after ${Math.round(delay)}ms`
        );
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry the request
      return api(config);
    }

    return Promise.reject(error);
  }
);

// Export a function to get the current API URL
export const getApiUrl = () => {
  const isProductionDomain = PRODUCTION_DOMAIN
    ? window.location.hostname === PRODUCTION_DOMAIN
    : false;
  return isProductionDomain ? PRODUCTION_URL : API_BASE_URL;
};

/**
 * Resolve an asset URL (like logo_url) to a full URL.
 * Handles both relative paths (/uploads/...) and legacy absolute URLs.
 */
export const getAssetUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  
  // If it's already an absolute URL, check if it needs fixing for production
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // If it's a localhost URL and we're in production, fix it
    if (url.includes('localhost:') && PRODUCTION_DOMAIN && window.location.hostname === PRODUCTION_DOMAIN) {
      // Extract the path portion and prepend production URL
      const pathMatch = url.match(/\/uploads\/.*/);
      if (pathMatch) {
        return `${PRODUCTION_URL}${pathMatch[0]}`;
      }
    }
    return url;
  }
  
  // For relative paths, prepend the API base URL
  if (url.startsWith('/')) {
    return `${getApiUrl()}${url}`;
  }
  
  return url;
};

export default api;
