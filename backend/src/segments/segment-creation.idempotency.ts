import { createHash } from 'node:crypto';
import type { SegmentValues } from './segments.repository';

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

export const segmentCreationFingerprint = (values: SegmentValues): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize({
      ...values,
      definition: {
        ...values.definition,
        static_contact_ids: [...values.definition.static_contact_ids].sort((a, b) => a - b),
      },
    })))
    .digest('hex');
