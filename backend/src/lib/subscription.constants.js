/**
 * Subscription Constants
 * Centralized configuration for plans, limits, features, and Stripe mappings
 * Based on GoHighLevel pricing model
 */

// ============================================
// Plan Definitions
// ============================================

/**
 * Plan enum values
 */
const PLANS = {
    FREE: 'free',
    STARTER: 'starter',
    UNLIMITED: 'unlimited',
    PRO: 'pro'
};

/**
 * Plan tier order for comparison (higher = better)
 */
const PLAN_TIER_ORDER = {
    [PLANS.FREE]: 0,
    [PLANS.STARTER]: 1,
    [PLANS.UNLIMITED]: 2,
    [PLANS.PRO]: 3
};

/**
 * Plan metadata for UI
 */
const PLAN_METADATA = {
    [PLANS.STARTER]: {
        name: 'Starter',
        displayName: 'Starter',
        tagline: 'Perfect for individuals & small teams',
        description: 'Everything you need to get organized with lists, notes, and basic automation.',
        icon: 'zap',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-300'
    },
    [PLANS.UNLIMITED]: {
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
    [PLANS.PRO]: {
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
const PLAN_PRICING = {
    [PLANS.STARTER]: {
        monthly: 97,
        yearly: 970,
        yearlyMonthly: 80.83
    },
    [PLANS.UNLIMITED]: {
        monthly: 297,
        yearly: 2970,
        yearlyMonthly: 247.50
    },
    [PLANS.PRO]: {
        monthly: 497,
        yearly: 4970,
        yearlyMonthly: 414.17
    }
};

// ============================================
// Stripe Price Mappings
// ============================================

/**
 * Map Stripe price IDs to plans
 * Update these with your actual Stripe price IDs
 */
const STRIPE_PRICE_TO_PLAN = {
    // Monthly prices
    'price_starter_monthly': PLANS.STARTER,
    'price_unlimited_monthly': PLANS.UNLIMITED,
    'price_pro_monthly': PLANS.PRO,
    // Yearly prices
    'price_starter_yearly': PLANS.STARTER,
    'price_unlimited_yearly': PLANS.UNLIMITED,
    'price_pro_yearly': PLANS.PRO
};

/**
 * Get plan from Stripe price ID
 */
const PLAN_TO_STRIPE_PRICES = {
    [PLANS.STARTER]: {
        monthly: 'price_starter_monthly',
        yearly: 'price_starter_yearly'
    },
    [PLANS.UNLIMITED]: {
        monthly: 'price_unlimited_monthly',
        yearly: 'price_unlimited_yearly'
    },
    [PLANS.PRO]: {
        monthly: 'price_pro_monthly',
        yearly: 'price_pro_yearly'
    }
};

// ============================================
// Usage Limits
// ============================================

/**
 * Organization limits per plan
 * -1 = unlimited
 */
const ORGANIZATION_LIMITS = {
    [PLANS.STARTER]: 3,
    [PLANS.UNLIMITED]: Infinity,
    [PLANS.PRO]: Infinity
};

/**
 * Contacts per organization limits
 */
const CONTACTS_LIMITS = {
    [PLANS.STARTER]: 5000,
    [PLANS.UNLIMITED]: 25000,
    [PLANS.PRO]: Infinity
};

/**
 * Users per organization limits
 */
const USERS_LIMITS = {
    [PLANS.STARTER]: 3,
    [PLANS.UNLIMITED]: 10,
    [PLANS.PRO]: Infinity
};

/**
 * Workflow limits
 */
const WORKFLOW_LIMITS = {
    [PLANS.STARTER]: 5,
    [PLANS.UNLIMITED]: 25,
    [PLANS.PRO]: Infinity
};

/**
 * Emails per month limits
 */
const EMAIL_LIMITS = {
    [PLANS.STARTER]: 1000,
    [PLANS.UNLIMITED]: 10000,
    [PLANS.PRO]: 50000
};

/**
 * SMS per month limits
 */
const SMS_LIMITS = {
    [PLANS.STARTER]: 500,
    [PLANS.UNLIMITED]: 5000,
    [PLANS.PRO]: 25000
};

/**
 * Landing page limits
 */
const LANDING_PAGE_LIMITS = {
    [PLANS.STARTER]: 10,
    [PLANS.UNLIMITED]: 50,
    [PLANS.PRO]: Infinity
};

/**
 * Form limits
 */
const FORM_LIMITS = {
    [PLANS.STARTER]: 10,
    [PLANS.UNLIMITED]: 50,
    [PLANS.PRO]: Infinity
};

/**
 * Calendar limits
 */
const CALENDAR_LIMITS = {
    [PLANS.STARTER]: 3,
    [PLANS.UNLIMITED]: Infinity,
    [PLANS.PRO]: Infinity
};

/**
 * Signature documents per month limits
 */
const SIGNATURE_LIMITS = {
    [PLANS.STARTER]: 5,
    [PLANS.UNLIMITED]: 50,
    [PLANS.PRO]: Infinity
};

/**
 * API calls per day limits
 */
const API_LIMITS = {
    [PLANS.STARTER]: 0,  // No API access
    [PLANS.UNLIMITED]: 10000,
    [PLANS.PRO]: 100000
};

/**
 * Storage limits in MB
 */
const STORAGE_LIMITS = {
    [PLANS.STARTER]: 1024,    // 1GB
    [PLANS.UNLIMITED]: 10240, // 10GB
    [PLANS.PRO]: Infinity
};

// ============================================
// Feature Definitions
// ============================================

/**
 * Features with allowed plans
 * Based on gleamai pattern - feature keys with allowedPlans arrays
 */
const FEATURES = {
    // Core Features (All Plans)
    CONTACTS: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'Contact Management',
        description: 'Create and manage contacts, tags, and custom fields'
    },
    PIPELINES: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'Sales Pipelines',
        description: 'Manage deals through customizable sales stages'
    },
    CALENDARS: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'Calendars & Bookings',
        description: 'Schedule appointments and accept online bookings'
    },
    FORMS: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'Form Builder',
        description: 'Create forms to capture leads and information'
    },
    LANDING_PAGES: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'Landing Pages',
        description: 'Build and publish landing pages'
    },
    EMAIL_TEMPLATES: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'Email Templates',
        description: 'Create reusable email templates'
    },
    SMS_TEMPLATES: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'SMS Templates',
        description: 'Create reusable SMS templates'
    },
    CONVERSATIONS: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'Unified Inbox',
        description: 'Manage all conversations in one place'
    },
    BASIC_AUTOMATION: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'Basic Automation',
        description: 'Simple trigger-based automations'
    },
    REPUTATION: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'Reputation Management',
        description: 'Manage reviews and reputation'
    },
    INVOICING: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'Invoicing',
        description: 'Create and send invoices'
    },
    SIGNATURE_DOCUMENTS: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'E-Signatures',
        description: 'Send documents for electronic signature'
    },
    BASIC_ANALYTICS: {
        allowedPlans: [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO],
        label: 'Basic Analytics',
        description: 'View basic performance metrics'
    },

    // Advanced Features (Unlimited+)
    API_ACCESS: {
        allowedPlans: [PLANS.UNLIMITED, PLANS.PRO],
        label: 'API Access',
        description: 'Access REST API for custom integrations'
    },
    ADVANCED_WORKFLOWS: {
        allowedPlans: [PLANS.UNLIMITED, PLANS.PRO],
        label: 'Advanced Workflows',
        description: 'Complex multi-step automation workflows'
    },
    UNLIMITED_ORGS: {
        allowedPlans: [PLANS.UNLIMITED, PLANS.PRO],
        label: 'Unlimited Organizations',
        description: 'Create unlimited sub-accounts'
    },
    WHITE_LABEL: {
        allowedPlans: [PLANS.UNLIMITED, PLANS.PRO],
        label: 'White Label',
        description: 'Custom branding and domains'
    },
    CUSTOM_DOMAINS: {
        allowedPlans: [PLANS.UNLIMITED, PLANS.PRO],
        label: 'Custom Domains',
        description: 'Use your own domain for pages and forms'
    },
    ADVANCED_ANALYTICS: {
        allowedPlans: [PLANS.UNLIMITED, PLANS.PRO],
        label: 'Advanced Analytics',
        description: 'Detailed reports and custom dashboards'
    },
    TEAM_ROLES: {
        allowedPlans: [PLANS.UNLIMITED, PLANS.PRO],
        label: 'Team Roles',
        description: 'Granular team permissions and roles'
    },
    WEBHOOKS: {
        allowedPlans: [PLANS.UNLIMITED, PLANS.PRO],
        label: 'Webhooks',
        description: 'Send data to external services'
    },
    SOCIAL_INTEGRATION: {
        allowedPlans: [PLANS.UNLIMITED, PLANS.PRO],
        label: 'Social Media Integration',
        description: 'Connect and manage social accounts'
    },

    // Pro Features (SaaS Pro Only)
    SAAS_MODE: {
        allowedPlans: [PLANS.PRO],
        label: 'SaaS Mode',
        description: 'Resell the platform as your own SaaS'
    },
    CLIENT_BILLING: {
        allowedPlans: [PLANS.PRO],
        label: 'Client Billing',
        description: 'Automatically bill your clients'
    },
    MOBILE_WHITE_LABEL: {
        allowedPlans: [PLANS.PRO],
        label: 'Mobile App White Label',
        description: 'Your branded mobile app'
    },
    PRIORITY_SUPPORT: {
        allowedPlans: [PLANS.PRO],
        label: 'Priority Support',
        description: '24/7 priority support'
    },
    DEDICATED_SUPPORT: {
        allowedPlans: [PLANS.PRO],
        label: 'Dedicated Support',
        description: 'Dedicated account manager'
    },
    CUSTOM_INTEGRATIONS: {
        allowedPlans: [PLANS.PRO],
        label: 'Custom Integrations',
        description: 'Build custom integrations'
    },
    FULL_API_ACCESS: {
        allowedPlans: [PLANS.PRO],
        label: 'Full API Access',
        description: 'Higher rate limits and advanced endpoints'
    },
    AUDIT_LOGS: {
        allowedPlans: [PLANS.PRO],
        label: 'Audit Logs',
        description: 'Complete activity audit trail'
    }
};

// ============================================
// Trial Configuration
// ============================================

const TRIAL_CONFIG = {
    defaultDays: 14,
    extendedDays: 30,
    trialPlan: PLANS.PRO  // Trial gets Pro features
};

// ============================================
// Error Codes
// ============================================

const ERROR_CODES = {
    PLAN_LIMIT_REACHED: 'PLAN_LIMIT_REACHED',
    FEATURE_NOT_AVAILABLE: 'FEATURE_NOT_AVAILABLE',
    SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
    SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
    PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
    UPGRADE_REQUIRED: 'UPGRADE_REQUIRED'
};

// ============================================
// Helper Functions
// ============================================

/**
 * Get plan tier level
 */
function getPlanTier(plan) {
    return PLAN_TIER_ORDER[plan] || 0;
}

/**
 * Compare two plans
 * @returns {number} -1 if plan1 < plan2, 0 if equal, 1 if plan1 > plan2
 */
function comparePlans(plan1, plan2) {
    const tier1 = getPlanTier(plan1);
    const tier2 = getPlanTier(plan2);
    if (tier1 < tier2) return -1;
    if (tier1 > tier2) return 1;
    return 0;
}

/**
 * Check if a feature is available for a plan
 */
function canAccessFeature(plan, featureKey) {
    const feature = FEATURES[featureKey];
    if (!feature) return false;
    return feature.allowedPlans.includes(plan);
}

/**
 * Get the minimum required plan for a feature
 */
function getRequiredPlan(featureKey) {
    const feature = FEATURES[featureKey];
    if (!feature || !feature.allowedPlans.length) return null;
    
    const planOrder = [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO];
    for (const plan of planOrder) {
        if (feature.allowedPlans.includes(plan)) {
            return plan;
        }
    }
    return null;
}

/**
 * Get next upgrade plan
 */
function getNextUpgradePlan(currentPlan) {
    const planOrder = [PLANS.STARTER, PLANS.UNLIMITED, PLANS.PRO];
    const currentIndex = planOrder.indexOf(currentPlan);
    if (currentIndex < planOrder.length - 1) {
        return planOrder[currentIndex + 1];
    }
    return null;
}

/**
 * Check if usage is within limits
 * @param {string} plan - Current plan
 * @param {string} limitType - Type of limit (from limit constants)
 * @param {number} currentUsage - Current usage count
 * @param {Object} limits - Limit object (e.g., CONTACTS_LIMITS)
 */
function isWithinLimit(plan, currentUsage, limits) {
    const limit = limits[plan];
    if (limit === Infinity || limit === -1) return true;
    return currentUsage < limit;
}

/**
 * Get limit for a plan
 */
function getLimit(plan, limits) {
    const limit = limits[plan];
    if (limit === Infinity) return -1; // -1 represents unlimited
    return limit || 0;
}

/**
 * Get plan from Stripe price ID
 */
function getPlanFromStripePrice(priceId) {
    return STRIPE_PRICE_TO_PLAN[priceId] || null;
}

/**
 * Get Stripe price ID for plan
 */
function getStripePriceId(plan, billingPeriod = 'monthly') {
    const prices = PLAN_TO_STRIPE_PRICES[plan];
    return prices ? prices[billingPeriod] : null;
}

/**
 * Get all plans with full details
 */
function getAllPlans() {
    return Object.values(PLANS).map(plan => ({
        id: plan,
        ...PLAN_METADATA[plan],
        pricing: PLAN_PRICING[plan],
        tier: PLAN_TIER_ORDER[plan],
        limits: {
            organizations: ORGANIZATION_LIMITS[plan],
            contacts: CONTACTS_LIMITS[plan],
            users: USERS_LIMITS[plan],
            workflows: WORKFLOW_LIMITS[plan],
            emails: EMAIL_LIMITS[plan],
            sms: SMS_LIMITS[plan],
            landingPages: LANDING_PAGE_LIMITS[plan],
            forms: FORM_LIMITS[plan],
            calendars: CALENDAR_LIMITS[plan],
            signatures: SIGNATURE_LIMITS[plan],
            apiCalls: API_LIMITS[plan],
            storage: STORAGE_LIMITS[plan]
        }
    }));
}

module.exports = {
    // Plan definitions
    PLANS,
    PLAN_TIER_ORDER,
    PLAN_METADATA,
    PLAN_PRICING,
    
    // Stripe mappings
    STRIPE_PRICE_TO_PLAN,
    PLAN_TO_STRIPE_PRICES,
    
    // Usage limits
    ORGANIZATION_LIMITS,
    CONTACTS_LIMITS,
    USERS_LIMITS,
    WORKFLOW_LIMITS,
    EMAIL_LIMITS,
    SMS_LIMITS,
    LANDING_PAGE_LIMITS,
    FORM_LIMITS,
    CALENDAR_LIMITS,
    SIGNATURE_LIMITS,
    API_LIMITS,
    STORAGE_LIMITS,
    
    // Features
    FEATURES,
    
    // Trial config
    TRIAL_CONFIG,
    
    // Error codes
    ERROR_CODES,
    
    // Helper functions
    getPlanTier,
    comparePlans,
    canAccessFeature,
    getRequiredPlan,
    getNextUpgradePlan,
    isWithinLimit,
    getLimit,
    getPlanFromStripePrice,
    getStripePriceId,
    getAllPlans
};
