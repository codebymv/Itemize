/**
 * Analytics Routes
 * Provides CRM statistics and reporting data for the dashboard
 */
const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { withDbClient } = require('../utils/db');

/**
 * Create analytics routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {
    const { requireOrganization } = require('../middleware/organization')(pool);

    // ======================
    // Dashboard Summary
    // ======================

    /**
     * GET /api/analytics/dashboard
     * Returns summary statistics for the dashboard
     */
    router.get('/dashboard', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const client = await pool.connect();
            const orgId = req.organizationId;

            // Run all queries in parallel for performance
            const [
                contactsResult,
                contactGrowthResult,
                dealsResult,
                dealsByStageResult,
                bookingsResult,
                tasksResult,
                pipelinesResult,
                recentActivityResult
            ] = await Promise.all([
                // Total contacts and status breakdown
                client.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'active') as active,
            COUNT(*) FILTER (WHERE status = 'lead') as leads,
            COUNT(*) FILTER (WHERE status = 'customer') as customers,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_this_month,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as new_this_week
          FROM contacts 
          WHERE organization_id = $1
        `, [orgId]),

                // Contact growth over last 6 months
                client.query(`
          SELECT 
            DATE_TRUNC('month', created_at) as month,
            COUNT(*) as count
          FROM contacts 
          WHERE organization_id = $1 
            AND created_at >= NOW() - INTERVAL '6 months'
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY month ASC
        `, [orgId]),

                // Deals summary
                client.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE won_at IS NULL AND lost_at IS NULL) as open,
            COUNT(*) FILTER (WHERE won_at IS NOT NULL) as won,
            COUNT(*) FILTER (WHERE lost_at IS NOT NULL) as lost,
            COALESCE(SUM(value) FILTER (WHERE won_at IS NULL AND lost_at IS NULL), 0) as open_value,
            COALESCE(SUM(value) FILTER (WHERE won_at IS NOT NULL), 0) as won_value,
            COALESCE(SUM(value) FILTER (WHERE won_at IS NOT NULL AND won_at >= NOW() - INTERVAL '30 days'), 0) as won_this_month
          FROM deals 
          WHERE organization_id = $1
        `, [orgId]),

                // Deals by stage (for pipeline funnel)
                client.query(`
          SELECT 
            d.stage_id,
            p.stages,
            COUNT(*) as count,
            COALESCE(SUM(d.value), 0) as total_value
          FROM deals d
          JOIN pipelines p ON d.pipeline_id = p.id
          WHERE d.organization_id = $1 
            AND d.won_at IS NULL 
            AND d.lost_at IS NULL
          GROUP BY d.stage_id, p.stages
        `, [orgId]),

                // Bookings summary
                client.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
            COUNT(*) FILTER (WHERE status = 'pending') as pending,
            COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
            COUNT(*) FILTER (WHERE start_time >= NOW() AND start_time <= NOW() + INTERVAL '7 days') as upcoming_this_week,
            COUNT(*) FILTER (WHERE start_time >= NOW() AND start_time <= NOW() + INTERVAL '1 day') as upcoming_today
          FROM bookings 
          WHERE organization_id = $1
        `, [orgId]),

                // Tasks summary
                client.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'pending') as pending,
            COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
            COUNT(*) FILTER (WHERE status = 'completed') as completed,
            COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'completed') as overdue
          FROM tasks 
          WHERE organization_id = $1
        `, [orgId]),

                // Pipelines count
                client.query(`
          SELECT COUNT(*) as total
          FROM pipelines 
          WHERE organization_id = $1
        `, [orgId]),

                // Recent activity (last 10 items)
                client.query(`
          SELECT 
            ca.id, ca.type, ca.title, ca.content, ca.created_at, ca.contact_id
          FROM contact_activities ca
          JOIN contacts c ON ca.contact_id = c.id
          WHERE c.organization_id = $1
          ORDER BY ca.created_at DESC
          LIMIT 10
        `, [orgId])
            ]);

            client.release();

            // Process deals by stage into funnel data
            const dealsByStage = dealsByStageResult.rows;
            const funnelData = [];

            if (dealsByStage.length > 0 && dealsByStage[0].stages) {
                const stages = dealsByStage[0].stages;
                const stageMap = new Map();

                dealsByStage.forEach(row => {
                    stageMap.set(row.stage_id, {
                        count: parseInt(row.count),
                        value: parseFloat(row.total_value)
                    });
                });

                stages.forEach(stage => {
                    const stageData = stageMap.get(stage.id) || { count: 0, value: 0 };
                    funnelData.push({
                        stageId: stage.id,
                        stageName: stage.name,
                        stageColor: stage.color,
                        dealCount: stageData.count,
                        totalValue: stageData.value
                    });
                });
            }

            // Format contact growth data
            const contactGrowth = contactGrowthResult.rows.map(row => ({
                month: row.month,
                count: parseInt(row.count)
            }));

            // Build response
            const analytics = {
                contacts: {
                    total: parseInt(contactsResult.rows[0].total),
                    active: parseInt(contactsResult.rows[0].active),
                    leads: parseInt(contactsResult.rows[0].leads),
                    customers: parseInt(contactsResult.rows[0].customers),
                    newThisMonth: parseInt(contactsResult.rows[0].new_this_month),
                    newThisWeek: parseInt(contactsResult.rows[0].new_this_week),
                    growth: contactGrowth
                },
                deals: {
                    total: parseInt(dealsResult.rows[0].total),
                    open: parseInt(dealsResult.rows[0].open),
                    won: parseInt(dealsResult.rows[0].won),
                    lost: parseInt(dealsResult.rows[0].lost),
                    openValue: parseFloat(dealsResult.rows[0].open_value),
                    wonValue: parseFloat(dealsResult.rows[0].won_value),
                    wonThisMonth: parseFloat(dealsResult.rows[0].won_this_month),
                    funnel: funnelData
                },
                bookings: {
                    total: parseInt(bookingsResult.rows[0].total),
                    confirmed: parseInt(bookingsResult.rows[0].confirmed),
                    pending: parseInt(bookingsResult.rows[0].pending),
                    cancelled: parseInt(bookingsResult.rows[0].cancelled),
                    upcomingThisWeek: parseInt(bookingsResult.rows[0].upcoming_this_week),
                    upcomingToday: parseInt(bookingsResult.rows[0].upcoming_today)
                },
                tasks: {
                    total: parseInt(tasksResult.rows[0].total),
                    pending: parseInt(tasksResult.rows[0].pending),
                    inProgress: parseInt(tasksResult.rows[0].in_progress),
                    completed: parseInt(tasksResult.rows[0].completed),
                    overdue: parseInt(tasksResult.rows[0].overdue)
                },
                pipelines: {
                    total: parseInt(pipelinesResult.rows[0].total)
                },
                recentActivity: recentActivityResult.rows.map(row => ({
                    id: row.id,
                    type: row.type,
                    title: row.title,
                    content: row.content,
                    createdAt: row.created_at,
                    contactId: row.contact_id
                }))
            };

            res.json(analytics);
        } catch (error) {
            console.error('Error fetching dashboard analytics:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ======================
    // Detailed Reports
    // ======================

    /**
     * GET /api/analytics/contacts/trends
     * Returns contact trends over time (for charts)
     */
    router.get('/contacts/trends', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '6months' } = req.query;
            const client = await pool.connect();
            const orgId = req.organizationId;

            let interval;
            let groupBy;
            switch (period) {
                case '7days':
                    interval = '7 days';
                    groupBy = 'day';
                    break;
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

            const result = await client.query(`
        SELECT 
          DATE_TRUNC($1, created_at) as period,
          COUNT(*) as new_contacts,
          COUNT(*) FILTER (WHERE source IS NOT NULL) as with_source
        FROM contacts 
        WHERE organization_id = $2 
          AND created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY DATE_TRUNC($1, created_at)
        ORDER BY period ASC
      `, [groupBy, orgId]);

            client.release();

            res.json({
                period,
                data: result.rows.map(row => ({
                    period: row.period,
                    newContacts: parseInt(row.new_contacts),
                    withSource: parseInt(row.with_source)
                }))
            });
        } catch (error) {
            console.error('Error fetching contact trends:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/analytics/deals/performance
     * Returns deal win/loss rate and performance metrics
     */
    router.get('/deals/performance', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '6months' } = req.query;
            const client = await pool.connect();
            const orgId = req.organizationId;

            let interval;
            switch (period) {
                case '30days':
                    interval = '30 days';
                    break;
                case '12months':
                    interval = '12 months';
                    break;
                default:
                    interval = '6 months';
            }

            const result = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE won_at IS NOT NULL OR lost_at IS NOT NULL) as closed_total,
          COUNT(*) FILTER (WHERE won_at IS NOT NULL) as won_count,
          COUNT(*) FILTER (WHERE lost_at IS NOT NULL) as lost_count,
          COALESCE(AVG(value) FILTER (WHERE won_at IS NOT NULL), 0) as avg_deal_value,
          COALESCE(SUM(value) FILTER (WHERE won_at IS NOT NULL), 0) as total_revenue,
          COALESCE(
            AVG(EXTRACT(EPOCH FROM (won_at - created_at)) / 86400) 
            FILTER (WHERE won_at IS NOT NULL), 
            0
          ) as avg_days_to_close
        FROM deals 
        WHERE organization_id = $1
          AND (won_at >= NOW() - INTERVAL '${interval}' OR lost_at >= NOW() - INTERVAL '${interval}')
      `, [orgId]);

            client.release();

            const data = result.rows[0];
            const closedTotal = parseInt(data.closed_total) || 1; // Prevent division by zero
            const wonCount = parseInt(data.won_count);

            res.json({
                period,
                metrics: {
                    closedTotal: parseInt(data.closed_total),
                    wonCount: wonCount,
                    lostCount: parseInt(data.lost_count),
                    winRate: Math.round((wonCount / closedTotal) * 100),
                    avgDealValue: parseFloat(data.avg_deal_value).toFixed(2),
                    totalRevenue: parseFloat(data.total_revenue).toFixed(2),
                    avgDaysToClose: Math.round(parseFloat(data.avg_days_to_close))
                }
            });
        } catch (error) {
            console.error('Error fetching deal performance:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/analytics/bookings/summary
     * Returns booking statistics
     */
    router.get('/bookings/summary', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const client = await pool.connect();
            const orgId = req.organizationId;

            const result = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
          COUNT(*) FILTER (WHERE status = 'no_show') as no_show,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as created_this_month,
          COUNT(*) FILTER (WHERE start_time >= NOW()) as upcoming
        FROM bookings 
        WHERE organization_id = $1
      `, [orgId]);

            client.release();

            const data = result.rows[0];
            const totalCompleted = parseInt(data.completed) + parseInt(data.no_show);
            const completionRate = totalCompleted > 0
                ? Math.round((parseInt(data.completed) / totalCompleted) * 100)
                : 0;

            res.json({
                total: parseInt(data.total),
                confirmed: parseInt(data.confirmed),
                completed: parseInt(data.completed),
                cancelled: parseInt(data.cancelled),
                noShow: parseInt(data.no_show),
                createdThisMonth: parseInt(data.created_this_month),
                upcoming: parseInt(data.upcoming),
                completionRate
            });
        } catch (error) {
            console.error('Error fetching booking summary:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ======================
    // Advanced Analytics
    // ======================

    /**
     * GET /api/analytics/conversion-rates
     * Returns conversion rate metrics
     */
    router.get('/conversion-rates', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '30days' } = req.query;
            const client = await pool.connect();
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

            client.release();

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

            res.json({
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
            });
        } catch (error) {
            console.error('Error fetching conversion rates:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/analytics/revenue-trends
     * Returns revenue trends over time (for charts)
     */
    router.get('/revenue-trends', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '6months' } = req.query;
            const client = await pool.connect();
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

            const result = await client.query(`
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
            `, [groupBy, orgId]);

            client.release();

            // Calculate cumulative revenue
            let cumulativeRevenue = 0;
            const data = result.rows.map(row => {
                cumulativeRevenue += parseFloat(row.revenue);
                return {
                    period: row.period,
                    dealsWon: parseInt(row.deals_won),
                    revenue: parseFloat(row.revenue),
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

            res.json({
                period,
                data,
                summary: {
                    totalRevenue: cumulativeRevenue,
                    totalDeals: data.reduce((sum, d) => sum + d.dealsWon, 0),
                    avgDealValue: data.length > 0 ? cumulativeRevenue / data.reduce((sum, d) => sum + d.dealsWon, 0) : 0,
                    growthRate
                }
            });
        } catch (error) {
            console.error('Error fetching revenue trends:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/analytics/pipeline-velocity
     * Returns pipeline velocity metrics (time in each stage)
     */
    router.get('/pipeline-velocity', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { pipeline_id } = req.query;
            const client = await pool.connect();
            const orgId = req.organizationId;

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
                client.release();
                return res.json({
                    pipeline: null,
                    velocity: [],
                    summary: {}
                });
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

            client.release();

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

            res.json({
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
            });
        } catch (error) {
            console.error('Error fetching pipeline velocity:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/analytics/communication-stats
     * Returns email and SMS statistics
     */
    router.get('/communication-stats', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '30days' } = req.query;
            const client = await pool.connect();
            const orgId = req.organizationId;

            let interval;
            switch (period) {
                case '7days':
                    interval = '7 days';
                    break;
                case '90days':
                    interval = '90 days';
                    break;
                default:
                    interval = '30 days';
            }

            // Run email and SMS queries in parallel
            const [emailResult, smsResult] = await Promise.all([
                // Email stats
                client.query(`
                    SELECT 
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE status = 'sent') as sent,
                        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
                        COUNT(*) FILTER (WHERE status = 'opened') as opened,
                        COUNT(*) FILTER (WHERE status = 'clicked') as clicked,
                        COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
                        COUNT(*) FILTER (WHERE status = 'failed') as failed
                    FROM email_logs 
                    WHERE organization_id = $1
                        AND queued_at >= NOW() - INTERVAL '${interval}'
                `, [orgId]),

                // SMS stats
                client.query(`
                    SELECT 
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE direction = 'outbound') as outbound,
                        COUNT(*) FILTER (WHERE direction = 'inbound') as inbound,
                        COUNT(*) FILTER (WHERE status = 'sent') as sent,
                        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
                        COUNT(*) FILTER (WHERE status = 'failed') as failed,
                        COALESCE(SUM(segments), 0) as total_segments
                    FROM sms_logs 
                    WHERE organization_id = $1
                        AND queued_at >= NOW() - INTERVAL '${interval}'
                `, [orgId])
            ]);

            client.release();

            const email = emailResult.rows[0];
            const sms = smsResult.rows[0];

            // Calculate email rates
            const emailTotal = parseInt(email.total) || 1;
            const emailDelivered = parseInt(email.delivered) || parseInt(email.sent) || 0;
            const deliveryRate = Math.round((emailDelivered / emailTotal) * 100);
            const openRate = emailDelivered > 0 ? Math.round((parseInt(email.opened) / emailDelivered) * 100) : 0;
            const clickRate = parseInt(email.opened) > 0 ? Math.round((parseInt(email.clicked) / parseInt(email.opened)) * 100) : 0;

            // Calculate SMS rates
            const smsOutbound = parseInt(sms.outbound) || 1;
            const smsDeliveryRate = Math.round((parseInt(sms.delivered) / smsOutbound) * 100);

            res.json({
                period,
                email: {
                    total: parseInt(email.total),
                    sent: parseInt(email.sent),
                    delivered: parseInt(email.delivered),
                    opened: parseInt(email.opened),
                    clicked: parseInt(email.clicked),
                    bounced: parseInt(email.bounced),
                    failed: parseInt(email.failed),
                    rates: {
                        delivery: deliveryRate,
                        open: openRate,
                        click: clickRate
                    }
                },
                sms: {
                    total: parseInt(sms.total),
                    outbound: parseInt(sms.outbound),
                    inbound: parseInt(sms.inbound),
                    sent: parseInt(sms.sent),
                    delivered: parseInt(sms.delivered),
                    failed: parseInt(sms.failed),
                    segments: parseInt(sms.total_segments),
                    rates: {
                        delivery: smsDeliveryRate
                    }
                }
            });
        } catch (error) {
            console.error('Error fetching communication stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /api/analytics/workflow-performance
     * Returns workflow automation performance metrics
     */
    router.get('/workflow-performance', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const client = await pool.connect();
            const orgId = req.organizationId;

            const result = await client.query(`
                SELECT 
                    w.id,
                    w.name,
                    w.trigger_type,
                    w.is_active,
                    w.stats,
                    COUNT(DISTINCT we.id) as total_enrollments,
                    COUNT(DISTINCT we.id) FILTER (WHERE we.status = 'completed') as completed,
                    COUNT(DISTINCT we.id) FILTER (WHERE we.status = 'active') as active,
                    COUNT(DISTINCT we.id) FILTER (WHERE we.status = 'failed') as failed
                FROM workflows w
                LEFT JOIN workflow_enrollments we ON w.id = we.workflow_id
                WHERE w.organization_id = $1
                GROUP BY w.id, w.name, w.trigger_type, w.is_active, w.stats
                ORDER BY total_enrollments DESC
            `, [orgId]);

            client.release();

            const workflows = result.rows.map(row => {
                const total = parseInt(row.total_enrollments) || 1;
                const completed = parseInt(row.completed);
                return {
                    id: row.id,
                    name: row.name,
                    triggerType: row.trigger_type,
                    isActive: row.is_active,
                    enrollments: {
                        total: parseInt(row.total_enrollments),
                        completed: completed,
                        active: parseInt(row.active),
                        failed: parseInt(row.failed)
                    },
                    completionRate: Math.round((completed / total) * 100),
                    stats: row.stats
                };
            });

            // Summary stats
            const totalEnrollments = workflows.reduce((sum, w) => sum + w.enrollments.total, 0);
            const totalCompleted = workflows.reduce((sum, w) => sum + w.enrollments.completed, 0);
            const totalActive = workflows.reduce((sum, w) => sum + w.enrollments.active, 0);
            const totalFailed = workflows.reduce((sum, w) => sum + w.enrollments.failed, 0);

            res.json({
                workflows,
                summary: {
                    totalWorkflows: workflows.length,
                    activeWorkflows: workflows.filter(w => w.isActive).length,
                    totalEnrollments,
                    completedEnrollments: totalCompleted,
                    activeEnrollments: totalActive,
                    failedEnrollments: totalFailed,
                    overallCompletionRate: totalEnrollments > 0 ? Math.round((totalCompleted / totalEnrollments) * 100) : 0
                }
            });
        } catch (error) {
            console.error('Error fetching workflow performance:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
};
