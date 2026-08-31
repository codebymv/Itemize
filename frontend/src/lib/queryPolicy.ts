export const QUERY_STALE_TIME_MS = 5 * 60 * 1000;
export const QUERY_GC_TIME_MS = 10 * 60 * 1000;

type StatusBearingError = {
  code?: string;
  status?: number;
  response?: { status?: number };
};

const PERMANENT_GRAPHQL_CODES = new Set([
  'BAD_USER_INPUT',
  'FORBIDDEN',
  'NOT_FOUND',
  'UNAUTHENTICATED',
]);

export function getRequestStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as StatusBearingError;
  return candidate.status ?? candidate.response?.status;
}

/**
 * Retry transient reads only. GraphQL transport errors expose `status` directly,
 * while Axios errors expose it under `response.status`.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const code = error && typeof error === 'object'
    ? (error as StatusBearingError).code
    : undefined;
  if (code && PERMANENT_GRAPHQL_CODES.has(code)) return false;
  const status = getRequestStatus(error);
  if (status !== undefined && status >= 400 && status < 500) {
    // A 429 is manual-retry-only until the transport preserves Retry-After.
    return status === 408 && failureCount < 2;
  }
  return failureCount < 2;
}

export function visibleRefetchInterval(intervalMs: number): number | false {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'visible' ? intervalMs : false;
}
