import { createHash, createHmac } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

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

export const vaultPasswordIntentDigest = (password?: string): string | null =>
  password
    ? createHmac(
        'sha256',
        process.env.VAULT_ENCRYPTION_KEY
          ?? process.env.JWT_SECRET
          ?? 'development-secret',
      ).update(password).digest('hex')
    : null;

export const vaultCreationFingerprint = (intent: object): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(intent)))
    .digest('hex');

export const vaultCreationKey = (value: string): string => {
  const normalized = String(value ?? '').trim();
  if (!IDEMPOTENCY_KEY.test(normalized)) {
    throw itemizeGraphqlError(
      'idempotencyKey must be 1-128 safe ASCII characters',
      'BAD_USER_INPUT',
      { field: 'idempotencyKey', reason: 'INVALID_IDEMPOTENCY_KEY' },
    );
  }
  return normalized;
};
