const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendError } = require('../../utils/response');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * GET /api/analytics/conversion-rates
     * Returns conversion rate metrics
     */
    router.get('/conversion-rates', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '30days' } = req.query;
            const orgId = req.organizationId;

            let interval;
            switch (period) {
                case '7days':
                    interval = '7 days';
                    break;
                case '90days':
                    interval = '90 days';
                    break;
                case '12months':
                    interval = '12 months';
                    break;
                default:
                    interval = '30 days';
            }

            // Run all queries in parallel
            const conversions = await withDbClient(pool, async (client) => {
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
                        AND created_at >= NOW() - INTERVAL '${interval}'
                `, [orgId]),

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
                        AND (won_at >= NOW() - INTERVAL '${interval}' OR lost_at >= NOW() - INTERVAL '${interval}')
                `, [orgId]),

                // Form submission to contact conversion
                client.query(`
                    SELECT
                        COUNT(*) as total_submissions,
                        COUNT(*) FILTER (WHERE contact_id IS NOT NULL) as with_contact
                    FROM form_submissions
                    WHERE organization_id = $1
                        AND created_at >= NOW() - INTERVAL '${interval}'
                `, [orgId]),

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
                            AND d.created_at >= NOW() - INTERVAL '${interval}'
                        GROUP BY p.id, p.name, p.stages, d.stage_id
                    )
                    SELECT * FROM stage_counts
                `, [orgId])
                ]);

                // Calculate lead to customer conversion rate
                const leadData = leadToCustomerResult.rows[0];
                const totalLeadsAndCustomers = parseInt(leadData.total_leads_customers) || 1;
                const leadToCustomerRate = Math.round((parseInt(leadData.customers) / totalLeadsAndCustomers) * 100);

                // Calculate deal win rate
                const dealData = dealConversionResult.rows[0];
                const totalClosed = parseInt(dealData.total_closed) || 1;
                const dealWinRate = Math.round((parseInt(dealData.won) / totalClosed) * 100);

                // Calculate form conversion rate
                const formData = formConversionResult.rows[0];
                const totalSubmissions = parseInt(formData.total_submissions) || 1;
                const formConversionRate = Math.round((parseInt(formData.with_contact) / totalSubmissions) * 100);

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
                    pipelineConversions[row.pipeline_id].stageCounts[row.stage_id] = parseInt(row.deal_count);
                });

                return {
                    period,
                    conversions: {
                        leadToCustomer: {
                            rate: leadToCustomerRate,
                            leads: parseInt(leadData.leads),
                            customers: parseInt(leadData.customers),
                            total: parseInt(leadData.total_leads_customers)
                        },
                        dealWinRate: {
                            rate: dealWinRate,
                            won: parseInt(dealData.won),
                            lost: parseInt(dealData.lost),
                            totalClosed: parseInt(dealData.total_closed),
                            wonValue: parseFloat(dealData.won_value),
                            lostValue: parseFloat(dealData.lost_value)
                        },
                        formToContact: {
                            rate: formConversionRate,
                            submissions: parseInt(formData.total_submissions),
                            converted: parseInt(formData.with_contact)
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
            const { period = '6months' } = req.query;
            const orgId = req.organizationId;

            let interval;
            let groupBy;
            switch (period) {
                case '30days':
                    interval = '30 days';
                    groupBy = 'day';
                    break;
                case '12months':
                    interval = '12 months';
                    groupBy = 'month';
                    break;
                default:
                    interval = '6 months';
                    groupBy = 'month';
            }

            // Get revenue from both deals and invoice payments
            const revenue = await withDbClient(pool, async (client) => {
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
                        AND won_at >= NOW() - INTERVAL '${interval}'
                    GROUP BY DATE_TRUNC($1, won_at)
                    ORDER BY period ASC
                `, [groupBy, orgId]),

                // Invoice payments revenue
                    client.query(`
                    SELECT
                        DATE_TRUNC($1, COALESCE(paid_at, created_at)) as period,
                        COUNT(*) as payments_count,
                        COALESCE(SUM(amount), 0) as revenue
                    FROM payments
                    WHERE organization_id = $2
                        AND status = 'succeeded'
                        AND COALESCE(paid_at, created_at) >= NOW() - INTERVAL '${interval}'
                    GROUP BY DATE_TRUNC($1, COALESCE(paid_at, created_at))
                    ORDER BY period ASC
                `, [groupBy, orgId])
                ]);

                // Combine deals and payments data by period
                const revenueMap = new Map();

                // Add deals revenue
                dealsResult.rows.forEach(row => {
                    const period = row.period;
                    if (!revenueMap.has(period)) {
                        revenueMap.set(period, { dealsWon: 0, paymentsCount: 0, revenue: 0 });
                    }
                    const dataPoint = revenueMap.get(period);
                    dataPoint.dealsWon = parseInt(row.deals_won);
                    dataPoint.revenue += parseFloat(row.revenue);
                });

                // Add payments revenue
                paymentsResult.rows.forEach(row => {
                    const period = row.period;
                    if (!revenueMap.has(period)) {
                        revenueMap.set(period, { dealsWon: 0, paymentsCount: 0, revenue: 0 });
                    }
                    const dataPoint = revenueMap.get(period);
                    dataPoint.paymentsCount = parseInt(row.payments_count);
                    dataPoint.revenue += parseFloat(row.revenue);
                });

                // Convert map to sorted array
                const sortedPeriods = Array.from(revenueMap.keys()).sort((a, b) => a - b);

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
                        period: period,
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
            const { pipeline_id } = req.query;
            const orgId = req.organizationId;
            const velocity = await withDbClient(pool, async (client) => {

            // Get pipeline info
            let pipelineQuery = `
                SELECT id, name, stages FROM pipelines
                WHERE organization_id = $1
            `;
            const pipelineParams = [orgId];

            if (pipeline_id) {
                pipelineQuery += ' AND id = $2';
                pipelineParams.push(pipeline_id);
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
                    count: parseInt(row.count),
                    totalValue: parseFloat(row.total_value),
                    avgAgeDays: Math.round(parseFloat(row.avg_age_days))
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
                    avgDaysToWin: Math.round(parseFloat(metrics.avg_days_to_win)),
                    avgDaysToLose: Math.round(parseFloat(metrics.avg_days_to_lose)),
                    avgWonValue: parseFloat(metrics.avg_won_value),
                    openDeals: parseInt(metrics.open_count),
                    wonDeals: parseInt(metrics.won_count),
                    lostDeals: parseInt(metrics.lost_count),
                    winRate: parseInt(metrics.won_count) + parseInt(metrics.lost_count) > 0
                        ? Math.round((parseInt(metrics.won_count) / (parseInt(metrics.won_count) + parseInt(metrics.lost_count))) * 100)
                        : 0
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
