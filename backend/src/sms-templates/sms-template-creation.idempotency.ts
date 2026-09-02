import { createHash } from 'node:crypto';

export type SmsTemplateCreationAction = 'create' | 'duplicate';

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

export const smsTemplateCreationFingerprint = (
  action: SmsTemplateCreationAction,
  values: Record<string, unknown>,
): string => createHash('sha256')
  .update(JSON.stringify(canonicalize({ action, ...values })))
  .digest('hex');
