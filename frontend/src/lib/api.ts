import axios from 'axios';

// Create a list of blocked endpoint patterns that shouldn't be called
const BLOCKED_ENDPOINTS = [
  '/api/credits/recent-expirations',
  '/api/subscription/tier-info'
];

// Debug environment and configuration
const debugConfig = {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  MODE: import.meta.env.MODE,
  PROD: import.meta.env.PROD,
  DEV: import.meta.env.DEV,
  origin: typeof window !== 'undefined' ? window.location.origin : 'no-window',
  hostname: typeof window !== 'undefined' ? window.location.hostname : 'no-window'
};

console.log('API Configuration Debug:', debugConfig);

// Determine the base URL based on environment and hostname
const getBaseUrl = () => {
  // If we're in a browser and on the production domain, use the current origin
  if (typeof window !== 'undefined' && window.location.hostname === 'itemize.cloud') {
    return window.location.origin;
  }
  
  // Otherwise use the environment variable or localhost fallback
  return import.meta.env.VITE_API_URL || 'http://localhost:3001';
};

// Create axios instance with base URL
const api = axios.create({
  baseURL: getBaseUrl(),
  withCredentials: true
});

// Add a request interceptor to block specific endpoints and add debugging
api.interceptors.request.use(
  (config) => {
    // Log request details
    console.log('API Request:', {
      url: config.url,
      baseURL: config.baseURL,
      fullUrl: `${config.baseURL}${config.url}`,
      method: config.method,
      headers: config.headers,
      withCredentials: config.withCredentials
    });

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
      console.log(`Blocked request to: ${requestPath}`);
    }

    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add a response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', {
      url: response.config.url,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
    return response;
  },
  (error) => {
    console.error('API Response Error:', {
      url: error.config?.url,
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    });
    return Promise.reject(error);
  }
);

export default api;
