/**
 * @deprecated Use ../lib/subscription.ts and ../services/billingApi.ts instead
 * This context is kept for backward compatibility.
 * 
 * Subscription Context
 * Provides subscription state and feature gating throughout the app
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import {
  billingApi,
  BillingStatus,
  UsageStats as NewUsageStats,
  PlanInfo
} from '../services/billingApi';
import {
  PLAN_PRICING,
  PLAN_TIER_ORDER,
  PLAN_METADATA,
  Plan,
  getPlanTier
} from '../lib/subscription';

// Legacy Types (re-defined here to remove dependency on subscriptionsApi.ts)
export interface Subscription {
  hasSubscription: boolean;
  status: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
  planName?: string;
  displayName?: string;
  tierLevel?: number;
  billingPeriod?: 'monthly' | 'yearly';
  currentPeriod?: {
    start: string;
    end: string;
  };
  trial?: {
    endsAt: string;
    isActive: boolean;
  } | null;
  cancelAtPeriodEnd?: boolean;
  features?: Record<string, boolean>;
  limits?: Record<string, number>;
}

export interface UsageStats {
  hasSubscription: boolean;
  planName?: string;
  tierLevel?: number;
  period: {
    start: string;
    end: string;
  };
  usage: Record<string, {
    current: number;
    limit: number | 'unlimited';
    unlimited: boolean;
    percentage: number;
    remaining: number | 'unlimited';
  }>;
  realTimeCounts?: {
    contacts: number;
    landing_pages: number;
    forms: number;
    workflows: number;
  };
}

export interface SubscriptionPlan {
  id: string | number;
  name: string;
  displayName: string;
  description: string;
  tierLevel: number;
  pricing: {
    monthly: number;
    yearly: number;
    yearlyMonthly: number;
  };
  features: Record<string, boolean>;
  limits: Record<string, number>;
  trialDays: number;
  isDefault: boolean;
}

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
  | 'signature_documents'
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
  signature_documents: 1,
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

  // Keep subscription limits in a ref to avoid infinite loops when they are used in refreshUsage
  const subscriptionLimitsRef = useRef<Record<string, number> | undefined>(undefined);

  // Fetch subscription data
  const refreshSubscription = useCallback(async () => {
    if (!isAuthenticated) {
      setSubscription(null);
      subscriptionLimitsRef.current = undefined;
      return;
    }

    try {
      const response = await billingApi.getBillingStatus();
      if (response.success && response.data) {
        const status = response.data;
        const legacySub: Subscription = {
          hasSubscription: !!status.stripe_subscription_id,
          status: (status.subscription_status as any) || 'none',
          planName: status.plan,
          displayName: PLAN_METADATA[status.plan as Plan]?.displayName,
          tierLevel: getPlanTier(status.plan as Plan),
          billingPeriod: status.billing_period,
          currentPeriod: status.billing_period_start && status.billing_period_end ? {
            start: status.billing_period_start,
            end: status.billing_period_end
          } : undefined,
          trial: status.trial_ends_at ? {
            endsAt: status.trial_ends_at,
            isActive: status.subscription_status === 'trialing'
          } : null,
          cancelAtPeriodEnd: status.cancel_at_period_end,
          features: {}, // Mapped on demand or from constants if needed
          limits: {
            emails: status.emails_limit,
            sms: status.sms_limit,
            api_calls: status.api_calls_limit,
            contacts: status.contacts_limit,
            users: status.users_limit,
            workflows: status.workflows_limit,
            landing_pages: status.landing_pages_limit,
            forms: status.forms_limit,
            calendars: status.calendars_limit
          }
        };
        subscriptionLimitsRef.current = legacySub.limits;
        setSubscription(legacySub);
      }
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch subscription:', err);
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
      const response = await billingApi.getUsageStats();
      if (response.success && response.data) {
        const data = response.data;
        const limits = subscriptionLimitsRef.current;
        const legacyUsage: UsageStats = {
          hasSubscription: true,
          period: {
            start: data.period.start || '',
            end: data.period.end || ''
          },
          usage: {
            emails_per_month: {
              current: data.usage.emails.used,
              limit: data.usage.emails.limit,
              unlimited: data.usage.emails.limit === 'unlimited',
              percentage: data.usage.emails.percentage,
              remaining: data.usage.emails.limit === 'unlimited' ? 'unlimited' : (data.usage.emails.limit as number) - data.usage.emails.used
            },
            sms_per_month: {
              current: data.usage.sms.used,
              limit: data.usage.sms.limit,
              unlimited: data.usage.sms.limit === 'unlimited',
              percentage: data.usage.sms.percentage,
              remaining: data.usage.sms.limit === 'unlimited' ? 'unlimited' : (data.usage.sms.limit as number) - data.usage.sms.used
            },
            api_calls_per_day: {
              current: data.usage.apiCalls.used,
              limit: data.usage.apiCalls.limit,
              unlimited: data.usage.apiCalls.limit === 'unlimited',
              percentage: data.usage.apiCalls.percentage,
              remaining: data.usage.apiCalls.limit === 'unlimited' ? 'unlimited' : (data.usage.apiCalls.limit as number) - data.usage.apiCalls.used
            }
          },
          realTimeCounts: {
            contacts: data.resources.contacts,
            workflows: data.resources.workflows,
            forms: data.resources.forms,
            landing_pages: data.resources.landingPages
          }
        };

        // Add resource counts to usage map for getUsageInfo compatibility
        legacyUsage.usage['contacts_per_org'] = {
          current: data.resources.contacts,
          limit: limits?.contacts || 'unlimited',
          unlimited: limits?.contacts === -1,
          percentage: limits?.contacts && limits.contacts > 0
            ? Math.round((data.resources.contacts / limits.contacts) * 100)
            : 0,
          remaining: limits?.contacts === -1 ? 'unlimited' : (limits?.contacts || 0) - data.resources.contacts
        };

        legacyUsage.usage['workflows'] = {
          current: data.resources.workflows,
          limit: limits?.workflows || 'unlimited',
          unlimited: limits?.workflows === -1,
          percentage: limits?.workflows && limits.workflows > 0
            ? Math.round((data.resources.workflows / limits.workflows) * 100)
            : 0,
          remaining: limits?.workflows === -1 ? 'unlimited' : (limits?.workflows || 0) - data.resources.workflows
        };

        legacyUsage.usage['forms'] = {
          current: data.resources.forms,
          limit: limits?.forms || 'unlimited',
          unlimited: limits?.forms === -1,
          percentage: limits?.forms && limits.forms > 0
            ? Math.round((data.resources.forms / limits.forms) * 100)
            : 0,
          remaining: limits?.forms === -1 ? 'unlimited' : (limits?.forms || 0) - data.resources.forms
        };

        legacyUsage.usage['landing_pages'] = {
          current: data.resources.landingPages,
          limit: limits?.landing_pages || 'unlimited',
          unlimited: limits?.landing_pages === -1,
          percentage: limits?.landing_pages && limits.landing_pages > 0
            ? Math.round((data.resources.landingPages / limits.landing_pages) * 100)
            : 0,
          remaining: limits?.landing_pages === -1 ? 'unlimited' : (limits?.landing_pages || 0) - data.resources.landingPages
        };

        setUsage(legacyUsage);
      }
    } catch (err: any) {
      console.error('Failed to fetch usage:', err);
    }
  }, [isAuthenticated]);

  // Fetch available plans
  const fetchPlans = useCallback(async () => {
    try {
      const response = await billingApi.getPlans();
      if (response.success && response.data) {
        const legacyPlans: SubscriptionPlan[] = response.data.map(plan => ({
          id: plan.id,
          name: plan.id,
          displayName: plan.displayName,
          description: plan.description,
          tierLevel: plan.tier,
          pricing: plan.pricing,
          features: {}, // Mapped from constants if needed
          limits: plan.limits,
          trialDays: 14, // Default trial
          isDefault: plan.id === 'starter'
        }));
        setPlans(legacyPlans);
      }
    } catch (err: any) {
      console.error('Failed to fetch plans:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchPlans();
      await refreshSubscription();
      await refreshUsage();
      setIsLoading(false);
    };

    if (isAuthenticated) {
      loadData();
    } else {
      setIsLoading(false);
      setSubscription(null);
      setUsage(null);
      subscriptionLimitsRef.current = undefined;
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
      await billingApi.redirectToCheckout({
        planId: planName as Plan,
        billingPeriod
      });
    } catch (err: any) {
      console.error('Failed to start checkout:', err);
      throw new Error(err.message || 'Failed to start checkout');
    }
  }, []);

  // Open billing portal
  const openBillingPortal = useCallback(async () => {
    try {
      await billingApi.redirectToPortal();
    } catch (err: any) {
      console.error('Failed to open billing portal:', err);
      throw new Error(err.message || 'Failed to open billing portal');
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
