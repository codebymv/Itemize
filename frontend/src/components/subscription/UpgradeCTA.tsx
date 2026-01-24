/**
 * Upgrade CTA Component
 * Reusable upgrade button with tier-appropriate icons
 * Following gleamai pattern adapted for itemize.cloud
 */

import { Link } from 'react-router-dom';
import { Zap, Crown, Building2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
    Plan, 
    PLAN_METADATA, 
    PLAN_TIER_ORDER,
    FEATURES,
    FeatureKey,
    canAccessFeature 
} from '@/lib/subscription';

// Icon mapping for tiers
const TIER_ICONS = {
    zap: Zap,
    crown: Crown,
    building: Building2,
} as const;

export interface UpgradeCTAProps {
    /** The plan required to access this feature */
    requiredPlan: Plan;
    /** Current user's plan */
    currentPlan?: Plan;
    /** Feature key for description lookup (optional) */
    feature?: FeatureKey;
    /** Custom description override */
    description?: string;
    /** Button variant */
    variant?: 'default' | 'outline' | 'ghost' | 'subtle';
    /** Button size */
    size?: 'sm' | 'default' | 'lg' | 'icon';
    /** Custom button text (default: "Upgrade to {Plan}") */
    children?: React.ReactNode;
    /** Additional CSS classes */
    className?: string;
    /** Show tooltip with feature description */
    showTooltip?: boolean;
    /** Hide if user already has access */
    hideIfAccessible?: boolean;
    /** Callback when clicked (before navigation) */
    onClick?: () => void;
}

/**
 * Reusable upgrade CTA button with tier-appropriate icons
 * 
 * Icons:
 * - ⚡ Zap: STARTER tier features
 * - 👑 Crown: UNLIMITED tier features  
 * - 🏢 Building: PRO tier features
 */
export function UpgradeCTA({
    requiredPlan,
    currentPlan = 'starter',
    feature,
    description,
    variant = 'default',
    size = 'default',
    children,
    className,
    showTooltip = false,
    hideIfAccessible = false,
    onClick,
}: UpgradeCTAProps) {
    // Check if user already has access
    const hasAccess = feature 
        ? canAccessFeature(currentPlan, feature)
        : (PLAN_TIER_ORDER[currentPlan] || 0) >= (PLAN_TIER_ORDER[requiredPlan] || 0);

    // Hide if user has access and hideIfAccessible is true
    if (hasAccess && hideIfAccessible) {
        return null;
    }

    const planMeta = PLAN_METADATA[requiredPlan];
    const IconComponent = TIER_ICONS[planMeta.icon];
    
    // Get feature description if available
    const featureData = feature ? FEATURES[feature] : undefined;
    const featureDescription = description || featureData?.description;

    // Button text
    const buttonText = children || `Upgrade to ${planMeta.name}`;

    // Style variants - using blue/indigo to match itemize.cloud theme
    const variantStyles: Record<string, string> = {
        default: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white',
        outline: cn('border-2 bg-transparent hover:bg-opacity-10', planMeta.borderColor, planMeta.color),
        ghost: cn('hover:bg-opacity-10', planMeta.color),
        subtle: cn(planMeta.bgColor, planMeta.color, 'hover:opacity-80'),
    };

    return (
        <Link 
            to="/settings?tab=billing"
            onClick={onClick}
            title={showTooltip && featureDescription ? `${featureDescription} - Available on ${planMeta.name} and above` : undefined}
        >
            <Button
                size={size}
                className={cn(
                    variantStyles[variant],
                    'transition-all duration-200',
                    className
                )}
            >
                <IconComponent className={cn(
                    'flex-shrink-0',
                    size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4',
                    size !== 'icon' && 'mr-2'
                )} />
                {size !== 'icon' && buttonText}
            </Button>
        </Link>
    );
}

/**
 * Locked feature badge with upgrade CTA
 */
export interface LockedFeatureBadgeProps {
    requiredPlan: Plan;
    currentPlan?: Plan;
    feature?: FeatureKey;
    label?: string;
}

export function LockedFeatureBadge({
    requiredPlan,
    currentPlan = 'starter',
    feature,
    label,
}: LockedFeatureBadgeProps) {
    const planMeta = PLAN_METADATA[requiredPlan];
    const IconComponent = TIER_ICONS[planMeta.icon];
    const featureData = feature ? FEATURES[feature] : undefined;
    const featureLabel = label || featureData?.label || 'Premium Feature';

    return (
        <div className={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
            planMeta.bgColor,
            planMeta.color
        )}>
            <Lock className="h-3 w-3" />
            <span>{featureLabel}</span>
            <IconComponent className="h-3 w-3" />
        </div>
    );
}

/**
 * Full upgrade prompt card for gated features
 */
export interface UpgradePromptCardProps {
    requiredPlan: Plan;
    currentPlan?: Plan;
    feature?: FeatureKey;
    title?: string;
    description?: string;
    className?: string;
}

export function UpgradePromptCard({
    requiredPlan,
    currentPlan = 'starter',
    feature,
    title,
    description,
    className,
}: UpgradePromptCardProps) {
    const planMeta = PLAN_METADATA[requiredPlan];
    const IconComponent = TIER_ICONS[planMeta.icon];
    
    const featureData = feature ? FEATURES[feature] : undefined;
    const promptTitle = title || (featureData 
        ? `Upgrade to Access ${featureData.label}` 
        : 'Upgrade Required');
    const promptDescription = description || featureData?.description || 
        `This feature requires the ${planMeta.name} plan or higher.`;

    return (
        <div className={cn(
            'flex flex-col items-center text-center space-y-4 p-6 bg-muted/30 rounded-lg border border-dashed',
            className
        )}>
            <div className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center',
                planMeta.bgColor
            )}>
                <IconComponent className={cn('h-8 w-8', planMeta.color)} />
            </div>
            <div className="space-y-2">
                <h3 className="text-xl font-semibold">{promptTitle}</h3>
                <p className="text-muted-foreground max-w-md">{promptDescription}</p>
            </div>
            <UpgradeCTA 
                requiredPlan={requiredPlan} 
                currentPlan={currentPlan}
                feature={feature}
            />
            <p className="text-xs text-muted-foreground">
                Available on {planMeta.name}{requiredPlan !== 'pro' ? ' and above' : ''}
            </p>
        </div>
    );
}

// Export for use in toasts and other components
export { TIER_ICONS, PLAN_METADATA };

export default UpgradeCTA;
