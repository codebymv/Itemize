import axios, { AxiosHeaders } from 'axios';

// Create a list of blocked endpoint patterns that shouldn't be called
const BLOCKED_ENDPOINTS = [
  '/api/credits/recent-expirations',
  '/api/subscription/tier-info'
];

// Production URL for the backend
const PRODUCTION_URL = 'https://itemize-backend-production-92ad.up.railway.app';

// Create axios instance with dynamic baseURL
const api = axios.create({
  baseURL: 'http://localhost:3001', // Default to localhost
  withCredentials: true
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

    // Automatically inject authentication token if available
    const token = localStorage.getItem('itemize_token');
    if (token && !config.headers?.Authorization) {
      if (!config.headers) {
        config.headers = new AxiosHeaders();
      }
      config.headers.Authorization = `Bearer ${token}`;
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
      // Clear auth data on unauthorized - simple approach like Prototype2
      localStorage.removeItem('itemize_token');
      localStorage.removeItem('itemize_user');
      localStorage.removeItem('itemize_expiry');
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
