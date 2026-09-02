import { createHash } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';

export type SignatureCreationAction =
  | 'create_document'
  | 'create_template'
  | 'instantiate_template';

export type SignatureCreationOutcome<T> =
  | { kind: 'created'; row: T; replayed: boolean }
  | { kind: 'idempotency_conflict' }
  | { kind: 'result_unavailable' };

export type SignatureCreationReceiptRow = {
  action: SignatureCreationAction;
  request_fingerprint: string;
  result_document_id: number | null;
  result_template_id: number | null;
};

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

export const signatureCreationFingerprint = (
  action: SignatureCreationAction,
  payload: unknown,
): string => createHash('sha256')
  .update(JSON.stringify(canonicalize({ action, payload })))
  .digest('hex');

export const signatureCreationKey = (value: string): string => {
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

export const signatureCreationConflict = (action: SignatureCreationAction): never => {
  throw itemizeGraphqlError(
    'idempotencyKey was already used for a different signature creation request',
    'CONFLICT',
    { field: 'idempotencyKey', reason: 'IDEMPOTENCY_KEY_REUSED', action },
  );
};

export const signatureCreationUnavailable = (action: SignatureCreationAction): never => {
  throw itemizeGraphqlError(
    'The signature resource created by this request is no longer available',
    'CONFLICT',
    { field: 'idempotencyKey', reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE', action },
  );
};
