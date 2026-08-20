import { PLAN_TIER_ORDER, type Plan } from './subscription';

export const hasPlanAccess = (
  isSubscribed: boolean,
  tierLevel: number,
  requiredPlan: Plan,
): boolean =>
  isSubscribed && tierLevel >= PLAN_TIER_ORDER[requiredPlan];

export const authenticatedHomePath = (isSubscribed: boolean): '/dashboard' | '/canvas' =>
  isSubscribed ? '/dashboard' : '/canvas';
