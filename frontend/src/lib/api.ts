import axios from 'axios';

// Create a list of blocked endpoint patterns that shouldn't be called
const BLOCKED_ENDPOINTS = [
  '/api/credits/recent-expirations',
  '/api/subscription/tier-info'
];

// Create axios instance with base URL
const apiUrl = import.meta.env.VITE_API_URL || (
  import.meta.env.MODE === 'production' 
    ? 'https://itemize.cloud' // Use your production domain
    : 'http://localhost:3001'  // Use HTTP only in development
);
const api = axios.create({
  baseURL: apiUrl
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
      // Create a canceled request
      const cancelToken = axios.CancelToken;
      const source = cancelToken.source();
      config.cancelToken = source.token;
      source.cancel(`Request to ${requestPath} was blocked by interceptor`);
      
      console.log(`Blocked request to: ${requestPath}`);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
