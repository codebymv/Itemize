/**
 * Faithful port of the retained signed OAuth state
 * (backend/src/services/calendarOAuthState.js). States minted by either
 * runtime must verify in the other during the dual-runtime window; a
 * cross-runtime spec pins the compatibility.
 */
import * as crypto from 'crypto';

export const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

const getSecret = (): string => {
  const secret =
    process.env.CALENDAR_OAUTH_STATE_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Calendar OAuth state secret is not configured');
  return secret;
};

export function normalizeReturnPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/calendars';
  }
  if (
    value.includes('\\') ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    return '/calendars';
  }
  return value;
}

const signatureFor = (payload: string, secret = getSecret()): string =>
  crypto.createHmac('sha256', secret).update(payload).digest('base64url');

export function createCalendarOAuthState(
  values: { userId: number; organizationId: number; returnUrl?: unknown },
  options: { now?: number; secret?: string } = {},
): string {
  const stateData = {
    userId: Number(values.userId),
    organizationId: Number(values.organizationId),
    returnPath: normalizeReturnPath(values.returnUrl),
    issuedAt: options.now ?? Date.now(),
    nonce: crypto.randomBytes(16).toString('base64url'),
  };
  const payload = Buffer.from(JSON.stringify(stateData)).toString('base64url');
  return `${payload}.${signatureFor(payload, options.secret)}`;
}

export function verifyCalendarOAuthState(
  state: unknown,
  options: { now?: number; maxAgeMs?: number; secret?: string } = {},
): { userId: number; organizationId: number; returnPath: string } {
  if (typeof state !== 'string') throw new Error('Invalid OAuth state');
  const [payload, suppliedSignature, extra] = state.split('.');
  if (!payload || !suppliedSignature || extra !== undefined) {
    throw new Error('Invalid OAuth state');
  }

  const expected = Buffer.from(signatureFor(payload, options.secret));
  const supplied = Buffer.from(suppliedSignature);
  if (
    expected.length !== supplied.length ||
    !crypto.timingSafeEqual(expected, supplied)
  ) {
    throw new Error('Invalid OAuth state signature');
  }

  let stateData: {
    userId?: unknown;
    organizationId?: unknown;
    returnPath?: unknown;
    issuedAt?: unknown;
    nonce?: unknown;
  };
  try {
    stateData = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid OAuth state payload');
  }

  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (
    !Number.isInteger(stateData.userId) ||
    !Number.isInteger(stateData.organizationId) ||
    typeof stateData.issuedAt !== 'number' ||
    typeof stateData.nonce !== 'string' ||
    stateData.issuedAt > now + 30_000 ||
    now - stateData.issuedAt > maxAgeMs
  ) {
    throw new Error('Expired or invalid OAuth state');
  }

  return {
    userId: stateData.userId as number,
    organizationId: stateData.organizationId as number,
    returnPath: normalizeReturnPath(stateData.returnPath),
  };
}
