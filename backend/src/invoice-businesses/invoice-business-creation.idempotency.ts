import { createHash } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';
import type { InvoiceBusinessValues } from './invoice-businesses.repository';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const invoiceBusinessCreationFingerprint = (
  values: InvoiceBusinessValues,
): string => createHash('sha256')
  .update(JSON.stringify({
    address: values.address,
    email: values.email,
    name: values.name,
    phone: values.phone,
    taxId: values.taxId,
  }))
  .digest('hex');

export const invoiceBusinessCreationKey = (value: string): string => {
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
