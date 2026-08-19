export type BillingPlanId = 'starter' | 'unlimited' | 'pro';
export type BillingPeriod = 'monthly' | 'yearly';

type PlanDefinition = {
  id: BillingPlanId;
  name: string;
  displayName: string;
  tagline: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  popular: boolean;
  pricing: { monthly: number; yearly: number; yearlyMonthly: number };
  tier: number;
  limits: {
    organizations: number;
    contacts: number;
    users: number;
    workflows: number;
    emails: number;
    sms: number;
    landingPages: number;
    forms: number;
    calendars: number;
    apiCalls: number;
    storage: number;
  };
};

export const BILLING_PLANS: readonly PlanDefinition[] = [
  {
    id: 'starter',
    name: 'Solo',
    displayName: 'Solo',
    tagline: 'For freelancers replacing DocuSign + invoicing + notes',
    description:
      'Contacts, invoices, e-signatures, and a workspace — without stacking $20 tools.',
    icon: 'zap',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    popular: false,
    pricing: { monthly: 29, yearly: 290, yearlyMonthly: 24.17 },
    tier: 1,
    limits: {
      organizations: 3,
      contacts: 5000,
      users: 3,
      workflows: 5,
      emails: 1000,
      sms: 500,
      landingPages: 10,
      forms: 10,
      calendars: 3,
      apiCalls: 0,
      storage: 1024,
    },
  },
  {
    id: 'unlimited',
    name: 'Studio',
    displayName: 'Studio',
    tagline: 'For small studios that need a team and higher limits',
    description:
      'Unlimited signatures, more contacts, automations, and room for collaborators.',
    icon: 'crown',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-300',
    popular: true,
    pricing: { monthly: 49, yearly: 490, yearlyMonthly: 40.83 },
    tier: 2,
    limits: {
      organizations: -1,
      contacts: 25000,
      users: 10,
      workflows: 25,
      emails: 10000,
      sms: 5000,
      landingPages: 50,
      forms: 50,
      calendars: -1,
      apiCalls: 10000,
      storage: 10240,
    },
  },
  {
    id: 'pro',
    name: 'Studio+',
    displayName: 'Studio+',
    tagline: 'Legacy agency tier — not sold on the public page',
    description:
      'Kept for existing subscribers. Not offered to new buyers.',
    icon: 'building',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-400',
    popular: false,
    pricing: { monthly: 99, yearly: 990, yearlyMonthly: 82.5 },
    tier: 3,
    limits: {
      organizations: -1,
      contacts: -1,
      users: -1,
      workflows: -1,
      emails: 50000,
      sms: 25000,
      landingPages: -1,
      forms: -1,
      calendars: -1,
      apiCalls: 100000,
      storage: -1,
    },
  },
] as const;

const defaultPrices: Record<BillingPlanId, Record<BillingPeriod, string>> = {
  starter: {
    monthly: 'price_1U5ypmRxBJaRlFvtCDKzCKSC',
    yearly: 'price_starter_yearly',
  },
  unlimited: {
    monthly: 'price_1U5yqFRxBJaRlFvtcC8I6bbo',
    yearly: 'price_unlimited_yearly',
  },
  pro: {
    monthly: 'price_pro_monthly',
    yearly: 'price_pro_yearly',
  },
};

const PLACEHOLDER_PRICE_IDS = new Set([
  'price_starter_monthly',
  'price_unlimited_monthly',
  'price_pro_monthly',
  'price_starter_yearly',
  'price_unlimited_yearly',
  'price_pro_yearly',
]);

const configuredPrice = (
  envValue: string | undefined,
  fallback: string,
): string => {
  const value = envValue?.trim();
  if (value && isPurchasableStripePriceId(value)) return value;
  return fallback;
};

export const isPurchasableStripePriceId = (priceId: string): boolean =>
  /^price_1[A-Za-z0-9]+$/.test(priceId) && !PLACEHOLDER_PRICE_IDS.has(priceId);

export const billingPrices = (): Record<
  BillingPlanId,
  Record<BillingPeriod, string>
> => ({
  starter: {
    monthly: configuredPrice(
      process.env.STRIPE_PRICE_STARTER_MONTHLY,
      defaultPrices.starter.monthly,
    ),
    yearly: configuredPrice(
      process.env.STRIPE_PRICE_STARTER_YEARLY,
      defaultPrices.starter.yearly,
    ),
  },
  unlimited: {
    monthly: configuredPrice(
      process.env.STRIPE_PRICE_UNLIMITED_MONTHLY,
      defaultPrices.unlimited.monthly,
    ),
    yearly: configuredPrice(
      process.env.STRIPE_PRICE_UNLIMITED_YEARLY,
      defaultPrices.unlimited.yearly,
    ),
  },
  pro: {
    monthly: configuredPrice(
      process.env.STRIPE_PRICE_PRO_MONTHLY,
      defaultPrices.pro.monthly,
    ),
    yearly: configuredPrice(
      process.env.STRIPE_PRICE_PRO_YEARLY,
      defaultPrices.pro.yearly,
    ),
  },
});

export const planForPrice = (
  priceId: string,
): { planId: BillingPlanId; period: BillingPeriod } | null => {
  const prices = billingPrices();
  for (const plan of BILLING_PLANS) {
    for (const period of ['monthly', 'yearly'] as const) {
      if (prices[plan.id][period] === priceId) {
        return { planId: plan.id, period };
      }
    }
  }
  const aliases: Record<string, { planId: BillingPlanId; period: BillingPeriod }> = {
    price_starter_monthly: { planId: 'starter', period: 'monthly' },
    price_unlimited_monthly: { planId: 'unlimited', period: 'monthly' },
    price_pro_monthly: { planId: 'pro', period: 'monthly' },
    price_starter_yearly: { planId: 'starter', period: 'yearly' },
    price_unlimited_yearly: { planId: 'unlimited', period: 'yearly' },
    price_pro_yearly: { planId: 'pro', period: 'yearly' },
  };
  return aliases[priceId] ?? null;
};

export const planDefinition = (
  planId: string,
): PlanDefinition | undefined =>
  BILLING_PLANS.find((plan) => plan.id === planId);
