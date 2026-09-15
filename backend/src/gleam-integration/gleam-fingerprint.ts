import { createHash } from 'node:crypto';

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]));
  }
  return value;
};

export const gleamFingerprint = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(canonical(value))).digest('hex');
export const gleamKeyFingerprint = (pem: string): string => createHash('sha256').update(pem).digest('hex');
