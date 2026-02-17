import { AxiosError } from 'axios';

export type ErrorType = 'network' | 'timeout' | 'server' | 'client' | 'unknown';

export interface UserError {
  title: string;
  message: string;
  type: ErrorType;
  action?: string;
  /** For plan-limit 403: link to upgrade (e.g. /payment-settings) */
  upgradeUrl?: string;
}

export function getUserFriendlyError(error: unknown): UserError {
  if (!(error instanceof AxiosError)) {
    return {
      title: 'Unexpected Error',
      message: 'Something unexpected happened. Please try again.',
      type: 'unknown',
    };
  }

  // Network errors
  if (error.code === 'ECONNREFUSED') {
    return {
      title: 'Cannot Connect',
      message: 'We cannot reach the server. Please check your internet connection and try again.',
      type: 'network',
      action: 'Check your internet connection',
    };
  }

  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
    return {
      title: 'Connection Timeout',
      message: 'The connection took too long. Please try again.',
      type: 'timeout',
      action: 'Refresh the page and try again',
    };
  }

  // HTTP errors
  if (error.response) {
    const status = error.response.status;
    const responseData = error.response.data as any;

    // Server returned user-friendly message
    if (responseData?.message) {
      return {
        title: status === 500 ? 'Server Error' : 'Error',
        message: responseData.message,
        type: status === 500 ? 'server' : 'client',
        action: status === 401 ? 'Please log in again' : undefined,
      };
    }

    // 401 Unauthorized
    if (status === 401) {
      return {
        title: 'Session Expired',
        message: 'Your session has expired. Please log in again.',
        type: 'client',
        action: 'Log in to continue',
      };
    }

    // 403 Forbidden
    if (status === 403) {
      const code = responseData?.code || responseData?.error?.code;
      const isPlanLimit = code === 'PLAN_LIMIT_REACHED' || code === 'PLAN_LIMIT';
      if (isPlanLimit) {
        return {
          title: 'Plan limit reached',
          message: typeof responseData?.error === 'string' ? responseData.error : "You've reached the limit for your current plan. Upgrade to add more.",
          type: 'client',
          action: 'Upgrade your plan',
          upgradeUrl: '/payment-settings',
        };
      }
      return {
        title: 'Access Denied',
        message: 'You do not have permission to access this resource.',
        type: 'client',
        action: 'Contact your administrator',
      };
    }

    // 404 Not Found
    if (status === 404) {
      return {
        title: 'Not Found',
        message: 'The resource you requested could not be found.',
        type: 'client',
        action: 'Check the URL and try again',
      };
    }

    // 429 Too Many Requests
    if (status === 429) {
      const details = responseData?.error?.details || responseData?.details;
      const remaining = details?.remaining;
      const message =
        typeof remaining === 'number'
          ? `You're making too many requests. You can try again in a few minutes. ${remaining} remaining this period.`
          : 'You are making too many requests. Please wait a moment and try again.';
      return {
        title: 'Too Many Requests',
        message,
        type: 'client',
        action: 'Wait a moment, then try again',
      };
    }

    // 500 Server Error
    if (status >= 500) {
      return {
        title: 'Server Error',
        message: 'Something went wrong on our end. We\'re working to fix it.',
        type: 'server',
        action: 'Please try again later',
      };
    }

    // 4xx Client errors
    if (status >= 400) {
      return {
        title: 'Request Failed',
        message: 'Something went wrong with your request. Please try again.',
        type: 'client',
      };
    }
  }

  // Generic fallback
  return {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again.',
    type: 'unknown',
  };
}

export function getErrorTitle(error: UserError): string {
  return error.title;
}

export function getErrorMessage(error: UserError): string {
  return error.message;
}