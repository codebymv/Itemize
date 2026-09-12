import {
  BILLING_PLANS,
  billingPrices,
  isPurchasableStripePriceId,
} from './billing.constants';
import { getPlanFromStripePrice, EMAIL_LIMITS, USERS_LIMITS, CONTACTS_LIMITS, WORKFLOW_LIMITS, FORM_LIMITS, CALENDAR_LIMITS, SMS_LIMITS, API_LIMITS, LANDING_PAGE_LIMITS, finiteLimit } from '../subscription-webhooks/subscription-plan.constants';

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

  it('resolves configured annual checkout prices identically in subscription webhooks', () => {
    process.env.STRIPE_PRICE_STARTER_YEARLY = 'price_1AnnualSoloUnit';
    process.env.STRIPE_PRICE_UNLIMITED_YEARLY = 'price_1AnnualStudioUnit';
    for (const plan of BILLING_PLANS) {
      for (const period of ['monthly', 'yearly'] as const) {
        expect(getPlanFromStripePrice(billingPrices()[plan.id][period])).toBe(plan.id);
      }
    }
    expect(getPlanFromStripePrice('price_1U78itEHPD0TpM72ybhQuqwH')).toBe('starter');
  });

  it('keeps webhook-persisted limits aligned with the checkout catalog', () => {
    const maps = { emails: EMAIL_LIMITS, users: USERS_LIMITS, contacts: CONTACTS_LIMITS, workflows: WORKFLOW_LIMITS,
      forms: FORM_LIMITS, calendars: CALENDAR_LIMITS, sms: SMS_LIMITS, apiCalls: API_LIMITS, landingPages: LANDING_PAGE_LIMITS };
    for (const plan of BILLING_PLANS) for (const key of Object.keys(maps) as Array<keyof typeof maps>) {
      expect(finiteLimit(maps[key], plan.id)).toBe(plan.limits[key]);
    }
  });
});
