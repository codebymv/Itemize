import axios from 'axios';

// Create a list of blocked endpoint patterns that shouldn't be called
const BLOCKED_ENDPOINTS = [
  '/api/credits/recent-expirations',
  '/api/subscription/tier-info'
];

// Log detailed environment configuration
console.log('Detailed API Configuration:', {
  MODE: import.meta.env.MODE,
  VITE_API_URL: import.meta.env.VITE_API_URL,
  isProd: import.meta.env.MODE === 'production',
  window_location: window.location.href,
  import_meta_env: import.meta.env
});

// Force production URL if we're on itemize.cloud domain
const isProductionDomain = window.location.hostname === 'itemize.cloud';

// Determine the base URL based on environment
const baseURL = isProductionDomain
  ? 'https://itemize-backend-production-92ad.up.railway.app'
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

// Log the selected base URL and decision factors
console.log('API URL Resolution:', {
  final_baseURL: baseURL,
  env_VITE_API_URL: import.meta.env.VITE_API_URL,
  env_MODE: import.meta.env.MODE,
  isProductionDomain,
  window_hostname: window.location.hostname
});

// Create axios instance with base URL
const api = axios.create({
  baseURL,
  withCredentials: true
});

// Add a request interceptor to block specific endpoints
api.interceptors.request.use(
  (config) => {
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

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth data on unauthorized
      localStorage.removeItem('itemize_token');
      localStorage.removeItem('itemize_user');
      localStorage.removeItem('itemize_expiry');
    }
    return Promise.reject(error);
  }
);

export const getApiUrl = () => baseURL;

export default api;
