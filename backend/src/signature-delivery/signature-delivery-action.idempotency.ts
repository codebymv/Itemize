import { createHash } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';

export type SignatureDeliveryAction = 'send' | 'remind' | 'retry';

const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7E]{1,128}$/;

export const signatureDeliveryActionKey = (value: string): string => {
  const normalized = String(value ?? '').trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw itemizeGraphqlError(
      'idempotencyKey must be 1-128 safe ASCII characters',
      'BAD_USER_INPUT',
      { field: 'idempotencyKey', reason: 'INVALID_IDEMPOTENCY_KEY' },
    );
  }
  return normalized;
};

export const signatureDeliveryActionFingerprint = (
  action: SignatureDeliveryAction,
  documentId: number,
): string => createHash('sha256')
  .update(JSON.stringify({ action, documentId }))
  .digest('hex');
