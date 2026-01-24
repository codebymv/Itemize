/**
 * Upgrade Prompt Component
 * Shows upgrade CTA for specific features
 */

import React from 'react';
import { useSubscription, FeatureName } from '../../contexts/SubscriptionContext';
import { Sparkles, ArrowRight, X, Check } from 'lucide-react';

interface UpgradePromptProps {
  /**
   * Feature that requires upgrade (optional - for generic prompt)
   */
  feature?: FeatureName;
  
  /**
   * Custom headline
   */
  headline?: string;
  
  /**
   * Custom description
   */
  description?: string;
  
  /**
   * Show feature list
   */
  showFeatures?: boolean;
  
  /**
   * Variant style
   */
  variant?: 'inline' | 'card' | 'banner' | 'modal';
  
  /**
   * Allow dismissing the prompt
   */
  dismissible?: boolean;
  
  /**
   * Callback when dismissed
   */
  onDismiss?: () => void;
  
  /**
   * Custom class names
   */
  className?: string;
}

const TIER_FEATURES = {
  unlimited: [
    'Unlimited sub-accounts',
    'REST API access',
    'Advanced workflows',
    'White-label branding',
    'Custom domains',
    '10,000 emails/month'
  ],
  pro: [
    'Everything in Unlimited',
    'SaaS mode - resell as your own',
    'Client billing automation',
    'Mobile app white-label',
    'Priority support',
    '50,000 emails/month'
  ]
};

export function UpgradePrompt({
  feature,
  headline,
  description,
  showFeatures = true,
  variant = 'card',
  dismissible = false,
  onDismiss,
  className = ''
}: UpgradePromptProps) {
  const { startCheckout, tierLevel, planName } = useSubscription();
  
  // Determine which plan to promote
  const suggestedPlan: 'unlimited' | 'pro' = tierLevel < 2 ? 'unlimited' : 'pro';
  const suggestedPlanName = suggestedPlan === 'unlimited' ? 'Agency Unlimited' : 'SaaS Pro';
  const suggestedPrice = suggestedPlan === 'unlimited' ? '$297' : '$497';
  
  const defaultHeadline = `Upgrade to ${suggestedPlanName}`;
  const defaultDescription = `Get more features and higher limits to grow your business faster.`;

  // Banner variant
  if (variant === 'banner') {
    return (
      <div className={`relative bg-gradient-to-r from-primary/10 via-purple-500/10 to-primary/10 border border-primary/20 rounded-lg p-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{headline || defaultHeadline}</p>
              <p className="text-sm text-muted-foreground">{description || defaultDescription}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => startCheckout(suggestedPlan, 'monthly')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Upgrade Now
              <ArrowRight className="w-4 h-4" />
            </button>
            {dismissible && (
              <button
                onClick={onDismiss}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Inline variant
  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-3 p-3 bg-muted/50 rounded-lg ${className}`}>
        <Sparkles className="w-5 h-5 text-primary flex-shrink-0" />
        <span className="text-sm flex-1">{headline || `Unlock more with ${suggestedPlanName}`}</span>
        <button
          onClick={() => startCheckout(suggestedPlan, 'monthly')}
          className="text-sm font-medium text-primary hover:underline"
        >
          Upgrade
        </button>
      </div>
    );
  }

  // Card variant (default)
  return (
    <div className={`relative bg-card border border-border rounded-xl overflow-hidden ${className}`}>
      {/* Decorative gradient */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-primary" />
      
      <div className="p-6">
        {dismissible && (
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">{headline || defaultHeadline}</h3>
            <p className="text-sm text-muted-foreground">Starting at {suggestedPrice}/month</p>
          </div>
        </div>
        
        <p className="text-muted-foreground mb-4">
          {description || defaultDescription}
        </p>
        
        {showFeatures && (
          <ul className="space-y-2 mb-6">
            {TIER_FEATURES[suggestedPlan].map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        )}
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => startCheckout(suggestedPlan, 'monthly')}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Upgrade to {suggestedPlanName}
          </button>
          <button
            onClick={() => startCheckout(suggestedPlan, 'yearly')}
            className="px-4 py-2.5 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors"
          >
            Save with yearly
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpgradePrompt;
