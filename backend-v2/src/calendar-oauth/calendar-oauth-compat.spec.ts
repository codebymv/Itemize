/**
 * Cross-runtime compatibility: OAuth states and token envelopes are
 * shared artifacts (URLs in flight, rows at rest), so each runtime must
 * accept what the other produced. These specs drive the ported
 * TypeScript implementations against the retained legacy modules.
 */
import {
  createCalendarOAuthState,
  normalizeReturnPath,
  verifyCalendarOAuthState,
} from './calendar-oauth-state';
import {
  calendarTokenNeedsRotation,
  decryptCalendarToken,
  encryptCalendarToken,
} from './calendar-token-encryption';

/* eslint-disable @typescript-eslint/no-var-requires */
const legacyState = require('../../../backend/src/services/calendarOAuthState');
const legacyTokens = require('../../../backend/src/utils/calendarTokenEncryption');
/* eslint-enable @typescript-eslint/no-var-requires */

describe('calendar OAuth cross-runtime compatibility', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = 'calendar-compat-secret';
    delete process.env.CALENDAR_OAUTH_STATE_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEYS;
    delete process.env.CALENDAR_TOKEN_ACTIVE_KEY_ID;
  });

  afterAll(() => {
    for (const name of [
      'JWT_SECRET',
      'CALENDAR_OAUTH_STATE_SECRET',
      'CALENDAR_TOKEN_ENCRYPTION_KEYS',
      'CALENDAR_TOKEN_ACTIVE_KEY_ID',
    ]) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
  });

  it('verifies states across runtimes in both directions', () => {
    const values = { userId: 7, organizationId: 3, returnUrl: '/calendars?tab=sync' };
    const nestState = createCalendarOAuthState(values);
    const legacyVerified = legacyState.verifyCalendarOAuthState(nestState);
    expect(legacyVerified).toEqual({
      userId: 7,
      organizationId: 3,
      returnPath: '/calendars?tab=sync',
    });

    const legacyMinted = legacyState.createCalendarOAuthState(values);
    expect(verifyCalendarOAuthState(legacyMinted)).toEqual(legacyVerified);
  });

  it('rejects expired and tampered states identically', () => {
    const stale = createCalendarOAuthState(
      { userId: 7, organizationId: 3 },
      { now: Date.now() - 11 * 60 * 1000 },
    );
    expect(() => verifyCalendarOAuthState(stale)).toThrow(
      'Expired or invalid OAuth state',
    );
    expect(() => legacyState.verifyCalendarOAuthState(stale)).toThrow(
      'Expired or invalid OAuth state',
    );

    const tampered = `${createCalendarOAuthState({ userId: 7, organizationId: 3 }).split('.')[0]}.AAAA`;
    expect(() => verifyCalendarOAuthState(tampered)).toThrow(
      'Invalid OAuth state signature',
    );
    expect(() => legacyState.verifyCalendarOAuthState(tampered)).toThrow(
      'Invalid OAuth state signature',
    );
  });

  it('normalizes return paths identically', () => {
    for (const value of [
      '/calendars?ok=1',
      'https://evil.example.com',
      '//evil.example.com',
      '/pa\\th',
      '/line\nbreak',
      42,
    ]) {
      expect(normalizeReturnPath(value)).toBe(
        legacyState.normalizeReturnPath(value),
      );
    }
  });

  it('decrypts token envelopes across runtimes in both directions', () => {
    const nestEnvelope = encryptCalendarToken('ya29.access-token', 'access');
    expect(legacyTokens.decryptCalendarToken(nestEnvelope, 'access')).toBe(
      'ya29.access-token',
    );
    const legacyEnvelope = legacyTokens.encryptCalendarToken(
      '1//refresh-token',
      'refresh',
    );
    expect(decryptCalendarToken(legacyEnvelope, 'refresh')).toBe(
      '1//refresh-token',
    );
  });

  it('binds envelopes to their token type identically', () => {
    const envelope = encryptCalendarToken('ya29.access-token', 'access');
    expect(() => decryptCalendarToken(envelope, 'refresh')).toThrow(
      'Calendar token envelope failed authentication',
    );
    expect(() => legacyTokens.decryptCalendarToken(envelope, 'refresh')).toThrow(
      'Calendar token envelope failed authentication',
    );
  });

  it('agrees on key rotation across configured keyrings', () => {
    const oldKeys = {
      CALENDAR_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ k1: 'ab'.repeat(32) }),
      CALENDAR_TOKEN_ACTIVE_KEY_ID: 'k1',
    } as NodeJS.ProcessEnv;
    const newKeys = {
      CALENDAR_TOKEN_ENCRYPTION_KEYS: JSON.stringify({
        k1: 'ab'.repeat(32),
        k2: 'cd'.repeat(32),
      }),
      CALENDAR_TOKEN_ACTIVE_KEY_ID: 'k2',
    } as NodeJS.ProcessEnv;
    const envelope = encryptCalendarToken('token-under-k1', 'access', oldKeys);
    expect(calendarTokenNeedsRotation(envelope, oldKeys)).toBe(false);
    expect(calendarTokenNeedsRotation(envelope, newKeys)).toBe(true);
    expect(legacyTokens.calendarTokenNeedsRotation(envelope, newKeys)).toBe(true);
    expect(decryptCalendarToken(envelope, 'access', newKeys)).toBe(
      'token-under-k1',
    );
  });
});
