/**
 * Verbatim port of the plan values the retained Stripe subscription
 * webhook applies (backend/src/lib/subscription.constants.js). The
 * webhook writes these limits into organizations, so the two runtimes
 * must resolve identical numbers while both serve the receiver.
 */
export const PLANS = {
  FREE: 'free',
  STARTER: 'starter',
  UNLIMITED: 'unlimited',
  PRO: 'pro',
} as const;

export const PLAN_TIER_ORDER: Readonly<Record<string, number>> = {
  [PLANS.FREE]: 0,
  [PLANS.STARTER]: 1,
  [PLANS.UNLIMITED]: 2,
  [PLANS.PRO]: 3,
};

const STRIPE_PRICE_TO_PLAN: Readonly<Record<string, string>> = {
  price_1U78itEHPD0TpM72ybhQuqwH: PLANS.STARTER,
  price_1U78jKEHPD0TpM72XLrdBuO5: PLANS.UNLIMITED,
  price_starter_monthly: PLANS.STARTER,
  price_unlimited_monthly: PLANS.UNLIMITED,
  price_pro_monthly: PLANS.PRO,
  price_starter_yearly: PLANS.STARTER,
  price_unlimited_yearly: PLANS.UNLIMITED,
  price_pro_yearly: PLANS.PRO,
};

export const getPlanFromStripePrice = (
  priceId: string | null,
): string | null => (priceId ? STRIPE_PRICE_TO_PLAN[priceId] || null : null);

type LimitMap = Readonly<Record<string, number>>;

export const CONTACTS_LIMITS: LimitMap = {
  [PLANS.FREE]: 0,
  [PLANS.STARTER]: 5000,
  [PLANS.UNLIMITED]: 25000,
  [PLANS.PRO]: Infinity,
};
export const USERS_LIMITS: LimitMap = {
  [PLANS.FREE]: 0,
  [PLANS.STARTER]: 3,
  [PLANS.UNLIMITED]: 10,
  [PLANS.PRO]: Infinity,
};
export const WORKFLOW_LIMITS: LimitMap = {
  [PLANS.FREE]: 0,
  [PLANS.STARTER]: 5,
  [PLANS.UNLIMITED]: 25,
  [PLANS.PRO]: Infinity,
};
export const EMAIL_LIMITS: LimitMap = {
  [PLANS.FREE]: 0,
  [PLANS.STARTER]: 1000,
  [PLANS.UNLIMITED]: 10000,
  [PLANS.PRO]: 50000,
};
export const SMS_LIMITS: LimitMap = {
  [PLANS.FREE]: 0,
  [PLANS.STARTER]: 500,
  [PLANS.UNLIMITED]: 5000,
  [PLANS.PRO]: 25000,
};
export const LANDING_PAGE_LIMITS: LimitMap = {
  [PLANS.FREE]: 0,
  [PLANS.STARTER]: 10,
  [PLANS.UNLIMITED]: 50,
  [PLANS.PRO]: Infinity,
};
export const FORM_LIMITS: LimitMap = {
  [PLANS.FREE]: 0,
  [PLANS.STARTER]: 10,
  [PLANS.UNLIMITED]: 50,
  [PLANS.PRO]: Infinity,
};
export const CALENDAR_LIMITS: LimitMap = {
  [PLANS.FREE]: 0,
  [PLANS.STARTER]: 3,
  [PLANS.UNLIMITED]: Infinity,
  [PLANS.PRO]: Infinity,
};
export const API_LIMITS: LimitMap = {
  [PLANS.FREE]: 0,
  [PLANS.STARTER]: 0,
  [PLANS.UNLIMITED]: 10000,
  [PLANS.PRO]: 100000,
};

export const finiteLimit = (limits: LimitMap, plan: string): number => {
  const value = limits[plan];
  return value === Infinity ? -1 : value;
};
