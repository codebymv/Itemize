import { createHash } from 'crypto';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const canonicalJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          canonicalJson((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
};

export const normalizePublicChatIdempotencyKey = (
  value: string | undefined,
): string | null | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return IDEMPOTENCY_KEY.test(normalized) ? normalized : null;
};

export const publicChatRequestFingerprint = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalJson(value)))
    .digest('hex');
