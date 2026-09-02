import { createHash } from 'node:crypto';

export type EmailTemplateCreationAction = 'create' | 'create_draft' | 'duplicate';

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

export const emailTemplateCreationFingerprint = (
  action: EmailTemplateCreationAction,
  values: Record<string, unknown>,
): string => createHash('sha256')
  .update(JSON.stringify(canonicalize({ action, ...values })))
  .digest('hex');
