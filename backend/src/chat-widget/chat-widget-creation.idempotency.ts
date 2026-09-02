import { createHash } from 'node:crypto';
import type { ChatWidgetValues } from './chat-widget.repository';

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
};

export const chatWidgetCreationFingerprint = (
  values: ChatWidgetValues,
): string => createHash('sha256')
  .update(JSON.stringify(canonicalize({
    ...values,
    ...(values.allowedDomains === undefined
      ? {}
      : { allowedDomains: [...values.allowedDomains].sort() }),
  })))
  .digest('hex');
