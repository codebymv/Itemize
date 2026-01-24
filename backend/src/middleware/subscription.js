/**
 * @deprecated Use inline checks in routes with ../lib/subscription.constants.js instead
 * This middleware is kept for backward compatibility.
 * 
 * Subscription Middleware
 * Feature gating, usage limits, and subscription status checks
 */

const { logger } = require('../utils/logger');
const { FEATURES, getFeatureTier, isFeatureAvailable } = require('../config/features');
const { USAGE_LIMITS, PLAN_NAMES, getTierLevel, getUsageLimit, isUnlimited } = require('../config/plans');

/**
 * Cache for subscription data to reduce DB queries
 * Key: organizationId, Value: { subscription, timestamp }
 */
const subscriptionCache = new Map();
const CACHE_TTL = 60000; // 1 minute

/**
 * Get organization subscription from database
 * @param {Object} pool - Database pool
 * @param {number} organizationId - Organization ID
 * @returns {Object|null} Subscription data
 */
const getOrgSubscription = async (pool, organizationId) => {
    // Check cache first
    const cached = subscriptionCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.subscription;
    }

    try {
        const result = await pool.query(`
            SELECT 
                s.*,
                sp.name as plan_name,
                sp.tier_level,
                sp.features as plan_features,
                sp.limits as plan_limits,
                o.features_override
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            JOIN organizations o ON s.organization_id = o.id
            WHERE s.organization_id = $1
        `, [organizationId]);

        const subscription = result.rows[0] || null;
        
        // Cache the result
        subscriptionCache.set(organizationId, {
            subscription,
            timestamp: Date.now()
        });

        return subscription;
    } catch (error) {
        logger.error('Error fetching subscription', { organizationId, error: error.message });
        return null;
    }
};

/**
 * Clear subscription cache for an organization
 * Call this when subscription changes
 */
const clearSubscriptionCache = (organizationId) => {
    subscriptionCache.delete(organizationId);
};

/**
 * Get organization's effective tier level
 * @param {Object} pool - Database pool
 * @param {number} organizationId - Organization ID
 * @returns {number} Tier level (0 if no subscription)
 */
const getOrgTierLevel = async (pool, organizationId) => {
    const subscription = await getOrgSubscription(pool, organizationId);
    
    // Check if in trial or active
    if (!subscription) return 0;
    if (!['active', 'trialing'].includes(subscription.status)) return 0;
    
    return subscription.tier_level || 0;
};

/**
 * Get organization's features (plan features + overrides)
 * @param {Object} pool - Database pool
 * @param {number} organizationId - Organization ID
 * @returns {Object} Feature flags
 */
const getOrgFeatures = async (pool, organizationId) => {
    const subscription = await getOrgSubscription(pool, organizationId);
    
    if (!subscription) return {};
    if (!['active', 'trialing'].includes(subscription.status)) return {};
    
    // Merge plan features with any manual overrides
    const planFeatures = subscription.plan_features || {};
    const overrides = subscription.features_override || {};
    
    return { ...planFeatures, ...overrides };
};

/**
 * Get current usage for a resource
 * @param {Object} pool - Database pool
 * @param {number} organizationId - Organization ID
 * @param {string} resourceType - Resource type
 * @returns {number} Current usage count
 */
const getCurrentUsage = async (pool, organizationId, resourceType) => {
    try {
        // Get current period's usage
        const result = await pool.query(`
            SELECT count FROM usage_tracking
            WHERE organization_id = $1 
            AND resource_type = $2
            AND period_start <= CURRENT_DATE
            AND period_end >= CURRENT_DATE
        `, [organizationId, resourceType]);

        return result.rows[0]?.count || 0;
    } catch (error) {
        logger.error('Error getting current usage', { organizationId, resourceType, error: error.message });
        return 0;
    }
};

/**
 * Get usage limit for organization
 * @param {Object} pool - Database pool
 * @param {number} organizationId - Organization ID
 * @param {string} resourceType - Resource type
 * @returns {number} Limit (-1 for unlimited)
 */
const getOrgUsageLimit = async (pool, organizationId, resourceType) => {
    const subscription = await getOrgSubscription(pool, organizationId);
    
    if (!subscription) return 0;
    if (!['active', 'trialing'].includes(subscription.status)) return 0;
    
    const limits = subscription.plan_limits || {};
    return limits[resourceType] ?? 0;
};

/**
 * Create middleware factory with pool dependency
 * @param {Object} pool - Database connection pool
 */
module.exports = (pool) => {

    /**
     * Middleware: Require active subscription
     * Returns 402 if no active subscription
     */
    const requireActiveSubscription = async (req, res, next) => {
        try {
            const subscription = await getOrgSubscription(pool, req.organizationId);
            
            if (!subscription) {
                return res.status(402).json({
                    success: false,
                    error: {
                        message: 'No subscription found. Please subscribe to continue.',
                        code: 'NO_SUBSCRIPTION'
                    }
                });
            }

            if (!['active', 'trialing'].includes(subscription.status)) {
                return res.status(402).json({
                    success: false,
                    error: {
                        message: 'Your subscription is inactive. Please update your billing.',
                        code: 'SUBSCRIPTION_INACTIVE',
                        status: subscription.status
                    }
                });
            }

            // Check if trial has ended
            if (subscription.status === 'trialing' && subscription.trial_end) {
                const trialEnd = new Date(subscription.trial_end);
                if (trialEnd < new Date()) {
                    return res.status(402).json({
                        success: false,
                        error: {
                            message: 'Your trial has ended. Please subscribe to continue.',
                            code: 'TRIAL_ENDED'
                        }
                    });
                }
            }

            // Attach subscription to request
            req.subscription = subscription;
            req.tierLevel = subscription.tier_level;
            next();
        } catch (error) {
            logger.error('Error checking subscription', { error: error.message });
            next(error);
        }
    };

    /**
     * Middleware: Require specific feature
     * @param {string} featureName - The feature key to check
     */
    const requireFeature = (featureName) => {
        return async (req, res, next) => {
            try {
                const features = await getOrgFeatures(pool, req.organizationId);
                
                if (!features[featureName]) {
                    const featureInfo = FEATURES[featureName];
                    const requiredTier = featureInfo?.tier || 0;
                    
                    return res.status(403).json({
                        success: false,
                        error: {
                            message: `This feature requires a plan upgrade`,
                            code: 'FEATURE_NOT_AVAILABLE',
                            feature: featureName,
                            featureName: featureInfo?.name || featureName,
                            requiredTier,
                            currentTier: req.tierLevel || 0
                        }
                    });
                }

                next();
            } catch (error) {
                logger.error('Error checking feature', { featureName, error: error.message });
                next(error);
            }
        };
    };

    /**
     * Middleware: Check usage limit before allowing action
     * @param {string} resourceType - The resource type to check
     * @param {number} increment - Amount being added (default 1)
     */
    const checkUsageLimit = (resourceType, increment = 1) => {
        return async (req, res, next) => {
            try {
                const currentUsage = await getCurrentUsage(pool, req.organizationId, resourceType);
                const limit = await getOrgUsageLimit(pool, req.organizationId, resourceType);

                // -1 means unlimited
                if (limit === -1) {
                    req.usageInfo = { current: currentUsage, limit: -1, unlimited: true };
                    return next();
                }

                // 0 means not allowed
                if (limit === 0) {
                    return res.status(403).json({
                        success: false,
                        error: {
                            message: `Your plan does not include ${resourceType}`,
                            code: 'FEATURE_NOT_INCLUDED',
                            resourceType
                        }
                    });
                }

                // Check if adding increment would exceed limit
                if (currentUsage + increment > limit) {
                    return res.status(429).json({
                        success: false,
                        error: {
                            message: `You've reached your ${resourceType} limit`,
                            code: 'USAGE_LIMIT_EXCEEDED',
                            resourceType,
                            current: currentUsage,
                            limit,
                            wouldBe: currentUsage + increment
                        }
                    });
                }

                req.usageInfo = { current: currentUsage, limit, unlimited: false };
                next();
            } catch (error) {
                logger.error('Error checking usage limit', { resourceType, error: error.message });
                next(error);
            }
        };
    };

    /**
     * Middleware: Require minimum tier level
     * @param {number} minTier - Minimum tier level required
     */
    const requireTier = (minTier) => {
        return async (req, res, next) => {
            try {
                const tierLevel = await getOrgTierLevel(pool, req.organizationId);

                if (tierLevel < minTier) {
                    const tierNames = { 1: 'Starter', 2: 'Unlimited', 3: 'Pro' };
                    
                    return res.status(403).json({
                        success: false,
                        error: {
                            message: `This feature requires ${tierNames[minTier]} plan or higher`,
                            code: 'TIER_TOO_LOW',
                            currentTier: tierLevel,
                            requiredTier: minTier
                        }
                    });
                }

                next();
            } catch (error) {
                logger.error('Error checking tier', { minTier, error: error.message });
                next(error);
            }
        };
    };

    /**
     * Middleware: Optional subscription check (doesn't block, just attaches info)
     */
    const attachSubscriptionInfo = async (req, res, next) => {
        try {
            const subscription = await getOrgSubscription(pool, req.organizationId);
            req.subscription = subscription;
            req.tierLevel = subscription?.tier_level || 0;
            req.hasActiveSubscription = subscription && ['active', 'trialing'].includes(subscription.status);
            next();
        } catch (error) {
            logger.error('Error attaching subscription info', { error: error.message });
            req.subscription = null;
            req.tierLevel = 0;
            req.hasActiveSubscription = false;
            next();
        }
    };

    /**
     * Middleware: Check if in trial period
     */
    const requireNotInTrial = async (req, res, next) => {
        try {
            const subscription = await getOrgSubscription(pool, req.organizationId);
            
            if (subscription?.status === 'trialing') {
                return res.status(402).json({
                    success: false,
                    error: {
                        message: 'This feature is not available during trial. Please subscribe.',
                        code: 'TRIAL_RESTRICTION',
                        trialEndsAt: subscription.trial_end
                    }
                });
            }

            next();
        } catch (error) {
            logger.error('Error checking trial status', { error: error.message });
            next(error);
        }
    };

    return {
        requireActiveSubscription,
        requireFeature,
        checkUsageLimit,
        requireTier,
        attachSubscriptionInfo,
        requireNotInTrial,
        // Export helpers for use in services
        getOrgSubscription: (orgId) => getOrgSubscription(pool, orgId),
        getOrgTierLevel: (orgId) => getOrgTierLevel(pool, orgId),
        getOrgFeatures: (orgId) => getOrgFeatures(pool, orgId),
        getCurrentUsage: (orgId, resourceType) => getCurrentUsage(pool, orgId, resourceType),
        getOrgUsageLimit: (orgId, resourceType) => getOrgUsageLimit(pool, orgId, resourceType),
        clearSubscriptionCache
    };
};
