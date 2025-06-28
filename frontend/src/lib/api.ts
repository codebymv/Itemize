import axios from 'axios';

// Create a list of blocked endpoint patterns that shouldn't be called
const BLOCKED_ENDPOINTS = [
  '/api/credits/recent-expirations',
  '/api/subscription/tier-info'
];

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
