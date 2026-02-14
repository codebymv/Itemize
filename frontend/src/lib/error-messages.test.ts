import { describe, it, expect } from 'vitest';
import { getUserFriendlyError, getErrorTitle, getErrorMessage } from './error-messages';
import { AxiosError } from 'axios';

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
    error.response = { status: 401, data: {} } as any;
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Session Expired');
    expect(result.type).toBe('client');
    expect(result.action).toBe('Log in to continue');
  });

  it('should handle 403 errors', () => {
    const error = new AxiosError('Forbidden');
    error.response = { status: 403, data: {} } as any;
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Access Denied');
    expect(result.type).toBe('client');
    expect(result.action).toBe('Contact your administrator');
  });

  it('should handle 404 errors', () => {
    const error = new AxiosError('Not Found');
    error.response = { status: 404, data: {} } as any;
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Not Found');
    expect(result.type).toBe('client');
  });

  it('should handle 429 errors', () => {
    const error = new AxiosError('Too Many Requests');
    error.response = { status: 429, data: {} } as any;
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Too Many Requests');
    expect(result.type).toBe('client');
    expect(result.action).toBe('Wait a moment, then try again');
  });

  it('should handle 500 errors', () => {
    const error = new AxiosError('Server Error');
    error.response = { status: 500, data: {} } as any;
    const result = getUserFriendlyError(error);

    expect(result.title).toBe('Server Error');
    expect(result.type).toBe('server');
    expect(result.action).toBe('Please try again later');
  });

  it('should prefer server-provided error messages', () => {
    const error = new AxiosError('Custom Error');
    error.response = {
      status: 400,
      data: { message: 'This is a server-provided message' }
    } as any;
    const result = getUserFriendlyError(error);

    expect(result.message).toBe('This is a server-provided message');
  });

  it('should handle generic 4xx errors', () => {
    const error = new AxiosError('Bad Request');
    error.response = { status: 400, data: {} } as any;
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