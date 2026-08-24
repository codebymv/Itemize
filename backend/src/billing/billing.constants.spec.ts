import {
  billingPrices,
  isPurchasableStripePriceId,
} from './billing.constants';

describe('billingPrices', () => {
  const keys = [
    'STRIPE_PRICE_STARTER_MONTHLY',
    'STRIPE_PRICE_STARTER_YEARLY',
    'STRIPE_PRICE_UNLIMITED_MONTHLY',
    'STRIPE_PRICE_UNLIMITED_YEARLY',
    'STRIPE_PRICE_PRO_MONTHLY',
    'STRIPE_PRICE_PRO_YEARLY',
  ] as const;
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  ) as Record<(typeof keys)[number], string | undefined>;

  afterEach(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it('ignores leftover placeholder env price ids', () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter_monthly';
    process.env.STRIPE_PRICE_UNLIMITED_MONTHLY = 'price_unlimited_monthly';
    process.env.STRIPE_PRICE_UNLIMITED_YEARLY = '  ';

    expect(billingPrices().starter.monthly).toBe(
      'price_1U78itEHPD0TpM72ybhQuqwH',
    );
    expect(billingPrices().unlimited.monthly).toBe(
      'price_1U78jKEHPD0TpM72XLrdBuO5',
    );
    expect(isPurchasableStripePriceId(billingPrices().unlimited.yearly)).toBe(
      false,
    );
  });

  it('keeps a real Stripe price id from env', () => {
    process.env.STRIPE_PRICE_UNLIMITED_MONTHLY = 'price_1AbCdEfGhIjKlMnOpQrStUv';
    expect(billingPrices().unlimited.monthly).toBe(
      'price_1AbCdEfGhIjKlMnOpQrStUv',
    );
  });
});
