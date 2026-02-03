/**
 * Subscription Configuration
 * Frontend constants and utilities for subscription management
 * Following gleamai pattern
 */

// ============================================
// Plan Definitions
// ============================================

export type Plan = 'free' | 'starter' | 'unlimited' | 'pro';

export const PLANS = {
    FREE: 'free' as Plan,
    STARTER: 'starter' as Plan,
    UNLIMITED: 'unlimited' as Plan,
    PRO: 'pro' as Plan
};

/**
 * Plan tier order for comparison (higher = better)
 */
export const PLAN_TIER_ORDER: Record<Plan, number> = {
    free: 0,
    starter: 1,
    unlimited: 2,
    pro: 3
};

/**
 * Plan metadata for UI
 */
export const PLAN_METADATA: Record<Plan, {
    name: string;
    displayName: string;
    tagline: string;
    description: string;
    icon: 'user' | 'zap' | 'crown' | 'building';
    color: string;
    bgColor: string;
    borderColor: string;
    popular?: boolean;
}> = {
    free: {
        name: 'Free',
        displayName: 'Free',
        tagline: 'Get started for free',
        description: 'Basic features to try out the platform.',
        icon: 'user',
        color: 'text-slate-600',
        bgColor: 'bg-slate-50',
        borderColor: 'border-slate-300'
    },
    starter: {
        name: 'Starter',
        displayName: 'Starter',
        tagline: 'Perfect for individuals & small teams',
        description: 'Everything you need to get organized with lists, notes, and basic automation.',
        icon: 'zap',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-300'
    },
    unlimited: {
        name: 'Growth',
        displayName: 'Growth',
        tagline: 'For scaling businesses',
        description: 'Scale your operations with unlimited organization, advanced workflows, and API access.',
        icon: 'crown',
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50',
        borderColor: 'border-indigo-300',
        popular: true
    },
    pro: {
        name: 'Enterprise',
        displayName: 'Enterprise',
        tagline: 'Full platform power',
        description: 'Complete platform control with white-labeling, unlimited everything, and dedicated support.',
        icon: 'building',
        color: 'text-blue-700',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-400'
    }
};

/**
 * Plan pricing (based on GHL)
 */
export const PLAN_PRICING: Record<Plan, {
    monthly: number;
    yearly: number;
    yearlyMonthly: number;
    stripePriceIdMonthly?: string;
    stripePriceIdYearly?: string;
}> = {
    free: {
        monthly: 0,
        yearly: 0,
        yearlyMonthly: 0
    },
    starter: {
        monthly: 97,
        yearly: 970,
        yearlyMonthly: 80.83,
        stripePriceIdMonthly: 'price_1SthTHRxBJaRlFvtGlxgpg2n',
        // stripePriceIdYearly: 'price_yearly_starter' // Add when created
    },
    unlimited: {
        monthly: 297,
        yearly: 2970,
        yearlyMonthly: 247.50,
        stripePriceIdMonthly: 'price_1SthTwRxBJaRlFvtg32SqjGf',
        // stripePriceIdYearly: 'price_yearly_unlimited' // Add when created
    },
    pro: {
        monthly: 497,
        yearly: 4970,
        yearlyMonthly: 414.17,
        stripePriceIdMonthly: 'price_1SthUKRxBJaRlFvt2dc5DnSi',
        // stripePriceIdYearly: 'price_yearly_pro' // Add when created
    }
};

// ============================================
// Feature Definitions
// ============================================

export type FeatureKey = 
    | 'CONTACTS' | 'PIPELINES' | 'CALENDARS' | 'FORMS' | 'LANDING_PAGES'
    | 'EMAIL_TEMPLATES' | 'SMS_TEMPLATES' | 'CONVERSATIONS' | 'BASIC_AUTOMATION'
    | 'REPUTATION' | 'INVOICING' | 'SIGNATURE_DOCUMENTS' | 'BASIC_ANALYTICS'
    | 'API_ACCESS' | 'ADVANCED_WORKFLOWS' | 'UNLIMITED_ORGS' | 'WHITE_LABEL'
    | 'CUSTOM_DOMAINS' | 'ADVANCED_ANALYTICS' | 'TEAM_ROLES' | 'WEBHOOKS' | 'SOCIAL_INTEGRATION'
    | 'SAAS_MODE' | 'CLIENT_BILLING' | 'MOBILE_WHITE_LABEL' | 'PRIORITY_SUPPORT'
    | 'DEDICATED_SUPPORT' | 'CUSTOM_INTEGRATIONS' | 'FULL_API_ACCESS' | 'AUDIT_LOGS';

interface FeatureDefinition {
    allowedPlans: Plan[];
    label: string;
    description: string;
    limit?: Record<Plan, number>;
}

export const FEATURES: Record<FeatureKey, FeatureDefinition> = {
    // Core Features (All Plans)
    CONTACTS: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'Contact Management',
        description: 'Create and manage contacts, tags, and custom fields'
    },
    PIPELINES: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'Sales Pipelines',
        description: 'Manage deals through customizable sales stages'
    },
    CALENDARS: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'Calendars & Bookings',
        description: 'Schedule appointments and accept online bookings'
    },
    FORMS: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'Form Builder',
        description: 'Create forms to capture leads and information'
    },
    LANDING_PAGES: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'Landing Pages',
        description: 'Build and publish landing pages'
    },
    EMAIL_TEMPLATES: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'Email Templates',
        description: 'Create reusable email templates'
    },
    SMS_TEMPLATES: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'SMS Templates',
        description: 'Create reusable SMS templates'
    },
    CONVERSATIONS: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'Unified Inbox',
        description: 'Manage all conversations in one place'
    },
    BASIC_AUTOMATION: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'Basic Automation',
        description: 'Simple trigger-based automations'
    },
    REPUTATION: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'Reputation Management',
        description: 'Manage reviews and reputation'
    },
    INVOICING: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'Invoicing',
        description: 'Create and send invoices'
    },
    SIGNATURE_DOCUMENTS: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'E-Signatures',
        description: 'Send documents for electronic signature',
        limit: {
            starter: 5,
            unlimited: 50,
            pro: Infinity,
            free: 0
        }
    },
    BASIC_ANALYTICS: {
        allowedPlans: ['starter', 'unlimited', 'pro'],
        label: 'Basic Analytics',
        description: 'View basic performance metrics'
    },

    // Advanced Features (Unlimited+)
    API_ACCESS: {
        allowedPlans: ['unlimited', 'pro'],
        label: 'API Access',
        description: 'Access REST API for custom integrations'
    },
    ADVANCED_WORKFLOWS: {
        allowedPlans: ['unlimited', 'pro'],
        label: 'Advanced Workflows',
        description: 'Complex multi-step automation workflows',
        limit: {
            starter: 5,
            unlimited: 25,
            pro: Infinity
        }
    },
    UNLIMITED_ORGS: {
        allowedPlans: ['unlimited', 'pro'],
        label: 'Unlimited Organizations',
        description: 'Create unlimited sub-accounts'
    },
    WHITE_LABEL: {
        allowedPlans: ['unlimited', 'pro'],
        label: 'White Label',
        description: 'Custom branding and domains'
    },
    CUSTOM_DOMAINS: {
        allowedPlans: ['unlimited', 'pro'],
        label: 'Custom Domains',
        description: 'Use your own domain for pages and forms'
    },
    ADVANCED_ANALYTICS: {
        allowedPlans: ['unlimited', 'pro'],
        label: 'Advanced Analytics',
        description: 'Detailed reports and custom dashboards'
    },
    TEAM_ROLES: {
        allowedPlans: ['unlimited', 'pro'],
        label: 'Team Roles',
        description: 'Granular team permissions and roles'
    },
    WEBHOOKS: {
        allowedPlans: ['unlimited', 'pro'],
        label: 'Webhooks',
        description: 'Send data to external services'
    },
    SOCIAL_INTEGRATION: {
        allowedPlans: ['unlimited', 'pro'],
        label: 'Social Media Integration',
        description: 'Connect and manage social accounts'
    },

    // Pro Features (SaaS Pro Only)
    SAAS_MODE: {
        allowedPlans: ['pro'],
        label: 'SaaS Mode',
        description: 'Resell the platform as your own SaaS'
    },
    CLIENT_BILLING: {
        allowedPlans: ['pro'],
        label: 'Client Billing',
        description: 'Automatically bill your clients'
    },
    MOBILE_WHITE_LABEL: {
        allowedPlans: ['pro'],
        label: 'Mobile App White Label',
        description: 'Your branded mobile app'
    },
    PRIORITY_SUPPORT: {
        allowedPlans: ['pro'],
        label: 'Priority Support',
        description: '24/7 priority support'
    },
    DEDICATED_SUPPORT: {
        allowedPlans: ['pro'],
        label: 'Dedicated Support',
        description: 'Dedicated account manager'
    },
    CUSTOM_INTEGRATIONS: {
        allowedPlans: ['pro'],
        label: 'Custom Integrations',
        description: 'Build custom integrations'
    },
    FULL_API_ACCESS: {
        allowedPlans: ['pro'],
        label: 'Full API Access',
        description: 'Higher rate limits and advanced endpoints'
    },
    AUDIT_LOGS: {
        allowedPlans: ['pro'],
        label: 'Audit Logs',
        description: 'Complete activity audit trail'
    }
};

// ============================================
// Helper Functions
// ============================================

/**
 * Get the minimum required plan for a feature
 */
export function getRequiredPlan(featureKey: FeatureKey): Plan {
    const feature = FEATURES[featureKey];
    if (feature.allowedPlans.length > 0) {
        const planOrder: Plan[] = ['free', 'starter', 'unlimited', 'pro'];
        for (const plan of planOrder) {
            if (feature.allowedPlans.includes(plan)) {
                return plan;
            }
        }
    }
    return 'starter';
}

/**
 * Get the next upgrade plan for a user
 */
export function getNextUpgradePlan(currentPlan: Plan): Plan | null {
    const planOrder: Plan[] = ['free', 'starter', 'unlimited', 'pro'];
    const currentIndex = planOrder.indexOf(currentPlan);
    if (currentIndex < planOrder.length - 1) {
        return planOrder[currentIndex + 1];
    }
    return null;
}

/**
 * Check if a feature is available for a plan
 */
export function canAccessFeature(plan: Plan | string, featureKey: FeatureKey): boolean {
    const feature = FEATURES[featureKey];
    return feature.allowedPlans.includes(plan as Plan);
}

/**
 * Get feature limit for a specific plan
 */
export function getFeatureLimit(plan: Plan, featureKey: FeatureKey): number {
    const feature = FEATURES[featureKey];
    if (feature.limit) {
        return feature.limit[plan] ?? 0;
    }
    return Infinity;
}

/**
 * Get plan tier level
 */
export function getPlanTier(plan: Plan): number {
    return PLAN_TIER_ORDER[plan] || 0;
}

/**
 * Compare two plans
 * @returns -1 if plan1 < plan2, 0 if equal, 1 if plan1 > plan2
 */
export function comparePlans(plan1: Plan, plan2: Plan): number {
    const tier1 = getPlanTier(plan1);
    const tier2 = getPlanTier(plan2);
    if (tier1 < tier2) return -1;
    if (tier1 > tier2) return 1;
    return 0;
}

/**
 * Calculate yearly savings percentage
 */
export function getYearlySavings(plan: Plan): number {
    const pricing = PLAN_PRICING[plan];
    const monthlyTotal = pricing.monthly * 12;
    const savings = ((monthlyTotal - pricing.yearly) / monthlyTotal) * 100;
    return Math.round(savings);
}

/**
 * Format price for display
 */
export function formatPrice(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
    }).format(amount);
}

/**
 * Check if usage is within limits
 */
export function isWithinLimit(used: number, limit: number | 'unlimited'): boolean {
    if (limit === 'unlimited' || limit === -1) return true;
    return used < limit;
}

/**
 * Calculate usage percentage
 */
export function getUsagePercentage(used: number, limit: number | 'unlimited'): number {
    if (limit === 'unlimited' || limit === -1) return 0;
    return Math.min(Math.round((used / limit) * 100), 100);
}
