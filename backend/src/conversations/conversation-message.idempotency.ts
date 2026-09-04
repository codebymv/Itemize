import { createHash } from 'node:crypto';
import type { SendMessageValues } from './conversations.repository';
import { conversationCreationKey } from './conversation-creation.idempotency';

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

export const conversationMessageFingerprint = (
  conversationId: number,
  values: SendMessageValues,
): string => createHash('sha256')
  .update(JSON.stringify(canonicalize({ conversationId, ...values })))
  .digest('hex');

export const conversationMessageKey = conversationCreationKey;
