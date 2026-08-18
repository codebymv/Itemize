const {
    createStripeConnectState,
    verifyStripeConnectState,
    normalizeReturnPath,
    DEFAULT_MAX_AGE_MS,
    DEFAULT_RETURN_PATH,
} = require('../../services/stripeConnectState');

describe('Stripe Connect OAuth state', () => {
    const secret = 'stripe-connect-test-secret';
    const now = 1_800_000_000_000;

    it('round-trips signed identity, tenant, and return path claims', () => {
        const state = createStripeConnectState({
            userId: 42,
            organizationId: 17,
            returnUrl: '/calendar-integrations',
        }, { secret, now });

        expect(verifyStripeConnectState(state, { secret, now })).toEqual({
            userId: 42,
            organizationId: 17,
            returnPath: '/calendar-integrations',
        });
    });

    it('rejects tampered and expired state', () => {
        const state = createStripeConnectState({ userId: 42, organizationId: 17 }, { secret, now });
        const [payload, signature] = state.split('.');
        const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;

        expect(() => verifyStripeConnectState(`${tamperedPayload}.${signature}`, { secret, now }))
            .toThrow('Invalid OAuth state signature');
        expect(() => verifyStripeConnectState(state, { secret, now: now + DEFAULT_MAX_AGE_MS + 1 }))
            .toThrow('Expired or invalid OAuth state');
    });

    it('prevents external and protocol-relative callback redirects', () => {
        expect(normalizeReturnPath('https://evil.example/capture')).toBe(DEFAULT_RETURN_PATH);
        expect(normalizeReturnPath('//evil.example/capture')).toBe(DEFAULT_RETURN_PATH);
        expect(normalizeReturnPath('/payment-settings')).toBe('/payment-settings');
    });
});
