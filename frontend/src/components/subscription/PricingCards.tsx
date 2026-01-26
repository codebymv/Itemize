/**
 * Pricing Cards Component
 * Displays subscription plans for landing page and dashboard
 * Theme-aware design matching itemize.cloud visual language
 */

import { Check, Loader2, Zap, Crown, Building2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
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
        'Up to 10 lists, notes & whiteboards',
        '100 contacts',
        '1 team member',
        '1 automation workflow',
        '100 emails/month',
        'Basic features',
    ],
    starter: [
        'Up to 50 lists, notes & whiteboards',
        '5,000 contacts',
        '3 team members',
        '5 automation workflows',
        '1,000 emails/month',
        '500 SMS/month',
        '10 landing pages',
        '10 forms',
        '3 calendars',
        'Basic analytics',
        'Email support',
    ],
    unlimited: [
        'Unlimited lists, notes & whiteboards',
        '25,000 contacts',
        '10 team members',
        '25 automation workflows',
        '10,000 emails/month',
        '5,000 SMS/month',
        '50 landing pages',
        '50 forms',
        'Unlimited calendars',
        'API access (10K calls/day)',
        'Custom branding',
        'Custom domains',
        'Advanced analytics',
        'Priority support',
    ],
    pro: [
        'Everything in Growth, plus:',
        'Unlimited contacts',
        'Unlimited team members',
        'Unlimited workflows',
        '50,000 emails/month',
        '25,000 SMS/month',
        'Unlimited pages & forms',
        'Full API access (100K calls/day)',
        'White-label platform',
        'Client billing',
        'Mobile app branding',
        'Audit logs',
        'Dedicated support',
    ],
};

// Updated plan metadata with itemize.cloud branding
const ITEMIZE_PLAN_META: Record<Plan, {
    name: string;
    displayName: string;
    tagline: string;
}> = {
    starter: {
        name: 'Starter',
        displayName: 'Starter',
        tagline: 'Perfect for individuals & small teams',
    },
    unlimited: {
        name: 'Growth',
        displayName: 'Growth',
        tagline: 'For scaling businesses',
    },
    pro: {
        name: 'Enterprise',
        displayName: 'Enterprise',
        tagline: 'Full platform power',
    },
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
    currentPlan,
    variant = 'landing',
    onUpgrade,
    isLoading = false,
    showYearlyToggle = true,
    billingPeriod = 'monthly',
    onBillingPeriodChange,
}: PricingCardsProps) {
    const { theme } = useTheme();
    const isLight = theme === 'light';
    
    // Theme-aware colors matching Home.tsx patterns
    const cardBg = isLight ? 'bg-white' : 'bg-slate-800';
    const cardBorder = isLight ? 'border-gray-200' : 'border-slate-700';
    const textPrimary = isLight ? 'text-gray-900' : 'text-slate-100';
    const textSecondary = isLight ? 'text-gray-600' : 'text-slate-400';
    const textMuted = isLight ? 'text-gray-500' : 'text-slate-500';
    
    // Highlighted card uses blue/indigo gradient
    const highlightedBg = 'bg-gradient-to-b from-blue-600 to-indigo-700';
    const highlightedBorder = 'border-blue-500';
    
    // Build plans array based on hide flags
    let plans: Plan[] = [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO];
    if (!hideFree) {
        plans = [PLANS.FREE, ...plans];
    }
    if (hideStarter) {
        plans = plans.filter(p => p !== PLANS.STARTER);
    }

    // Get action label based on plan comparison
    const getActionLabel = (targetPlan: Plan): 'Upgrade' | 'Downgrade' | 'Current' => {
        if (!currentPlan) return 'Upgrade';
        if (currentPlan === targetPlan) return 'Current';
        
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
                    : isLight
                        ? 'bg-gray-100 text-gray-500 cursor-default'
                        : 'bg-slate-700 text-slate-400 cursor-default'
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
        if (currentPlan === plan) return;
        if (onUpgrade) {
            onUpgrade(plan);
        }
    };

    return (
        <div className="space-y-6">
            {/* Billing Period Toggle */}
            {showYearlyToggle && onBillingPeriodChange && (
                <div className="flex items-center justify-center gap-4">
                    <button
                        onClick={() => onBillingPeriodChange('monthly')}
                        className={cn(
                            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                            billingPeriod === 'monthly'
                                ? isLight 
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-blue-900/50 text-blue-300'
                                : textSecondary,
                            billingPeriod !== 'monthly' && (isLight ? 'hover:text-gray-900' : 'hover:text-slate-200')
                        )}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => onBillingPeriodChange('yearly')}
                        className={cn(
                            'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
                            billingPeriod === 'yearly'
                                ? isLight
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-blue-900/50 text-blue-300'
                                : textSecondary,
                            billingPeriod !== 'yearly' && (isLight ? 'hover:text-gray-900' : 'hover:text-slate-200')
                        )}
                    >
                        Yearly
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">
                            Save 17%
                        </Badge>
                    </button>
                </div>
            )}

            {/* Pricing Cards Grid */}
            <div className={cn(
                'grid gap-6',
                hideStarter ? 'md:grid-cols-2' : 'md:grid-cols-3'
            )}>
                {plans.map((planId) => {
                    const meta = PLAN_METADATA[planId];
                    const itemizeMeta = ITEMIZE_PLAN_META[planId];
                    const pricing = PLAN_PRICING[planId];
                    const features = PLAN_FEATURES[planId];
                    const Icon = PLAN_ICONS[planId];
                    const isHighlighted = planId === 'unlimited';
                    const isCurrentPlan = currentPlan === planId;
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
                                            : isLight 
                                                ? 'text-blue-600' 
                                                : 'text-blue-400'
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
                                                : isLight 
                                                    ? 'text-blue-600' 
                                                    : 'text-blue-400'
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
                                className={getButtonClass(planId, isHighlighted, isCurrentPlan)}
                                onClick={() => handlePlanClick(planId)}
                                disabled={isLoading || isCurrentPlan}
                            >
                                {isLoading ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Processing...
                                    </span>
                                ) : isCurrentPlan ? (
                                    'Current Plan'
                                ) : (
                                    `${actionLabel} to ${itemizeMeta.name}`
                                )}
                            </Button>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <p className={cn('text-center text-sm', textMuted)}>
                All plans include a 14-day free trial. No credit card required to start.
            </p>
        </div>
    );
}

export default PricingCards;
