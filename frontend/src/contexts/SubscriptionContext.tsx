/**
 * @deprecated Use ../lib/subscription.ts and ../services/billingApi.ts instead
 * This context is kept for backward compatibility.
 * 
 * Subscription Context
 * Provides subscription state and feature gating throughout the app
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import subscriptionsApi, {
  Subscription,
  UsageStats,
  SubscriptionPlan
} from '../services/subscriptionsApi';
import { PLAN_PRICING } from '../lib/subscription';

// Feature names for type safety
export type FeatureName =
  | 'contacts'
  | 'pipelines'
  | 'calendars'
  | 'forms'
  | 'landing_pages'
  | 'email_templates'
  | 'sms_templates'
  | 'conversations'
  | 'basic_automation'
  | 'api_access'
  | 'advanced_workflows'
  | 'unlimited_orgs'
  | 'white_label'
  | 'custom_domains'
  | 'saas_mode'
  | 'client_billing'
  | 'priority_support';

// Usage types for type safety
export type UsageType =
  | 'organizations'
  | 'contacts_per_org'
  | 'users_per_org'
  | 'workflows'
  | 'emails_per_month'
  | 'sms_per_month'
  | 'landing_pages'
  | 'api_calls_per_day'
  | 'forms';

interface SubscriptionStateContextType {
  subscription: Subscription | null;
  usage: UsageStats | null;
  plans: SubscriptionPlan[];
  isLoading: boolean;
  error: string | null;

  // Computed values
  isSubscribed: boolean;
  isTrialing: boolean;
  isPastDue: boolean;
  tierLevel: number;
  planName: string | null;
}

interface SubscriptionFeaturesContextType {
  hasFeature: (feature: FeatureName) => boolean;
  getUsageInfo: (usageType: UsageType) => {
    current: number;
    limit: number | 'unlimited';
    percentage: number;
    remaining: number | 'unlimited';
    unlimited: boolean;
    isApproaching: boolean;
    isExceeded: boolean;
  } | null;
  requiresUpgrade: (feature: FeatureName) => boolean;
  getRequiredTier: (feature: FeatureName) => number;
  refreshSubscription: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  startCheckout: (planName: 'starter' | 'unlimited' | 'pro', billingPeriod: 'monthly' | 'yearly') => Promise<void>;
  openBillingPortal: () => Promise<void>;
}

const SubscriptionStateContext = createContext<SubscriptionStateContextType | null>(null);
const SubscriptionFeaturesContext = createContext<SubscriptionFeaturesContextType | null>(null);

// Feature tier requirements
const FEATURE_TIERS: Record<FeatureName, number> = {
  contacts: 1,
  pipelines: 1,
  calendars: 1,
  forms: 1,
  landing_pages: 1,
  email_templates: 1,
  sms_templates: 1,
  conversations: 1,
  basic_automation: 1,
  api_access: 2,
  advanced_workflows: 2,
  unlimited_orgs: 2,
  white_label: 2,
  custom_domains: 2,
  saas_mode: 3,
  client_billing: 3,
  priority_support: 3,
};

interface SubscriptionProviderProps {
  children: ReactNode;
  /**
   * Whether the user is authenticated (passed from parent)
   */
  isAuthenticated?: boolean;
}

export function SubscriptionProvider({ children, isAuthenticated = false }: SubscriptionProviderProps) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch subscription data
  const refreshSubscription = useCallback(async () => {
    if (!isAuthenticated) {
      setSubscription(null);
      return;
    }

    try {
      const data = await subscriptionsApi.getCurrentSubscription();
      setSubscription(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch subscription:', err);
      // Don't set error for 401/403 - just means not subscribed
      if (err.response?.status !== 401 && err.response?.status !== 403) {
        setError(err.message || 'Failed to load subscription');
      }
    }
  }, [isAuthenticated]);

  // Fetch usage data
  const refreshUsage = useCallback(async () => {
    if (!isAuthenticated) {
      setUsage(null);
      return;
    }

    try {
      const data = await subscriptionsApi.getUsageStats();
      setUsage(data);
    } catch (err: any) {
      console.error('Failed to fetch usage:', err);
    }
  }, [isAuthenticated]);

  // Fetch available plans
  const fetchPlans = useCallback(async () => {
    try {
      const data = await subscriptionsApi.getPlans();
      setPlans(data);
    } catch (err: any) {
      console.error('Failed to fetch plans:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchPlans(),
        refreshSubscription(),
        refreshUsage()
      ]);
      setIsLoading(false);
    };

    if (isAuthenticated) {
      loadData();
    } else {
      setIsLoading(false);
      setSubscription(null);
      setUsage(null);
    }
  }, [isAuthenticated, fetchPlans, refreshSubscription, refreshUsage]);

  // Computed values
  const isSubscribed = subscription?.status === 'active' || subscription?.status === 'trialing';
  const isTrialing = subscription?.status === 'trialing';
  const isPastDue = subscription?.status === 'past_due';
  const tierLevel = subscription?.tierLevel || 0;
  const planName = subscription?.planName || null;

  // Check if user has access to a feature
  const hasFeature = useCallback((feature: FeatureName): boolean => {
    // Check subscription features first
    if (subscription?.features?.[feature]) {
      return true;
    }
    
    // Fall back to tier-based access
    const requiredTier = FEATURE_TIERS[feature] || 0;
    return tierLevel >= requiredTier;
  }, [subscription, tierLevel]);

  // Get usage info for a resource
  const getUsageInfo = useCallback((usageType: UsageType) => {
    if (!usage?.usage?.[usageType]) {
      return null;
    }

    const info = usage.usage[usageType];
    const isApproaching = !info.unlimited && info.percentage >= 80;
    const isExceeded = !info.unlimited && typeof info.limit === 'number' && info.current >= info.limit;

    return {
      current: info.current,
      limit: info.limit,
      percentage: info.percentage,
      remaining: info.remaining,
      unlimited: info.unlimited,
      isApproaching,
      isExceeded
    };
  }, [usage]);

  // Check if feature requires upgrade
  const requiresUpgrade = useCallback((feature: FeatureName): boolean => {
    return !hasFeature(feature);
  }, [hasFeature]);

  // Get required tier for a feature
  const getRequiredTier = useCallback((feature: FeatureName): number => {
    return FEATURE_TIERS[feature] || 0;
  }, []);

  // Start checkout flow
  const startCheckout = useCallback(async (
    planName: 'starter' | 'unlimited' | 'pro',
    billingPeriod: 'monthly' | 'yearly'
  ) => {
    try {
      // Get price ID from plan pricing
      const planPricing = PLAN_PRICING[planName];
      const priceId = billingPeriod === 'yearly' 
        ? planPricing.stripePriceIdYearly 
        : planPricing.stripePriceIdMonthly;

      if (!priceId) {
        throw new Error(`Price ID not configured for ${planName} ${billingPeriod}`);
      }

      const successUrl = `${window.location.origin}/settings?tab=billing&success=true`;
      const cancelUrl = `${window.location.origin}/settings?tab=billing&canceled=true`;
      
      const session = await subscriptionsApi.createCheckoutSession(
        priceId,
        successUrl,
        cancelUrl
      );

      // Redirect to Stripe Checkout
      window.location.href = session.url;
    } catch (err: any) {
      console.error('Failed to start checkout:', err);
      throw new Error(err.response?.data?.error?.message || 'Failed to start checkout');
    }
  }, []);

  // Open billing portal
  const openBillingPortal = useCallback(async () => {
    try {
      const returnUrl = window.location.href;
      const session = await subscriptionsApi.createPortalSession(returnUrl);
      window.location.href = session.url;
    } catch (err: any) {
      console.error('Failed to open billing portal:', err);
      throw new Error(err.response?.data?.error?.message || 'Failed to open billing portal');
    }
  }, []);

  const stateValue: SubscriptionStateContextType = useMemo(() => ({
    subscription,
    usage,
    plans,
    isLoading,
    error,
    isSubscribed,
    isTrialing,
    isPastDue,
    tierLevel,
    planName,
  }), [
    subscription,
    usage,
    plans,
    isLoading,
    error,
    isSubscribed,
    isTrialing,
    isPastDue,
    tierLevel,
    planName,
  ]);

  const featuresValue: SubscriptionFeaturesContextType = useMemo(() => ({
    hasFeature,
    getUsageInfo,
    requiresUpgrade,
    getRequiredTier,
    refreshSubscription,
    refreshUsage,
    startCheckout,
    openBillingPortal
  }), [
    hasFeature,
    getUsageInfo,
    requiresUpgrade,
    getRequiredTier,
    refreshSubscription,
    refreshUsage,
    startCheckout,
    openBillingPortal
  ]);

  return (
    <SubscriptionStateContext.Provider value={stateValue}>
      <SubscriptionFeaturesContext.Provider value={featuresValue}>
        {children}
      </SubscriptionFeaturesContext.Provider>
    </SubscriptionStateContext.Provider>
  );
}

// Hook to use subscription context
export function useSubscriptionState() {
  const context = useContext(SubscriptionStateContext);
  if (!context) {
    throw new Error('useSubscriptionState must be used within a SubscriptionProvider');
  }
  return context;
}

export function useSubscriptionFeatures() {
  const context = useContext(SubscriptionFeaturesContext);
  if (!context) {
    throw new Error('useSubscriptionFeatures must be used within a SubscriptionProvider');
  }
  return context;
}

export function useSubscription() {
  const state = useSubscriptionState();
  const features = useSubscriptionFeatures();
  return useMemo(() => ({ ...state, ...features }), [state, features]);
}

export default SubscriptionStateContext;
