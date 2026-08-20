import {
  hasPaidEntitlement,
  hasPlanEntitlement,
  signatureDocumentLimit,
} from './billing-entitlement';

describe('hasPaidEntitlement', () => {
  const now = Date.parse('2026-08-20T12:00:00.000Z');

  it('allows active paid plans and an unexpired trial', () => {
    expect(hasPaidEntitlement({ plan: 'starter', subscription_status: 'active', trial_ends_at: null }, now)).toBe(true);
    expect(hasPaidEntitlement({ plan: 'starter', subscription_status: 'trialing', trial_ends_at: '2026-08-21T12:00:00.000Z' }, now)).toBe(true);
  });

  it('denies free, inactive, and expired states', () => {
    expect(hasPaidEntitlement({ plan: 'free', subscription_status: 'none', trial_ends_at: null }, now)).toBe(false);
    expect(hasPaidEntitlement({ plan: 'starter', subscription_status: 'none', trial_ends_at: null }, now)).toBe(false);
    expect(hasPaidEntitlement({ plan: 'starter', subscription_status: 'trialing', trial_ends_at: '2026-08-19T12:00:00.000Z' }, now)).toBe(false);
  });

  it('requires the configured plan tier as well as live billing', () => {
    const activeStarter = { plan: 'starter', subscription_status: 'active', trial_ends_at: null };
    const activeStudio = { plan: 'unlimited', subscription_status: 'active', trial_ends_at: null };

    expect(hasPlanEntitlement(activeStarter, 'starter', now)).toBe(true);
    expect(hasPlanEntitlement(activeStarter, 'unlimited', now)).toBe(false);
    expect(hasPlanEntitlement(activeStudio, 'starter', now)).toBe(true);
    expect(hasPlanEntitlement(activeStudio, 'unlimited', now)).toBe(true);
  });

  it('matches the public monthly signature contract', () => {
    expect(signatureDocumentLimit('free')).toBe(0);
    expect(signatureDocumentLimit('starter')).toBe(25);
    expect(signatureDocumentLimit('unlimited')).toBe(Number.POSITIVE_INFINITY);
    expect(signatureDocumentLimit('pro')).toBe(Number.POSITIVE_INFINITY);
  });
});
