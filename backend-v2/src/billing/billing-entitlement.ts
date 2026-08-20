export type PaidEntitlementState = {
  plan: string | null;
  subscription_status: string | null;
  trial_ends_at: Date | string | null;
};

const PAID_PLANS = new Set(['starter', 'unlimited', 'pro']);
const PLAN_TIERS: Record<string, number> = {
  free: 0,
  starter: 1,
  unlimited: 2,
  pro: 3,
};

/** Paid features fail closed unless billing is active or an unexpired trial exists. */
export const hasPaidEntitlement = (
  state: PaidEntitlementState | undefined,
  now = Date.now(),
): boolean => {
  if (!state || !state.plan || !PAID_PLANS.has(state.plan)) return false;
  if (state.subscription_status === 'active') return true;
  if (state.subscription_status !== 'trialing' || !state.trial_ends_at) return false;
  const trialEnd = new Date(state.trial_ends_at).getTime();
  return Number.isFinite(trialEnd) && trialEnd > now;
};

export const hasPlanEntitlement = (
  state: PaidEntitlementState | undefined,
  requiredPlan: 'starter' | 'unlimited' | 'pro',
  now = Date.now(),
): boolean =>
  hasPaidEntitlement(state, now) &&
  (PLAN_TIERS[state?.plan ?? 'free'] ?? 0) >= PLAN_TIERS[requiredPlan];

export const signatureDocumentLimit = (plan: string | null): number =>
  plan === 'starter' ? 25 : plan === 'free' || !plan ? 0 : Number.POSITIVE_INFINITY;
