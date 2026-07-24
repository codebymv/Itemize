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
    name: 'Starter',
    displayName: 'Starter',
    tagline: 'Perfect for individuals & small teams',
    description:
      'Everything you need to get organized with lists, notes, and basic automation.',
    icon: 'zap',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    popular: false,
    pricing: { monthly: 97, yearly: 970, yearlyMonthly: 80.83 },
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
    name: 'Growth',
    displayName: 'Growth',
    tagline: 'For scaling businesses',
    description:
      'Scale your operations with unlimited organization, advanced workflows, and API access.',
    icon: 'crown',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-300',
    popular: true,
    pricing: { monthly: 297, yearly: 2970, yearlyMonthly: 247.5 },
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
    name: 'Enterprise',
    displayName: 'Enterprise',
    tagline: 'Full platform power',
    description:
      'Complete platform control with white-labeling, unlimited everything, and dedicated support.',
    icon: 'building',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-400',
    popular: false,
    pricing: { monthly: 497, yearly: 4970, yearlyMonthly: 414.17 },
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
    monthly: 'price_starter_monthly',
    yearly: 'price_starter_yearly',
  },
  unlimited: {
    monthly: 'price_unlimited_monthly',
    yearly: 'price_unlimited_yearly',
  },
  pro: {
    monthly: 'price_pro_monthly',
    yearly: 'price_pro_yearly',
  },
};

export const billingPrices = (): Record<
  BillingPlanId,
  Record<BillingPeriod, string>
> => ({
  starter: {
    monthly:
      process.env.STRIPE_PRICE_STARTER_MONTHLY ?? defaultPrices.starter.monthly,
    yearly:
      process.env.STRIPE_PRICE_STARTER_YEARLY ?? defaultPrices.starter.yearly,
  },
  unlimited: {
    monthly:
      process.env.STRIPE_PRICE_UNLIMITED_MONTHLY ??
      defaultPrices.unlimited.monthly,
    yearly:
      process.env.STRIPE_PRICE_UNLIMITED_YEARLY ??
      defaultPrices.unlimited.yearly,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? defaultPrices.pro.monthly,
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? defaultPrices.pro.yearly,
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
  return null;
};

export const planDefinition = (
  planId: string,
): PlanDefinition | undefined =>
  BILLING_PLANS.find((plan) => plan.id === planId);
