import axios, { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import {
  type RetryConfig,
  shouldRetryTransport,
} from './transportRetryPolicy';

const config = (
  method: string,
  overrides: Partial<RetryConfig> = {},
): RetryConfig => ({
  headers: new AxiosHeaders(),
  method,
  ...overrides,
});

const failure = (status?: number): AxiosError => new AxiosError(
  'transport failed',
  undefined,
  undefined,
  undefined,
  status === undefined
    ? undefined
    : {
        config: config('get'),
        data: null,
        headers: {},
        status,
        statusText: String(status),
      },
);

describe('transport retry policy', () => {
  it('retries ambiguous failures for safe reads', () => {
    expect(shouldRetryTransport(failure(), config('get'))).toBe(true);
    expect(shouldRetryTransport(failure(), config('head'))).toBe(true);
  });

  it('does not replay writes after an ambiguous failure by default', () => {
    expect(shouldRetryTransport(failure(), config('post'))).toBe(false);
    expect(shouldRetryTransport(failure(), config('put'))).toBe(false);
    expect(shouldRetryTransport(failure(), config('patch'))).toBe(false);
    expect(shouldRetryTransport(failure(), config('delete'))).toBe(false);
  });

  it('allows an explicitly replay-safe write to retry a network failure', () => {
    expect(shouldRetryTransport(
      failure(),
      config('post', { retryOnNetworkError: true }),
    )).toBe(true);
  });

  it('keeps response retries safe and explicit', () => {
    expect(shouldRetryTransport(failure(503), config('get'))).toBe(true);
    expect(shouldRetryTransport(failure(503), config('post', {
      retryOnNetworkError: true,
    }))).toBe(false);
    expect(shouldRetryTransport(failure(429), config('post', {
      retryOn429: true,
    }))).toBe(true);
  });

  it('stops at the retry bound and never retries cancellation', () => {
    expect(shouldRetryTransport(
      failure(),
      config('get', { __retryCount: 3 }),
    )).toBe(false);
    expect(shouldRetryTransport(
      new axios.CanceledError(),
      config('get'),
    )).toBe(false);
  });
});
