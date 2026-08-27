/**
 * Pricing Cards Component
 * Displays subscription plans for landing page and dashboard
 * Theme-aware design matching itemize.cloud visual language
 */

import { Check, Loader2, Zap, Crown, Building2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
    Plan, 
    PLANS,
    PLAN_METADATA, 
    PLAN_PRICING,
    PLAN_TIER_ORDER 
} from '@/lib/subscription';

// Plan features - aligned with actual itemize.cloud capabilities
const PLAN_FEATURES: Record<Plan, string[]> = {
    free: [
        'Full workspace: lists, notes, whiteboards, and canvas',
        'Organize, share, and keep work in one place',
        'Own 1 workspace',
        '1 team member',
        'Upgrade when you need CRM and billing',
    ],
    starter: [
        'Full workspace included',
        'Own up to 3 workspaces',
        'Contacts, pipelines, and calendars',
        'Invoices and 25 e-signatures / month',
        'Inbox, forms, and landing pages',
        '3 team members',
        'Email support',
    ],
    unlimited: [
        'Everything in Solo',
        'Own unlimited workspaces',
        'Unlimited e-signatures',
        '25,000 contacts and 10 teammates',
        'Automations and higher sending limits',
        'Priority support',
    ],
    pro: [
        'Everything in Studio',
        'Legacy agency features',
        'Not offered to new buyers',
    ],
};

interface PricingCardsProps {
    /**
     * Hide the free plan (for upgrade/landing displays)
     */
    hideFree?: boolean;
    
    /**
     * Hide the starter plan (for upgrade dialogs)
     */
    hideStarter?: boolean;

    /**
     * Hide the legacy agency tier (default: off the public catalog)
     */
    hidePro?: boolean;
    
    /**
     * Current user's plan (to show "Current Plan" badge)
     */
    currentPlan?: Plan;
    
    /**
     * Variant: 'landing' for public pages, 'dashboard' for settings
     */
    variant?: 'landing' | 'dashboard';
    
    /**
     * Callback when user clicks upgrade button
     */
    onUpgrade?: (planId: Plan) => void;

    /** Free organizations may start one no-card Solo trial. */
    starterTrialEligible?: boolean;

    /** A no-card Solo trial can convert its current plan through checkout. */
    canSubscribeCurrentTrial?: boolean;
    
    /**
     * Show loading state on buttons
     */
    isLoading?: boolean;
    
    /**
     * Show yearly pricing toggle
     */
    showYearlyToggle?: boolean;
    
    /**
     * Current billing period
     */
    billingPeriod?: 'monthly' | 'yearly';
    
    /**
     * Callback when billing period changes
     */
    onBillingPeriodChange?: (period: 'monthly' | 'yearly') => void;
}

// Icon mapping for plans
const PLAN_ICONS = {
    free: User,
    starter: Zap,
    unlimited: Crown,
    pro: Building2,
};

export function PricingCards({
    hideFree = true,
    hideStarter = false,
    hidePro = true,
    currentPlan,
    variant = 'landing',
    onUpgrade,
    starterTrialEligible = false,
    canSubscribeCurrentTrial = false,
    isLoading = false,
    showYearlyToggle = true,
    billingPeriod = 'monthly',
    onBillingPeriodChange,
}: PricingCardsProps) {
    const cardBg = 'bg-card';
    const cardBorder = 'border-border';
    const textPrimary = 'text-foreground';
    const textSecondary = 'text-muted-foreground';
    const textMuted = 'text-muted-foreground';
    
    // Highlighted card uses blue/indigo gradient
    const highlightedBg = 'bg-gradient-to-b from-blue-600 to-indigo-700';
    const highlightedBorder = 'border-blue-600';
    
    // Build plans array based on hide flags
    let plans: Plan[] = [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO];
    if (!hideFree) {
        plans = [PLANS.FREE, ...plans];
    }
    if (hideStarter) {
        plans = plans.filter(p => p !== PLANS.STARTER);
    }
    if (hidePro) {
        plans = plans.filter(p => p !== PLANS.PRO);
    }

    // Get action label based on plan comparison
    const getActionLabel = (targetPlan: Plan): string => {
        if (!currentPlan) return 'Upgrade';
        if (canSubscribeCurrentTrial && targetPlan === PLANS.STARTER) return 'Subscribe';
        if (currentPlan === targetPlan) return 'Current';
        if (starterTrialEligible && targetPlan === PLANS.STARTER) return 'Start Trial';
        
        const currentTier = PLAN_TIER_ORDER[currentPlan] || 0;
        const targetTier = PLAN_TIER_ORDER[targetPlan] || 0;
        
        return targetTier > currentTier ? 'Upgrade' : 'Downgrade';
    };

    // Get button classes based on variant and state
    const getButtonClass = (plan: Plan, isHighlighted: boolean, isCurrentPlan: boolean) => {
        if (isCurrentPlan) {
            return cn(
                'w-full',
                isHighlighted
                    ? 'bg-white/30 text-white cursor-default'
                    : 'bg-muted text-muted-foreground cursor-default'
            );
        }
        
        if (isHighlighted) {
            return cn(
                'w-full',
                'bg-white text-indigo-700 hover:bg-blue-50'
            );
        }
        
        return cn(
            'w-full',
            'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'
        );
    };

    const handlePlanClick = (plan: Plan) => {
        if (currentPlan === plan && !canSubscribeCurrentTrial) return;
        if (onUpgrade) {
            onUpgrade(plan);
        }
    };

    return (
        <div className="space-y-6">
            {/* Billing Period Toggle */}
            {showYearlyToggle && onBillingPeriodChange && (
                <div className="flex justify-center">
                    <div
                        role="tablist"
                        aria-label="Billing period"
                        className="inline-flex items-center rounded-lg border border-border bg-muted p-1"
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected={billingPeriod === 'monthly'}
                            onClick={() => onBillingPeriodChange('monthly')}
                            className={cn(
                                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                                billingPeriod === 'monthly'
                                    ? 'bg-background text-foreground shadow-sm border border-border'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            Monthly
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={billingPeriod === 'yearly'}
                            onClick={() => onBillingPeriodChange('yearly')}
                            className={cn(
                                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2',
                                billingPeriod === 'yearly'
                                    ? 'bg-background text-foreground shadow-sm border border-border'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            Yearly
                            <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                            >
                                Save 17%
                            </Badge>
                        </button>
                    </div>
                </div>
            )}

            {/* Pricing Cards Grid */}
            <div className={cn(
                'grid gap-6',
                plans.length === 1 ? 'md:grid-cols-1' : 'md:grid-cols-2'
            )}>
                {plans.map((planId) => {
                    const meta = PLAN_METADATA[planId];
                    const itemizeMeta = PLAN_METADATA[planId];
                    const pricing = PLAN_PRICING[planId];
                    const features = PLAN_FEATURES[planId];
                    const Icon = PLAN_ICONS[planId];
                    const isHighlighted = planId === 'unlimited';
                    const isCurrentPlan = currentPlan === planId;
                    const isConvertibleTrial =
                        canSubscribeCurrentTrial && planId === PLANS.STARTER;
                    const actionLabel = getActionLabel(planId);
                    
                    const price = billingPeriod === 'yearly' 
                        ? pricing.yearlyMonthly 
                        : pricing.monthly;
                    const originalPrice = billingPeriod === 'yearly' 
                        ? pricing.monthly 
                        : null;

                    return (
                        <div
                            key={planId}
                            className={cn(
                                'relative rounded-2xl p-6 flex flex-col border',
                                isHighlighted
                                    ? cn(highlightedBg, highlightedBorder, 'text-white')
                                    : cn(cardBg, cardBorder)
                            )}
                        >
                            {/* Popular Badge */}
                            {meta.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <Badge className="bg-amber-400 text-amber-900 font-semibold shadow-md">
                                        Most Popular
                                    </Badge>
                                </div>
                            )}

                            {/* Current Plan Badge */}
                            {isCurrentPlan && (
                                <div className="absolute -top-3 right-4">
                                    <Badge className="bg-green-500 text-white shadow-md">
                                        Current Plan
                                    </Badge>
                                </div>
                            )}

                            {/* Header */}
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <Icon className={cn(
                                        'h-6 w-6',
                                        isHighlighted
                                            ? 'text-white'
                                            : 'text-blue-600 dark:text-blue-400'
                                    )} />
                                    <h3 className={cn(
                                        'text-lg font-semibold',
                                        isHighlighted ? 'text-white' : textPrimary
                                    )}>
                                        {itemizeMeta.displayName}
                                    </h3>
                                </div>
                                
                                <div className="flex items-baseline gap-2 mt-2">
                                    {originalPrice && (
                                        <span className={cn(
                                            'text-lg line-through',
                                            isHighlighted ? 'text-blue-200' : textMuted
                                        )}>
                                            ${originalPrice}
                                        </span>
                                    )}
                                    <span className={cn(
                                        'text-3xl font-bold',
                                        isHighlighted ? 'text-white' : textPrimary
                                    )}>
                                        ${Math.round(price)}
                                    </span>
                                    <span className={cn(
                                        isHighlighted ? 'text-blue-100' : textSecondary
                                    )}>
                                        /month
                                    </span>
                                </div>
                                
                                <p className={cn(
                                    'mt-2 text-sm',
                                    isHighlighted ? 'text-blue-100' : textSecondary
                                )}>
                                    {itemizeMeta.tagline}
                                </p>
                            </div>

                            {/* Features */}
                            <ul className="space-y-3 flex-1 mb-6">
                                {features.map((feature, idx) => (
                                    <li key={idx} className="flex items-start gap-2">
                                        <Check className={cn(
                                            'h-4 w-4 mt-0.5 flex-shrink-0',
                                            isHighlighted
                                                ? 'text-blue-200'
                                                : 'text-blue-600 dark:text-blue-400'
                                        )} />
                                        <span className={cn(
                                            'text-sm',
                                            isHighlighted ? 'text-white' : textSecondary
                                        )}>
                                            {feature}
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            {/* CTA Button */}
                            <Button
                                type="button"
                                className={getButtonClass(
                                    planId,
                                    isHighlighted,
                                    isCurrentPlan && !isConvertibleTrial,
                                )}
                                onClick={() => handlePlanClick(planId)}
                                disabled={isLoading || (isCurrentPlan && !isConvertibleTrial)}
                            >
                                {isLoading ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Processing...
                                    </span>
                                ) : isConvertibleTrial ? (
                                    `Subscribe to ${itemizeMeta.name}`
                                ) : isCurrentPlan ? (
                                    'Current Plan'
                                ) : (
                                    actionLabel === 'Start Trial'
                                        ? `Start ${itemizeMeta.name} Trial`
                                        : `${actionLabel} to ${itemizeMeta.name}`
                                )}
                            </Button>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <p className={cn('text-center text-sm', textMuted)}>
                {starterTrialEligible
                    ? 'Start Solo free for 14 days. No credit card required.'
                    : 'Subscriptions are managed securely through Stripe.'}
            </p>
        </div>
    );
}

export default PricingCards;
