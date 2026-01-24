/**
 * @deprecated Usage is now tracked directly on organization records.
 * This file is kept for backward compatibility.
 * 
 * Usage Tracking Service
 * Tracks and manages resource usage for feature gating
 */

const BaseService = require('./BaseService');
const { USAGE_TYPES, getUsageLimit, isUnlimited } = require('../config/plans');

class UsageTrackingService extends BaseService {
    constructor(pool) {
        super('UsageTrackingService', {
            maxRetries: 2,
            baseDelay: 500,
            timeout: 10000
        });

        this.pool = pool;
    }

    /**
     * Get current period dates (start and end of current month)
     * @returns {Object} { periodStart, periodEnd }
     */
    getCurrentPeriod() {
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { periodStart, periodEnd };
    }

    /**
     * Increment usage counter for a resource
     * @param {number} organizationId - Organization ID
     * @param {string} resourceType - Resource type (from USAGE_TYPES)
     * @param {number} amount - Amount to increment (default 1)
     * @returns {Object} Updated usage info
     */
    async incrementUsage(organizationId, resourceType, amount = 1) {
        const { periodStart, periodEnd } = this.getCurrentPeriod();

        try {
            // Upsert usage record
            const result = await this.pool.query(`
                INSERT INTO usage_tracking (
                    organization_id, resource_type, period_start, period_end, count, updated_at
                ) VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (organization_id, resource_type, period_start) 
                DO UPDATE SET 
                    count = usage_tracking.count + $5,
                    updated_at = NOW()
                RETURNING count
            `, [organizationId, resourceType, periodStart, periodEnd, amount]);

            const newCount = result.rows[0].count;
            
            this.logInfo('Usage incremented', { 
                organizationId, 
                resourceType, 
                amount, 
                newTotal: newCount 
            });

            return { count: newCount, resourceType };
        } catch (error) {
            this.logError('Failed to increment usage', { 
                organizationId, 
                resourceType, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Decrement usage counter (for deletions/reversals)
     * @param {number} organizationId - Organization ID
     * @param {string} resourceType - Resource type
     * @param {number} amount - Amount to decrement (default 1)
     * @returns {Object} Updated usage info
     */
    async decrementUsage(organizationId, resourceType, amount = 1) {
        const { periodStart } = this.getCurrentPeriod();

        try {
            const result = await this.pool.query(`
                UPDATE usage_tracking 
                SET count = GREATEST(0, count - $1), updated_at = NOW()
                WHERE organization_id = $2 
                AND resource_type = $3
                AND period_start = $4
                RETURNING count
            `, [amount, organizationId, resourceType, periodStart]);

            const newCount = result.rows[0]?.count || 0;
            
            this.logInfo('Usage decremented', { 
                organizationId, 
                resourceType, 
                amount, 
                newTotal: newCount 
            });

            return { count: newCount, resourceType };
        } catch (error) {
            this.logError('Failed to decrement usage', error);
            throw error;
        }
    }

    /**
     * Get current period usage for a resource
     * @param {number} organizationId - Organization ID
     * @param {string} resourceType - Resource type
     * @returns {number} Current usage count
     */
    async getCurrentUsage(organizationId, resourceType) {
        const { periodStart, periodEnd } = this.getCurrentPeriod();

        try {
            const result = await this.pool.query(`
                SELECT count FROM usage_tracking
                WHERE organization_id = $1 
                AND resource_type = $2
                AND period_start <= $3
                AND period_end >= $4
            `, [organizationId, resourceType, periodEnd, periodStart]);

            return result.rows[0]?.count || 0;
        } catch (error) {
            this.logError('Failed to get current usage', error);
            return 0;
        }
    }

    /**
     * Get all-time count for a resource (not period-bound)
     * Used for things like total contacts, pages, etc.
     * @param {number} organizationId - Organization ID
     * @param {string} resourceType - Resource type
     * @param {string} tableName - Table to count from
     * @returns {number} Total count
     */
    async getTotalCount(organizationId, resourceType, tableName) {
        try {
            const result = await this.pool.query(
                `SELECT COUNT(*) FROM ${tableName} WHERE organization_id = $1`,
                [organizationId]
            );
            return parseInt(result.rows[0].count) || 0;
        } catch (error) {
            this.logError('Failed to get total count', error);
            return 0;
        }
    }

    /**
     * Check if usage is within limits
     * @param {number} organizationId - Organization ID
     * @param {string} resourceType - Resource type
     * @param {number} additionalAmount - Amount to add (for pre-check)
     * @returns {Object} { withinLimits, current, limit, unlimited }
     */
    async isWithinLimits(organizationId, resourceType, additionalAmount = 0) {
        try {
            // Get organization's plan
            const planResult = await this.pool.query(`
                SELECT sp.name as plan_name, sp.limits
                FROM subscriptions s
                JOIN subscription_plans sp ON s.plan_id = sp.id
                WHERE s.organization_id = $1 AND s.status IN ('active', 'trialing')
            `, [organizationId]);

            const plan = planResult.rows[0];
            if (!plan) {
                return { withinLimits: false, current: 0, limit: 0, unlimited: false, noPlan: true };
            }

            const limit = plan.limits?.[resourceType] ?? 0;

            // -1 means unlimited
            if (limit === -1) {
                const current = await this.getCurrentUsage(organizationId, resourceType);
                return { withinLimits: true, current, limit: -1, unlimited: true };
            }

            // 0 means not allowed
            if (limit === 0) {
                return { withinLimits: false, current: 0, limit: 0, unlimited: false, notAllowed: true };
            }

            const current = await this.getCurrentUsage(organizationId, resourceType);
            const wouldBe = current + additionalAmount;

            return {
                withinLimits: wouldBe <= limit,
                current,
                limit,
                wouldBe,
                unlimited: false,
                remaining: Math.max(0, limit - current)
            };
        } catch (error) {
            this.logError('Failed to check limits', error);
            // Fail open in case of error (allows action)
            return { withinLimits: true, current: 0, limit: -1, unlimited: true, error: true };
        }
    }

    /**
     * Get all usage stats for an organization
     * @param {number} organizationId - Organization ID
     * @returns {Object} Usage stats for all resource types
     */
    async getUsageStats(organizationId) {
        const { periodStart, periodEnd } = this.getCurrentPeriod();

        try {
            // Get plan limits
            const planResult = await this.pool.query(`
                SELECT sp.name as plan_name, sp.limits, sp.tier_level
                FROM subscriptions s
                JOIN subscription_plans sp ON s.plan_id = sp.id
                WHERE s.organization_id = $1 AND s.status IN ('active', 'trialing')
            `, [organizationId]);

            const plan = planResult.rows[0];
            if (!plan) {
                return { hasSubscription: false, usage: {} };
            }

            // Get current period usage
            const usageResult = await this.pool.query(`
                SELECT resource_type, count
                FROM usage_tracking
                WHERE organization_id = $1
                AND period_start = $2
            `, [organizationId, periodStart]);

            const usageMap = {};
            for (const row of usageResult.rows) {
                usageMap[row.resource_type] = row.count;
            }

            // Build stats object
            const stats = {
                hasSubscription: true,
                planName: plan.plan_name,
                tierLevel: plan.tier_level,
                period: {
                    start: periodStart,
                    end: periodEnd
                },
                usage: {}
            };

            // Add usage for each tracked resource type
            const limits = plan.limits || {};
            for (const [resourceType, limit] of Object.entries(limits)) {
                const current = usageMap[resourceType] || 0;
                stats.usage[resourceType] = {
                    current,
                    limit: limit === -1 ? 'unlimited' : limit,
                    unlimited: limit === -1,
                    percentage: limit === -1 ? 0 : Math.round((current / limit) * 100),
                    remaining: limit === -1 ? 'unlimited' : Math.max(0, limit - current)
                };
            }

            // Also get real-time counts for persistent resources
            const contactsCount = await this.getTotalCount(organizationId, 'contacts', 'contacts');
            const pagesCount = await this.getTotalCount(organizationId, 'landing_pages', 'pages');
            const formsCount = await this.getTotalCount(organizationId, 'forms', 'forms');
            const workflowsCount = await this.getTotalCount(organizationId, 'workflows', 'workflows');

            // Add real-time counts
            stats.realTimeCounts = {
                contacts: contactsCount,
                landing_pages: pagesCount,
                forms: formsCount,
                workflows: workflowsCount
            };

            return stats;
        } catch (error) {
            this.logError('Failed to get usage stats', error);
            throw error;
        }
    }

    /**
     * Reset monthly counters for all organizations
     * Should be called by a cron job on the 1st of each month
     */
    async resetMonthlyCounters() {
        const { periodStart, periodEnd } = this.getCurrentPeriod();

        try {
            // Archive old usage records
            await this.pool.query(`
                UPDATE usage_tracking 
                SET updated_at = NOW()
                WHERE period_end < CURRENT_DATE
            `);

            this.logInfo('Monthly counters ready for new period', { periodStart, periodEnd });
            return true;
        } catch (error) {
            this.logError('Failed to reset monthly counters', error);
            throw error;
        }
    }

    /**
     * Initialize usage tracking for a new organization
     * @param {number} organizationId - Organization ID
     */
    async initializeOrganizationUsage(organizationId) {
        const { periodStart, periodEnd } = this.getCurrentPeriod();

        try {
            // Create initial usage records for key resources
            const resourceTypes = [
                USAGE_TYPES.EMAILS_PER_MONTH,
                USAGE_TYPES.SMS_PER_MONTH,
                USAGE_TYPES.API_CALLS_PER_DAY
            ];

            for (const resourceType of resourceTypes) {
                await this.pool.query(`
                    INSERT INTO usage_tracking (
                        organization_id, resource_type, period_start, period_end, count
                    ) VALUES ($1, $2, $3, $4, 0)
                    ON CONFLICT (organization_id, resource_type, period_start) DO NOTHING
                `, [organizationId, resourceType, periodStart, periodEnd]);
            }

            this.logInfo('Initialized usage tracking', { organizationId });
        } catch (error) {
            this.logError('Failed to initialize usage tracking', error);
        }
    }

    /**
     * Get usage history for a resource
     * @param {number} organizationId - Organization ID
     * @param {string} resourceType - Resource type
     * @param {number} months - Number of months to look back
     * @returns {Array} Historical usage data
     */
    async getUsageHistory(organizationId, resourceType, months = 6) {
        try {
            const result = await this.pool.query(`
                SELECT period_start, period_end, count
                FROM usage_tracking
                WHERE organization_id = $1
                AND resource_type = $2
                AND period_start >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '${months} months')
                ORDER BY period_start DESC
            `, [organizationId, resourceType]);

            return result.rows;
        } catch (error) {
            this.logError('Failed to get usage history', error);
            return [];
        }
    }

    /**
     * Check if organization is approaching limit (>80%)
     * @param {number} organizationId - Organization ID
     * @param {string} resourceType - Resource type
     * @returns {Object} { approaching, percentage }
     */
    async isApproachingLimit(organizationId, resourceType) {
        const { withinLimits, current, limit, unlimited } = 
            await this.isWithinLimits(organizationId, resourceType);

        if (unlimited || limit === 0) {
            return { approaching: false, percentage: 0 };
        }

        const percentage = Math.round((current / limit) * 100);
        return {
            approaching: percentage >= 80,
            percentage,
            current,
            limit
        };
    }
}

module.exports = UsageTrackingService;
