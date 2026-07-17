import { describe, it, expect } from 'vitest';
import { getApiErrorMessage, getUserFriendlyError, getErrorTitle, getErrorMessage } from './error-messages';
import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosResponse } from 'axios';

const mockResponse = (status: number, data: unknown = {}): AxiosResponse => ({
  status,
  data,
  statusText: '',
  headers: {},
  config: { headers: new AxiosHeaders() },
});

describe('getUserFriendlyError', () => {
  it('should handle non-Axios errors', () => {
    const error = new Error('Something went wrong');
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Unexpected Error');
    expect(result.type).toBe('unknown');
  });

  it('should handle network errors (ECONNREFUSED)', () => {
    const error = new AxiosError('Connection refused');
    error.code = 'ECONNREFUSED';
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Cannot Connect');
    expect(result.type).toBe('network');
    expect(result.action).toBe('Check your internet connection');
  });

  it('should handle timeout errors', () => {
    const error = new AxiosError('Timeout');
    error.code = 'ETIMEDOUT';
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Connection Timeout');
    expect(result.type).toBe('timeout');
  });

  it('should handle 401 errors', () => {
    const error = new AxiosError('Unauthorized');
    error.response = mockResponse(401);
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Session Expired');
    expect(result.type).toBe('client');
    expect(result.action).toBe('Log in to continue');
  });

  it('should handle 403 errors', () => {
    const error = new AxiosError('Forbidden');
    error.response = mockResponse(403);
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Access Denied');
    expect(result.type).toBe('client');
    expect(result.action).toBe('Contact your administrator');
  });

  it('should handle 404 errors', () => {
    const error = new AxiosError('Not Found');
    error.response = mockResponse(404);
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Not Found');
    expect(result.type).toBe('client');
  });

  it('should handle 429 errors', () => {
    const error = new AxiosError('Too Many Requests');
    error.response = mockResponse(429);
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Too Many Requests');
    expect(result.type).toBe('client');
    expect(result.action).toBe('Wait a moment, then try again');
  });

  it('should handle 500 errors', () => {
    const error = new AxiosError('Server Error');
    error.response = mockResponse(500);
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Server Error');
    expect(result.type).toBe('server');
    expect(result.action).toBe('Please try again later');
  });

  it('should prefer server-provided error messages', () => {
    const error = new AxiosError('Custom Error');
    error.response = mockResponse(400, { message: 'This is a server-provided message' });
    const result = getUserFriendlyError(error);

    expect(result.message).toBe('This is a server-provided message');
  });

  it('should handle generic 4xx errors', () => {
    const error = new AxiosError('Bad Request');
    error.response = mockResponse(400);
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Request Failed');
    expect(result.type).toBe('client');
  });
});

describe('getErrorTitle', () => {
  it('should return error title', () => {
    const error = {
      title: 'Test Error',
      message: 'Test Message',
      type: 'network' as const
    };

    expect(getErrorTitle(error)).toBe('Test Error');
  });
});

describe('getErrorMessage', () => {
  it('should return error message', () => {
    const error = {
      title: 'Test Error',
      message: 'Test Message',
      type: 'network' as const
    };

    expect(getErrorMessage(error)).toBe('Test Message');
  });
});

describe('getApiErrorMessage', () => {
  it('extracts a nested structured API error as a string', () => {
    const error = {
      response: {
        data: {
          error: {
            message: 'A contact identifier is required',
            code: 'BAD_USER_INPUT',
            details: { field: 'email' },
          },
        },
      },
    };

    expect(getApiErrorMessage(error, 'Failed to create contact'))
      .toBe('A contact identifier is required');
  });

  it('uses the intercepted friendly message before a generic Error message', () => {
    const error = Object.assign(new Error('Request failed with status code 400'), {
      userFriendlyError: { message: 'Please check the submitted contact details.' },
    });

    expect(getApiErrorMessage(error, 'Failed to create contact'))
      .toBe('Please check the submitted contact details.');
  });

  it('always falls back to a string for unknown values', () => {
    expect(getApiErrorMessage({ response: { data: { error: { code: 'UNKNOWN' } } } }, 'Try again'))
      .toBe('Try again');
  });
});
