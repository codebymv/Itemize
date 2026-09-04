import { createHash } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';
import type { CategoryValues } from './categories.repository';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const categoryCreationFingerprint = (values: CategoryValues): string =>
  createHash('sha256')
    .update(JSON.stringify({
      colorValue: values.colorValue,
      name: values.name,
    }))
    .digest('hex');

export const categoryCreationKey = (value: string): string => {
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
