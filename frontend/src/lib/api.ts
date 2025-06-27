import axios from 'axios';

// Create a list of blocked endpoint patterns that shouldn't be called
const BLOCKED_ENDPOINTS = [
  '/api/credits/recent-expirations',
  '/api/subscription/tier-info'
];

// Determine API URL with better fallback logic
const determineApiUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_URL;
  const isProd = import.meta.env.PROD;
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  
  console.log('API Configuration:', {
    configuredUrl,
    isProd,
    currentOrigin,
    mode: import.meta.env.MODE
  });

  // In production, if no URL is configured, try to use the same origin
  if (isProd && !configuredUrl && currentOrigin && !currentOrigin.includes('localhost')) {
    console.log('Using current origin as API URL:', currentOrigin);
    return currentOrigin;
  }

  // Use configured URL or fallback to localhost only in development
  const apiUrl = configuredUrl || (isProd ? currentOrigin : 'http://localhost:3001');
  console.log('Final API URL:', apiUrl);
  return apiUrl;
};

// Create axios instance with base URL
const api = axios.create({
  baseURL: determineApiUrl()
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
