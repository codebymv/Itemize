const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendError, sendBadRequest } = require('../../utils/response');
const {
    createSerializedQueryClient,
    parseOptionalPositiveInteger,
    percentage,
    resolvePeriod,
    toInteger,
    toNumber,
} = require('../../services/analyticsParameters');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * GET /api/analytics/conversion-rates
     * Returns conversion rate metrics
     */
    router.get('/conversion-rates', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const periodConfig = resolvePeriod('conversions', req.query.period, '30days');
            if (!periodConfig) return sendBadRequest(res, 'Unsupported analytics period', 'period');

            const { period, interval } = periodConfig;
            const orgId = req.organizationId;

            // Run all queries in parallel
            const conversions = await withDbClient(pool, async (rawClient) => {
                const client = createSerializedQueryClient(rawClient);
                const [
                    leadToCustomerResult,
                    dealConversionResult,
                    formConversionResult,
                    stageConversionResult
                ] = await Promise.all([
                    // Lead to Customer conversion rate
                    client.query(`
                    SELECT
                        COUNT(*) FILTER (WHERE status = 'lead' OR status = 'customer') as total_leads_customers,
                        COUNT(*) FILTER (WHERE status = 'customer') as customers,
                        COUNT(*) FILTER (WHERE status = 'lead') as leads
                    FROM contacts
                    WHERE organization_id = $1
                        AND created_at >= NOW() - $2::interval
                `, [orgId, interval]),

                // Deal conversion (won vs total closed)
                client.query(`
                    SELECT
                        COUNT(*) as total_closed,
                        COUNT(*) FILTER (WHERE won_at IS NOT NULL) as won,
                        COUNT(*) FILTER (WHERE lost_at IS NOT NULL) as lost,
                        COALESCE(SUM(value) FILTER (WHERE won_at IS NOT NULL), 0) as won_value,
                        COALESCE(SUM(value) FILTER (WHERE lost_at IS NOT NULL), 0) as lost_value
                    FROM deals
                    WHERE organization_id = $1
                        AND (won_at IS NOT NULL OR lost_at IS NOT NULL)
                        AND (won_at >= NOW() - $2::interval OR lost_at >= NOW() - $2::interval)
                `, [orgId, interval]),

                // Form submission to contact conversion
                client.query(`
                    SELECT
                        COUNT(*) as total_submissions,
                        COUNT(*) FILTER (WHERE contact_id IS NOT NULL) as with_contact
                    FROM form_submissions
                    WHERE organization_id = $1
                        AND created_at >= NOW() - $2::interval
                `, [orgId, interval]),

                // Stage-to-stage conversion (pipeline velocity)
                client.query(`
                    WITH stage_counts AS (
                        SELECT
                            p.id as pipeline_id,
                            p.name as pipeline_name,
                            p.stages,
                            d.stage_id,
                            COUNT(*) as deal_count
                        FROM deals d
                        JOIN pipelines p ON d.pipeline_id = p.id
                        WHERE d.organization_id = $1
                            AND d.created_at >= NOW() - $2::interval
                        GROUP BY p.id, p.name, p.stages, d.stage_id
                    )
                    SELECT * FROM stage_counts
                `, [orgId, interval])
                ]);

                // Calculate lead to customer conversion rate
                const leadData = leadToCustomerResult.rows[0];
                const totalLeadsAndCustomers = toInteger(leadData.total_leads_customers);
                const leadToCustomerRate = percentage(toInteger(leadData.customers), totalLeadsAndCustomers);

                // Calculate deal win rate
                const dealData = dealConversionResult.rows[0];
                const totalClosed = toInteger(dealData.total_closed);
                const dealWinRate = percentage(toInteger(dealData.won), totalClosed);

                // Calculate form conversion rate
                const formData = formConversionResult.rows[0];
                const totalSubmissions = toInteger(formData.total_submissions);
                const formConversionRate = percentage(toInteger(formData.with_contact), totalSubmissions);

                // Process pipeline stage conversions
                const pipelineConversions = {};
                stageConversionResult.rows.forEach(row => {
                    if (!pipelineConversions[row.pipeline_id]) {
                        pipelineConversions[row.pipeline_id] = {
                            pipelineName: row.pipeline_name,
                            stages: row.stages,
                            stageCounts: {}
                        };
                    }
                    pipelineConversions[row.pipeline_id].stageCounts[row.stage_id] = toInteger(row.deal_count);
                });

                return {
                    period,
                    conversions: {
                        leadToCustomer: {
                            rate: leadToCustomerRate,
                            leads: toInteger(leadData.leads),
                            customers: toInteger(leadData.customers),
                            total: totalLeadsAndCustomers
                        },
                        dealWinRate: {
                            rate: dealWinRate,
                            won: toInteger(dealData.won),
                            lost: toInteger(dealData.lost),
                            totalClosed,
                            wonValue: toNumber(dealData.won_value),
                            lostValue: toNumber(dealData.lost_value)
                        },
                        formToContact: {
                            rate: formConversionRate,
                            submissions: totalSubmissions,
                            converted: toInteger(formData.with_contact)
                        },
                        pipelines: Object.values(pipelineConversions)
                    }
                };
            });
            return sendSuccess(res, conversions);
        } catch (error) {
            console.error('Error fetching conversion rates:', error);
            return sendError(res, 'Internal server error');
        }
    });

    /**
     * GET /api/analytics/revenue-trends
     * Returns revenue trends over time (for charts)
     */
    router.get('/revenue-trends', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const periodConfig = resolvePeriod('revenue', req.query.period, '6months');
            if (!periodConfig) return sendBadRequest(res, 'Unsupported analytics period', 'period');

            const { period, interval, groupBy } = periodConfig;
            const orgId = req.organizationId;

            // Get revenue from both deals and invoice payments
            const revenue = await withDbClient(pool, async (rawClient) => {
                const client = createSerializedQueryClient(rawClient);
                const [dealsResult, paymentsResult] = await Promise.all([
                    // Deals revenue
                    client.query(`
                    SELECT
                        DATE_TRUNC($1, won_at) as period,
                        COUNT(*) as deals_won,
                        COALESCE(SUM(value), 0) as revenue
                    FROM deals
                    WHERE organization_id = $2
                        AND won_at IS NOT NULL
                        AND won_at >= NOW() - $3::interval
                    GROUP BY DATE_TRUNC($1, won_at)
                    ORDER BY period ASC
                `, [groupBy, orgId, interval]),

                // Invoice payments revenue
                    client.query(`
                    SELECT
                        DATE_TRUNC($1, COALESCE(paid_at, created_at)) as period,
                        COUNT(*) as payments_count,
                        COALESCE(SUM(amount), 0) as revenue
                    FROM payments
                    WHERE organization_id = $2
                        AND status = 'succeeded'
                        AND COALESCE(paid_at, created_at) >= NOW() - $3::interval
                    GROUP BY DATE_TRUNC($1, COALESCE(paid_at, created_at))
                    ORDER BY period ASC
                `, [groupBy, orgId, interval])
                ]);

                // Combine deals and payments data by period
                const revenueMap = new Map();

                // Add deals revenue
                dealsResult.rows.forEach(row => {
                    const periodKey = row.period.toISOString();
                    if (!revenueMap.has(periodKey)) {
                        revenueMap.set(periodKey, { dealsWon: 0, paymentsCount: 0, revenue: 0 });
                    }
                    const dataPoint = revenueMap.get(periodKey);
                    dataPoint.dealsWon = toInteger(row.deals_won);
                    dataPoint.revenue += toNumber(row.revenue);
                });

                // Add payments revenue
                paymentsResult.rows.forEach(row => {
                    const periodKey = row.period.toISOString();
                    if (!revenueMap.has(periodKey)) {
                        revenueMap.set(periodKey, { dealsWon: 0, paymentsCount: 0, revenue: 0 });
                    }
                    const dataPoint = revenueMap.get(periodKey);
                    dataPoint.paymentsCount = toInteger(row.payments_count);
                    dataPoint.revenue += toNumber(row.revenue);
                });

                // Convert map to sorted array
                const sortedPeriods = Array.from(revenueMap.keys()).sort();

                // Calculate totals from map before creating data array
                let totalDeals = 0;
                let totalPayments = 0;
                revenueMap.forEach(periodData => {
                    totalDeals += periodData.dealsWon;
                    totalPayments += periodData.paymentsCount;
                });

                // Calculate cumulative revenue
                let cumulativeRevenue = 0;
                const data = sortedPeriods.map(period => {
                    const periodData = revenueMap.get(period);
                    cumulativeRevenue += periodData.revenue;
                    return {
                        period,
                        dealsWon: periodData.dealsWon,
                        revenue: periodData.revenue,
                        cumulativeRevenue: cumulativeRevenue
                    };
                });

                // Calculate growth rate
                let growthRate = 0;
                if (data.length >= 2) {
                    const previousPeriod = data[data.length - 2].revenue;
                    const currentPeriod = data[data.length - 1].revenue;
                    if (previousPeriod > 0) {
                        growthRate = Math.round(((currentPeriod - previousPeriod) / previousPeriod) * 100);
                    }
                }

                const totalRevenueSources = totalDeals + totalPayments;

                return {
                    period,
                    data,
                    summary: {
                        totalRevenue: cumulativeRevenue,
                        totalDeals: totalDeals,
                        totalPayments: totalPayments,
                        avgDealValue: totalRevenueSources > 0 ? cumulativeRevenue / totalRevenueSources : 0,
                        growthRate
                    }
                };
            });
            return sendSuccess(res, revenue);
        } catch (error) {
            console.error('Error fetching revenue trends:', error);
            return sendError(res, 'Internal server error');
        }
    });

    /**
     * GET /api/analytics/pipeline-velocity
     * Returns pipeline velocity metrics (time in each stage)
     */
    router.get('/pipeline-velocity', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const pipelineId = parseOptionalPositiveInteger(req.query.pipeline_id);
            if (pipelineId.error) return sendBadRequest(res, pipelineId.error, 'pipeline_id');

            const orgId = req.organizationId;
            const velocity = await withDbClient(pool, async (client) => {

            // Get pipeline info
            let pipelineQuery = `
                SELECT id, name, stages FROM pipelines
                WHERE organization_id = $1
            `;
            const pipelineParams = [orgId];

            if (pipelineId.value !== undefined) {
                pipelineQuery += ' AND id = $2';
                pipelineParams.push(pipelineId.value);
            }

            pipelineQuery += ' ORDER BY is_default DESC, created_at ASC LIMIT 1';

            const pipelineResult = await client.query(pipelineQuery, pipelineParams);

            if (pipelineResult.rows.length === 0) {
                return {
                    pipeline: null,
                    velocity: [],
                    summary: {}
                };
            }

            const pipeline = pipelineResult.rows[0];

            // Get average time to win and other metrics
            const metricsResult = await client.query(`
                SELECT
                    COUNT(*) FILTER (WHERE won_at IS NOT NULL) as won_count,
                    COUNT(*) FILTER (WHERE lost_at IS NOT NULL) as lost_count,
                    COUNT(*) FILTER (WHERE won_at IS NULL AND lost_at IS NULL) as open_count,
                    COALESCE(AVG(EXTRACT(EPOCH FROM (won_at - created_at)) / 86400) FILTER (WHERE won_at IS NOT NULL), 0) as avg_days_to_win,
                    COALESCE(AVG(EXTRACT(EPOCH FROM (lost_at - created_at)) / 86400) FILTER (WHERE lost_at IS NOT NULL), 0) as avg_days_to_lose,
                    COALESCE(AVG(value) FILTER (WHERE won_at IS NOT NULL), 0) as avg_won_value
                FROM deals
                WHERE organization_id = $1 AND pipeline_id = $2
            `, [orgId, pipeline.id]);

            // Get deals by stage with age
            const stageDealsResult = await client.query(`
                SELECT
                    stage_id,
                    COUNT(*) as count,
                    COALESCE(SUM(value), 0) as total_value,
                    COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400), 0) as avg_age_days
                FROM deals
                WHERE organization_id = $1
                    AND pipeline_id = $2
                    AND won_at IS NULL
                    AND lost_at IS NULL
                GROUP BY stage_id
            `, [orgId, pipeline.id]);

            // Build velocity data for each stage
            const stages = pipeline.stages || [];
            const stageMap = new Map();
            stageDealsResult.rows.forEach(row => {
                stageMap.set(row.stage_id, {
                    count: toInteger(row.count),
                    totalValue: toNumber(row.total_value),
                    avgAgeDays: Math.round(toNumber(row.avg_age_days))
                });
            });

            const velocity = stages.map((stage, index) => {
                const stageData = stageMap.get(stage.id) || { count: 0, totalValue: 0, avgAgeDays: 0 };
                return {
                    stageId: stage.id,
                    stageName: stage.name,
                    stageColor: stage.color,
                    stageOrder: index + 1,
                    dealCount: stageData.count,
                    totalValue: stageData.totalValue,
                    avgAgeDays: stageData.avgAgeDays,
                    isBottleneck: stageData.avgAgeDays > 14 && stageData.count > 2 // Flag potential bottlenecks
                };
            });

            const metrics = metricsResult.rows[0];

            return {
                pipeline: {
                    id: pipeline.id,
                    name: pipeline.name
                },
                velocity,
                summary: {
                    avgDaysToWin: Math.round(toNumber(metrics.avg_days_to_win)),
                    avgDaysToLose: Math.round(toNumber(metrics.avg_days_to_lose)),
                    avgWonValue: toNumber(metrics.avg_won_value),
                    openDeals: toInteger(metrics.open_count),
                    wonDeals: toInteger(metrics.won_count),
                    lostDeals: toInteger(metrics.lost_count),
                    winRate: percentage(
                        toInteger(metrics.won_count),
                        toInteger(metrics.won_count) + toInteger(metrics.lost_count)
                    )
                }
            };
            });
            return sendSuccess(res, velocity);
        } catch (error) {
            console.error('Error fetching pipeline velocity:', error);
            return sendError(res, 'Internal server error');
        }
    });

    return router;
};
