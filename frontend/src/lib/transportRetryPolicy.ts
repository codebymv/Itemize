import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

declare module 'axios' {
  export interface AxiosRequestConfig<D = unknown> {
    /**
     * Opts a write into retrying a request that received no HTTP response.
     * Set this only when the server durably deduplicates the repeated request.
     */
    retryOnNetworkError?: boolean;
    /** Retry an explicitly rejected write after a 429 response. */
    retryOn429?: boolean;
    /** Send an anonymous capability request without auth cookies or CSRF. */
    publicRequest?: boolean;
  }
}

export interface RetryConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Classifies transport retries without guessing that an HTTP write is safe.
 *
 * Network failures are ambiguous: a server may have committed the write before
 * the response was lost. Only safe reads or mutations with an explicit durable
 * replay contract may repeat automatically.
 */
export const shouldRetryTransport = (
  error: AxiosError,
  config: RetryConfig,
  maxRetries = 3,
): boolean => {
  if ((config.__retryCount ?? 0) >= maxRetries || axios.isCancel(error)) {
    return false;
  }

  const method = config.method?.toUpperCase() ?? 'GET';
  const safeMethod = SAFE_METHODS.has(method);
  if (!error.response) {
    return safeMethod || config.retryOnNetworkError === true;
  }
  if (!safeMethod) {
    return config.retryOn429 === true && error.response.status === 429;
  }
  return RETRYABLE_STATUS_CODES.has(error.response.status);
};
