const {
    createCalendarOAuthState,
    verifyCalendarOAuthState,
    normalizeReturnPath,
    DEFAULT_MAX_AGE_MS,
} = require('../../services/calendarOAuthState');

describe('calendar OAuth state', () => {
    const secret = 'calendar-oauth-test-secret';
    const now = 1_800_000_000_000;

    it('round-trips signed identity, tenant, and return path claims', () => {
        const state = createCalendarOAuthState({
            userId: 42,
            organizationId: 17,
            returnUrl: '/calendar-integrations?tab=google',
        }, { secret, now });

        expect(verifyCalendarOAuthState(state, { secret, now })).toEqual({
            userId: 42,
            organizationId: 17,
            returnPath: '/calendar-integrations?tab=google',
        });
    });

    it('rejects tampered and expired state', () => {
        const state = createCalendarOAuthState({ userId: 42, organizationId: 17 }, { secret, now });
        const [payload, signature] = state.split('.');
        const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;

        expect(() => verifyCalendarOAuthState(`${tamperedPayload}.${signature}`, { secret, now }))
            .toThrow('Invalid OAuth state signature');
        expect(() => verifyCalendarOAuthState(state, { secret, now: now + DEFAULT_MAX_AGE_MS + 1 }))
            .toThrow('Expired or invalid OAuth state');
    });

    it('prevents external and protocol-relative callback redirects', () => {
        expect(normalizeReturnPath('https://evil.example/capture')).toBe('/calendars');
        expect(normalizeReturnPath('//evil.example/capture')).toBe('/calendars');
        expect(normalizeReturnPath('/calendars')).toBe('/calendars');
    });
});
