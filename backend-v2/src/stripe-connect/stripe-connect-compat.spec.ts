/**
 * Cross-runtime compatibility for the Stripe Connect state: states
 * minted by either runtime must verify in the other during the
 * dual-runtime window.
 */
import {
  createStripeConnectState,
  normalizeReturnPath,
  verifyStripeConnectState,
} from './stripe-connect-state';

/* eslint-disable @typescript-eslint/no-var-requires */
const legacyState = require('../../../backend/src/services/stripeConnectState');
/* eslint-enable @typescript-eslint/no-var-requires */

describe('Stripe Connect cross-runtime state compatibility', () => {
  const savedSecret = process.env.JWT_SECRET;
  const savedStateSecret = process.env.STRIPE_CONNECT_STATE_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'stripe-connect-compat-secret';
    delete process.env.STRIPE_CONNECT_STATE_SECRET;
  });

  afterAll(() => {
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
    if (savedStateSecret === undefined) delete process.env.STRIPE_CONNECT_STATE_SECRET;
    else process.env.STRIPE_CONNECT_STATE_SECRET = savedStateSecret;
  });

  it('verifies states across runtimes in both directions', () => {
    const values = { userId: 5, organizationId: 9, returnUrl: '/payment-settings?from=setup' };
    const nestState = createStripeConnectState(values);
    expect(legacyState.verifyStripeConnectState(nestState)).toEqual({
      userId: 5,
      organizationId: 9,
      returnPath: '/payment-settings?from=setup',
    });
    const legacyMinted = legacyState.createStripeConnectState(values);
    expect(verifyStripeConnectState(legacyMinted)).toEqual({
      userId: 5,
      organizationId: 9,
      returnPath: '/payment-settings?from=setup',
    });
  });

  it('normalizes return paths and rejects expired states identically', () => {
    for (const value of ['/ok', '//evil', 'https://evil', '/pa\\th', 17]) {
      expect(normalizeReturnPath(value)).toBe(
        legacyState.normalizeReturnPath(value),
      );
    }
    const stale = createStripeConnectState(
      { userId: 5, organizationId: 9 },
      { now: Date.now() - 11 * 60 * 1000 },
    );
    expect(() => verifyStripeConnectState(stale)).toThrow(
      'Expired or invalid OAuth state',
    );
    expect(() => legacyState.verifyStripeConnectState(stale)).toThrow(
      'Expired or invalid OAuth state',
    );
  });
});
