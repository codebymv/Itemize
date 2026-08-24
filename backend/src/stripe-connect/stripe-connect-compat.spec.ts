/**
 * Stripe Connect state properties. Cross-runtime interchange with the
 * retired Express runtime was proven by the dual-runtime suite before
 * retirement; states carry a short TTL so legacy-minted fixtures
 * cannot be pinned. The round-trip projection, return-path
 * normalization, and expiry rejection remain covered here.
 */
import {
  createStripeConnectState,
  normalizeReturnPath,
  verifyStripeConnectState,
} from './stripe-connect-state';

describe('Stripe Connect state properties', () => {
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

  it('round-trips states with the verified projection', () => {
    const state = createStripeConnectState({
      userId: 5,
      organizationId: 9,
      returnUrl: '/payment-settings?from=setup',
    });
    expect(verifyStripeConnectState(state)).toEqual({
      userId: 5,
      organizationId: 9,
      returnPath: '/payment-settings?from=setup',
    });
  });

  it('normalizes return paths to safe app-relative values and rejects expired states', () => {
    expect(normalizeReturnPath('/ok')).toBe('/ok');
    for (const value of ['//evil', 'https://evil', '/pa\\th', 17]) {
      expect(normalizeReturnPath(value)).toBe('/payment-settings');
    }
    const stale = createStripeConnectState(
      { userId: 5, organizationId: 9 },
      { now: Date.now() - 11 * 60 * 1000 },
    );
    expect(() => verifyStripeConnectState(stale)).toThrow(
      'Expired or invalid OAuth state',
    );
  });
});
