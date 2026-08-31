import { describe, expect, it, vi } from 'vitest';
import {
  getRequestStatus,
  shouldRetryQuery,
  visibleRefetchInterval,
} from './queryPolicy';

describe('query policy', () => {
  it('recognizes both GraphQL and Axios status shapes', () => {
    expect(getRequestStatus({ status: 409 })).toBe(409);
    expect(getRequestStatus({ response: { status: 503 } })).toBe(503);
  });

  it('does not multiply permanent client failures', () => {
    expect(shouldRetryQuery(0, { status: 400 })).toBe(false);
    expect(shouldRetryQuery(0, { response: { status: 404 } })).toBe(false);
    expect(shouldRetryQuery(0, { status: 429 })).toBe(false);
    expect(shouldRetryQuery(2, { status: 429 })).toBe(false);
    expect(shouldRetryQuery(0, { status: 200, code: 'NOT_FOUND' })).toBe(false);
    expect(shouldRetryQuery(0, { status: 200, code: 'BAD_USER_INPUT' })).toBe(false);
  });

  it('caps transient retries at two retries', () => {
    expect(shouldRetryQuery(0, new TypeError('network'))).toBe(true);
    expect(shouldRetryQuery(1, { status: 503 })).toBe(true);
    expect(shouldRetryQuery(2, { status: 503 })).toBe(false);
  });

  it('pauses polling while the document is hidden', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    expect(visibleRefetchInterval(60_000)).toBe(false);
    vi.restoreAllMocks();
  });
});
