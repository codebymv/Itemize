import axios, { AxiosHeaders, AxiosError, InternalAxiosRequestConfig } from 'axios';

// Create a list of blocked endpoint patterns that shouldn't be called
const BLOCKED_ENDPOINTS = [
  '/api/credits/recent-expirations',
  '/api/subscription/tier-info'
];

// Production URL for the backend
const PRODUCTION_URL = 'https://itemize-backend-production-92ad.up.railway.app';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// HTTP status codes that should trigger a retry
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

// Extend axios config to track retry count
interface RetryConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
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
    return false;
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
  baseURL: 'http://localhost:3001', // Default to localhost
  withCredentials: true,
  timeout: 30000, // 30 second timeout
});

// Add a request interceptor to handle dynamic baseURL, blocked endpoints, and authentication
api.interceptors.request.use(
  (config) => {
    // Update baseURL based on current hostname
    const isProductionDomain = window.location.hostname === 'itemize.cloud';
    config.baseURL = isProductionDomain ? PRODUCTION_URL : 'http://localhost:3001';

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

    // Authentication is now handled via httpOnly cookies
    // which are automatically sent with `withCredentials: true`
    // No need to manually inject Authorization header

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor for error handling and retry logic
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    
    // Handle 401 unauthorized
    if (error.response?.status === 401) {
      // Clear user data on unauthorized (token is in httpOnly cookie, cleared by backend)
      localStorage.removeItem('itemize_user');
      localStorage.removeItem('itemize_expiry');
      return Promise.reject(error);
    }

    // Handle retry logic
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
  const isProductionDomain = window.location.hostname === 'itemize.cloud';
  return isProductionDomain ? PRODUCTION_URL : 'http://localhost:3001';
};

export default api;
