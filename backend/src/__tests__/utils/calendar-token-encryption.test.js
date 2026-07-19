const {
    parseCalendarTokenKeyring,
    inspectCalendarTokenEnvelope,
    encryptCalendarToken,
    decryptCalendarToken,
    calendarTokenNeedsRotation,
    rotateCalendarToken,
} = require('../../utils/calendarTokenEncryption');

const keyA = '11'.repeat(32);
const keyB = '22'.repeat(32);

function environment(activeKeyId = 'key-a', keys = { 'key-a': keyA }) {
    return {
        NODE_ENV: 'production',
        CALENDAR_TOKEN_ACTIVE_KEY_ID: activeKeyId,
        CALENDAR_TOKEN_ENCRYPTION_KEYS: JSON.stringify(keys),
    };
}

describe('calendar provider token encryption', () => {
    test('round-trips authenticated access and refresh envelopes', () => {
        const env = environment();
        const accessEnvelope = encryptCalendarToken('access-secret', 'access', env);
        const refreshEnvelope = encryptCalendarToken('refresh-secret', 'refresh', env);

        expect(inspectCalendarTokenEnvelope(accessEnvelope)).toEqual({
            version: 1,
            keyId: 'key-a',
        });
        expect(decryptCalendarToken(accessEnvelope, 'access', env)).toBe('access-secret');
        expect(decryptCalendarToken(refreshEnvelope, 'refresh', env)).toBe('refresh-secret');
        expect(() => decryptCalendarToken(accessEnvelope, 'refresh', env))
            .toThrow('failed authentication');
    });

    test('rejects malformed keyrings and missing production configuration', () => {
        expect(() => parseCalendarTokenKeyring({ NODE_ENV: 'production' }))
            .toThrow('must be configured together');
        expect(() => parseCalendarTokenKeyring(environment('missing')))
            .toThrow('is not present');
        expect(() => parseCalendarTokenKeyring(environment('key-a', { 'key-a': 'short' })))
            .toThrow('64 hexadecimal characters');
    });

    test('rotates old envelopes while retaining the previous key for reads', () => {
        const originalEnvironment = environment('key-a', { 'key-a': keyA });
        const rotatedEnvironment = environment('key-b', {
            'key-a': keyA,
            'key-b': keyB,
        });
        const original = encryptCalendarToken('rotate-me', 'access', originalEnvironment);

        expect(calendarTokenNeedsRotation(original, rotatedEnvironment)).toBe(true);
        const rotated = rotateCalendarToken(original, 'access', rotatedEnvironment);
        expect(inspectCalendarTokenEnvelope(rotated).keyId).toBe('key-b');
        expect(decryptCalendarToken(rotated, 'access', rotatedEnvironment)).toBe('rotate-me');
        expect(calendarTokenNeedsRotation(rotated, rotatedEnvironment)).toBe(false);
    });

    test('uses a deterministic development key without persisting plaintext', () => {
        const env = { NODE_ENV: 'test', JWT_SECRET: 'test-calendar-secret' };
        const envelope = encryptCalendarToken('development-token', 'access', env);
        expect(envelope).not.toContain('development-token');
        expect(decryptCalendarToken(envelope, 'access', env)).toBe('development-token');
    });
});
