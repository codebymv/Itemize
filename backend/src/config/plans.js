/**
 * @deprecated Use ../lib/subscription.constants.js instead
 * This file is kept for backward compatibility.
 * 
 * Subscription Plans Configuration
 * Defines pricing tiers, usage limits, and plan details
 */

/**
 * Plan names/identifiers
 */
const PLAN_NAMES = {
    STARTER: 'starter',
    UNLIMITED: 'unlimited',
    PRO: 'pro'
};

/**
 * Tier levels for comparison
 */
const TIER_LEVELS = {
    [PLAN_NAMES.STARTER]: 1,
    [PLAN_NAMES.UNLIMITED]: 2,
    [PLAN_NAMES.PRO]: 3
};

/**
 * Usage limit keys
 */
const USAGE_TYPES = {
    ORGANIZATIONS: 'organizations',
    CONTACTS_PER_ORG: 'contacts_per_org',
    USERS_PER_ORG: 'users_per_org',
    WORKFLOWS: 'workflows',
    EMAILS_PER_MONTH: 'emails_per_month',
    SMS_PER_MONTH: 'sms_per_month',
    LANDING_PAGES: 'landing_pages',
    API_CALLS_PER_DAY: 'api_calls_per_day',
    STORAGE_MB: 'storage_mb',
    FORMS: 'forms',
    CALENDARS: 'calendars'
};

/**
 * Usage limits by plan
 * -1 means unlimited
 */
const USAGE_LIMITS = {
    [PLAN_NAMES.STARTER]: {
        [USAGE_TYPES.ORGANIZATIONS]: 3,
        [USAGE_TYPES.CONTACTS_PER_ORG]: 5000,
        [USAGE_TYPES.USERS_PER_ORG]: 3,
        [USAGE_TYPES.WORKFLOWS]: 5,
        [USAGE_TYPES.EMAILS_PER_MONTH]: 1000,
        [USAGE_TYPES.SMS_PER_MONTH]: 500,
        [USAGE_TYPES.LANDING_PAGES]: 10,
        [USAGE_TYPES.API_CALLS_PER_DAY]: 0, // No API access
        [USAGE_TYPES.STORAGE_MB]: 1024, // 1GB
        [USAGE_TYPES.FORMS]: 10,
        [USAGE_TYPES.CALENDARS]: 3
    },
    [PLAN_NAMES.UNLIMITED]: {
        [USAGE_TYPES.ORGANIZATIONS]: -1, // Unlimited
        [USAGE_TYPES.CONTACTS_PER_ORG]: 25000,
        [USAGE_TYPES.USERS_PER_ORG]: 10,
        [USAGE_TYPES.WORKFLOWS]: 25,
        [USAGE_TYPES.EMAILS_PER_MONTH]: 10000,
        [USAGE_TYPES.SMS_PER_MONTH]: 5000,
        [USAGE_TYPES.LANDING_PAGES]: 50,
        [USAGE_TYPES.API_CALLS_PER_DAY]: 10000,
        [USAGE_TYPES.STORAGE_MB]: 10240, // 10GB
        [USAGE_TYPES.FORMS]: 50,
        [USAGE_TYPES.CALENDARS]: -1
    },
    [PLAN_NAMES.PRO]: {
        [USAGE_TYPES.ORGANIZATIONS]: -1,
        [USAGE_TYPES.CONTACTS_PER_ORG]: -1,
        [USAGE_TYPES.USERS_PER_ORG]: -1,
        [USAGE_TYPES.WORKFLOWS]: -1,
        [USAGE_TYPES.EMAILS_PER_MONTH]: 50000,
        [USAGE_TYPES.SMS_PER_MONTH]: 25000,
        [USAGE_TYPES.LANDING_PAGES]: -1,
        [USAGE_TYPES.API_CALLS_PER_DAY]: 100000,
        [USAGE_TYPES.STORAGE_MB]: -1, // Unlimited
        [USAGE_TYPES.FORMS]: -1,
        [USAGE_TYPES.CALENDARS]: -1
    }
};

/**
 * Plan pricing
 */
const PRICING = {
    [PLAN_NAMES.STARTER]: {
        monthly: 97.00,
        yearly: 970.00, // ~16% savings (2 months free)
        yearlyMonthly: 80.83 // Per month when billed yearly
    },
    [PLAN_NAMES.UNLIMITED]: {
        monthly: 297.00,
        yearly: 2970.00,
        yearlyMonthly: 247.50
    },
    [PLAN_NAMES.PRO]: {
        monthly: 497.00,
        yearly: 4970.00,
        yearlyMonthly: 414.17
    }
};

/**
 * Plan display information
 */
const PLAN_INFO = {
    [PLAN_NAMES.STARTER]: {
        displayName: 'Starter',
        tagline: 'Perfect for solo operators',
        description: 'Everything you need to get started with CRM, marketing, and automation.',
        color: '#3B82F6', // Blue
        popular: false
    },
    [PLAN_NAMES.UNLIMITED]: {
        displayName: 'Agency Unlimited',
        tagline: 'For growing agencies',
        description: 'Scale your agency with unlimited sub-accounts, API access, and white-labeling.',
        color: '#8B5CF6', // Purple
        popular: true
    },
    [PLAN_NAMES.PRO]: {
        displayName: 'SaaS Pro',
        tagline: 'Build your own SaaS',
        description: 'Resell the platform as your own with custom billing and full white-label.',
        color: '#F59E0B', // Amber
        popular: false
    }
};

/**
 * Trial configuration
 */
const TRIAL_CONFIG = {
    defaultDays: 14,
    extendedDays: 30, // For promotions
    features: PLAN_NAMES.PRO // Trial gets Pro features
};

/**
 * Get the usage limit for a plan and resource
 * @param {string} planName - The plan name
 * @param {string} resourceType - The resource type
 * @returns {number} The limit (-1 for unlimited, 0 for not allowed)
 */
const getUsageLimit = (planName, resourceType) => {
    const planLimits = USAGE_LIMITS[planName];
    if (!planLimits) return 0;
    return planLimits[resourceType] ?? 0;
};

/**
 * Check if usage is unlimited for a plan and resource
 * @param {string} planName - The plan name
 * @param {string} resourceType - The resource type
 * @returns {boolean} True if unlimited
 */
const isUnlimited = (planName, resourceType) => {
    return getUsageLimit(planName, resourceType) === -1;
};

/**
 * Get tier level for a plan
 * @param {string} planName - The plan name
 * @returns {number} Tier level (1-3)
 */
const getTierLevel = (planName) => {
    return TIER_LEVELS[planName] || 0;
};

/**
 * Compare two plans
 * @param {string} plan1 - First plan name
 * @param {string} plan2 - Second plan name
 * @returns {number} -1 if plan1 < plan2, 0 if equal, 1 if plan1 > plan2
 */
const comparePlans = (plan1, plan2) => {
    const tier1 = getTierLevel(plan1);
    const tier2 = getTierLevel(plan2);
    if (tier1 < tier2) return -1;
    if (tier1 > tier2) return 1;
    return 0;
};

/**
 * Get plan by tier level
 * @param {number} tierLevel - The tier level
 * @returns {string|null} Plan name or null
 */
const getPlanByTier = (tierLevel) => {
    for (const [plan, tier] of Object.entries(TIER_LEVELS)) {
        if (tier === tierLevel) return plan;
    }
    return null;
};

/**
 * Get all plans sorted by tier
 * @returns {Array} Array of plan objects
 */
const getAllPlans = () => {
    return Object.values(PLAN_NAMES)
        .map(name => ({
            name,
            tier: TIER_LEVELS[name],
            pricing: PRICING[name],
            limits: USAGE_LIMITS[name],
            info: PLAN_INFO[name]
        }))
        .sort((a, b) => a.tier - b.tier);
};

/**
 * Calculate yearly savings percentage
 * @param {string} planName - The plan name
 * @returns {number} Savings percentage
 */
const getYearlySavings = (planName) => {
    const pricing = PRICING[planName];
    if (!pricing) return 0;
    const monthlyTotal = pricing.monthly * 12;
    const savings = ((monthlyTotal - pricing.yearly) / monthlyTotal) * 100;
    return Math.round(savings);
};

module.exports = {
    PLAN_NAMES,
    TIER_LEVELS,
    USAGE_TYPES,
    USAGE_LIMITS,
    PRICING,
    PLAN_INFO,
    TRIAL_CONFIG,
    getUsageLimit,
    isUnlimited,
    getTierLevel,
    comparePlans,
    getPlanByTier,
    getAllPlans,
    getYearlySavings
};
