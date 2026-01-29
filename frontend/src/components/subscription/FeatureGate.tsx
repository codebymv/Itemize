/**
 * Feature Gate Component
 * Conditionally renders children based on subscription features
 */

import React, { ReactNode } from 'react';
import { useSubscriptionFeatures, FeatureName } from '../../contexts/SubscriptionContext';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';

interface FeatureGateProps {
  /**
   * The feature to check access for
   */
  feature: FeatureName;
  
  /**
   * Content to render if the user has access
   */
  children: ReactNode;
  
  /**
   * Custom fallback content (defaults to upgrade prompt)
   */
  fallback?: ReactNode;
  
  /**
   * If true, shows a locked overlay instead of replacing content
   */
  showOverlay?: boolean;
  
  /**
   * Custom message for the upgrade prompt
   */
  upgradeMessage?: string;
}

const TIER_NAMES: Record<number, string> = {
  1: 'Starter',
  2: 'Agency Unlimited',
  3: 'SaaS Pro'
};

const FEATURE_NAMES: Record<FeatureName, string> = {
  contacts: 'Contact Management',
  pipelines: 'Sales Pipelines',
  calendars: 'Calendars & Bookings',
  forms: 'Form Builder',
  landing_pages: 'Landing Pages',
  email_templates: 'Email Templates',
  sms_templates: 'SMS Templates',
  conversations: 'Unified Inbox',
  basic_automation: 'Basic Automation',
  api_access: 'API Access',
  advanced_workflows: 'Advanced Workflows',
  unlimited_orgs: 'Unlimited Organizations',
  white_label: 'White Label',
  custom_domains: 'Custom Domains',
  saas_mode: 'SaaS Mode',
  client_billing: 'Client Billing',
  priority_support: 'Priority Support'
};

export function FeatureGate({ 
  feature, 
  children, 
  fallback, 
  showOverlay = false,
  upgradeMessage 
}: FeatureGateProps) {
  const { hasFeature, getRequiredTier, startCheckout } = useSubscriptionFeatures();

  const hasAccess = hasFeature(feature);
  const requiredTier = getRequiredTier(feature);
  const tierName = TIER_NAMES[requiredTier] || 'Higher';
  const featureName = FEATURE_NAMES[feature] || feature;

  if (hasAccess) {
    return <>{children}</>;
  }

  // Custom fallback provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Show locked overlay
  if (showOverlay) {
    return (
      <div className="relative">
        <div className="opacity-50 pointer-events-none blur-[1px]">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
          <div className="text-center p-6 max-w-sm">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">
              {featureName} is Locked
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {upgradeMessage || `Upgrade to ${tierName} to unlock this feature.`}
            </p>
            <button
              onClick={() => {
                const planMap: Record<number, 'starter' | 'unlimited' | 'pro'> = {
                  1: 'starter',
                  2: 'unlimited',
                  3: 'pro'
                };
                startCheckout(planMap[requiredTier] || 'unlimited', 'monthly');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Upgrade Now
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default upgrade prompt
  return (
    <div className="border border-dashed border-border rounded-lg p-6 text-center bg-muted/30">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
        <Lock className="w-6 h-6 text-primary" />
      </div>
      <h3 className="font-semibold mb-2">
        Unlock {featureName}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {upgradeMessage || `This feature requires the ${tierName} plan or higher.`}
      </p>
      <button
        onClick={() => {
          const planMap: Record<number, 'starter' | 'unlimited' | 'pro'> = {
            1: 'starter',
            2: 'unlimited',
            3: 'pro'
          };
          startCheckout(planMap[requiredTier] || 'unlimited', 'monthly');
        }}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        Upgrade to {tierName}
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

export default FeatureGate;
