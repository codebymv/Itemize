import { createHash } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';
import type {
  RecurringInvoiceCloneValues,
  RecurringInvoiceValues,
} from './recurring-invoices.repository';

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

const fingerprint = (intent: unknown): string => createHash('sha256')
  .update(JSON.stringify(canonicalize(intent)))
  .digest('hex');

export const recurringInvoiceCreationFingerprint = (
  values: RecurringInvoiceValues,
): string => fingerprint({ action: 'create', values });

export const recurringInvoiceCloneFingerprint = (
  invoiceId: number,
  values: RecurringInvoiceCloneValues,
): string => fingerprint({ action: 'clone-from-invoice', invoiceId, values });

export const recurringInvoiceCreationKey = (value: string): string => {
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
