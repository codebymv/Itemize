/**
 * @deprecated Use ../lib/subscription.constants.js instead
 * This file is kept for backward compatibility.
 * 
 * Feature Configuration
 * Defines all gated features and their tier requirements
 * 
 * Tier Levels:
 * 1 = Starter ($97/mo)
 * 2 = Unlimited ($297/mo)
 * 3 = Pro ($497/mo)
 */

const FEATURES = {
    // ===================
    // Core Features (Tier 1 - All Plans)
    // ===================
    contacts: {
        tier: 1,
        name: 'Contact Management',
        description: 'Create and manage contacts, tags, and custom fields'
    },
    pipelines: {
        tier: 1,
        name: 'Sales Pipelines',
        description: 'Manage deals through customizable sales stages'
    },
    calendars: {
        tier: 1,
        name: 'Calendars & Bookings',
        description: 'Schedule appointments and accept online bookings'
    },
    forms: {
        tier: 1,
        name: 'Form Builder',
        description: 'Create forms to capture leads and information'
    },
    landing_pages: {
        tier: 1,
        name: 'Landing Pages',
        description: 'Build and publish landing pages'
    },
    email_templates: {
        tier: 1,
        name: 'Email Templates',
        description: 'Create reusable email templates'
    },
    sms_templates: {
        tier: 1,
        name: 'SMS Templates',
        description: 'Create reusable SMS templates'
    },
    conversations: {
        tier: 1,
        name: 'Unified Inbox',
        description: 'Manage all conversations in one place'
    },
    basic_automation: {
        tier: 1,
        name: 'Basic Automation',
        description: 'Simple trigger-based automations'
    },
    reputation: {
        tier: 1,
        name: 'Reputation Management',
        description: 'Manage reviews and reputation'
    },
    invoicing: {
        tier: 1,
        name: 'Invoicing',
        description: 'Create and send invoices'
    },
    analytics: {
        tier: 1,
        name: 'Basic Analytics',
        description: 'View basic performance metrics'
    },

    // ===================
    // Advanced Features (Tier 2 - Unlimited+)
    // ===================
    api_access: {
        tier: 2,
        name: 'API Access',
        description: 'Access REST API for custom integrations'
    },
    advanced_workflows: {
        tier: 2,
        name: 'Advanced Workflows',
        description: 'Complex multi-step automation workflows'
    },
    unlimited_orgs: {
        tier: 2,
        name: 'Unlimited Organizations',
        description: 'Create unlimited sub-accounts'
    },
    white_label: {
        tier: 2,
        name: 'White Label',
        description: 'Custom branding and domains'
    },
    custom_domains: {
        tier: 2,
        name: 'Custom Domains',
        description: 'Use your own domain for pages and forms'
    },
    advanced_analytics: {
        tier: 2,
        name: 'Advanced Analytics',
        description: 'Detailed reports and custom dashboards'
    },
    team_roles: {
        tier: 2,
        name: 'Team Roles',
        description: 'Granular team permissions and roles'
    },
    webhooks: {
        tier: 2,
        name: 'Webhooks',
        description: 'Send data to external services'
    },
    social_integration: {
        tier: 2,
        name: 'Social Media Integration',
        description: 'Connect and manage social accounts'
    },

    // ===================
    // Pro Features (Tier 3 - SaaS Pro)
    // ===================
    saas_mode: {
        tier: 3,
        name: 'SaaS Mode',
        description: 'Resell the platform as your own SaaS'
    },
    client_billing: {
        tier: 3,
        name: 'Client Billing',
        description: 'Automatically bill your clients'
    },
    mobile_white_label: {
        tier: 3,
        name: 'Mobile App White Label',
        description: 'Your branded mobile app'
    },
    priority_support: {
        tier: 3,
        name: 'Priority Support',
        description: '24/7 priority support'
    },
    dedicated_support: {
        tier: 3,
        name: 'Dedicated Support',
        description: 'Dedicated account manager'
    },
    custom_integrations: {
        tier: 3,
        name: 'Custom Integrations',
        description: 'Build custom integrations'
    },
    advanced_api: {
        tier: 3,
        name: 'Full API Access',
        description: 'Higher rate limits and advanced endpoints'
    },
    audit_logs: {
        tier: 3,
        name: 'Audit Logs',
        description: 'Complete activity audit trail'
    }
};

/**
 * Get the minimum tier required for a feature
 * @param {string} featureName - The feature key
 * @returns {number} The tier level (1-3) or 0 if not found
 */
const getFeatureTier = (featureName) => {
    const feature = FEATURES[featureName];
    return feature ? feature.tier : 0;
};

/**
 * Check if a feature is available for a given tier
 * @param {string} featureName - The feature key
 * @param {number} tierLevel - The tier level to check
 * @returns {boolean} True if feature is available
 */
const isFeatureAvailable = (featureName, tierLevel) => {
    const requiredTier = getFeatureTier(featureName);
    return requiredTier > 0 && tierLevel >= requiredTier;
};

/**
 * Get all features available for a tier
 * @param {number} tierLevel - The tier level
 * @returns {Object} Features available at this tier
 */
const getFeaturesForTier = (tierLevel) => {
    const availableFeatures = {};
    for (const [key, feature] of Object.entries(FEATURES)) {
        if (feature.tier <= tierLevel) {
            availableFeatures[key] = true;
        }
    }
    return availableFeatures;
};

/**
 * Get feature details
 * @param {string} featureName - The feature key
 * @returns {Object|null} Feature details or null
 */
const getFeatureDetails = (featureName) => {
    return FEATURES[featureName] || null;
};

/**
 * Get all features grouped by tier
 * @returns {Object} Features grouped by tier
 */
const getFeaturesByTier = () => {
    const grouped = { 1: [], 2: [], 3: [] };
    for (const [key, feature] of Object.entries(FEATURES)) {
        grouped[feature.tier].push({ key, ...feature });
    }
    return grouped;
};

module.exports = {
    FEATURES,
    getFeatureTier,
    isFeatureAvailable,
    getFeaturesForTier,
    getFeatureDetails,
    getFeaturesByTier
};
