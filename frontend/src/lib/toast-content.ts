import { isValidElement, type ReactNode } from 'react';

const FALLBACK_TOAST_MESSAGE = 'Something went wrong. Please try again.';

export function normalizeToastContent(value: unknown): ReactNode {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    isValidElement(value)
  ) {
    return value as ReactNode;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeToastContent);
  }

  if (typeof value === 'object') {
    const payload = value as Record<string, unknown>;
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message;
    }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
    if (payload.error && typeof payload.error === 'object') {
      return normalizeToastContent(payload.error);
    }
  }

  return FALLBACK_TOAST_MESSAGE;
}
