/**
 * Analytics Routes
 * Provides CRM statistics and reporting data for the dashboard
 */
const express = require('express');
const router = express.Router();

/**
 * Create analytics routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 */
module.exports = (pool, authenticateJWT) => {

    /**
     * Middleware to require organization context
     */
    const requireOrganization = async (req, res, next) => {
        try {
            const organizationId = req.query.organization_id || req.body.organization_id || req.headers['x-organization-id'];

            if (!organizationId) {
                const client = await pool.connect();
                const result = await client.query(
                    'SELECT default_organization_id FROM users WHERE id = $1',
                    [req.user.id]
                );
                client.release();

                if (result.rows.length === 0 || !result.rows[0].default_organization_id) {
                    return res.status(400).json({ error: 'Organization ID required' });
                }
                req.organizationId = result.rows[0].default_organization_id;
            } else {
                req.organizationId = parseInt(organizationId);
            }

            // Verify user has access to this organization
            const client = await pool.connect();
            const memberCheck = await client.query(
                'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
                [req.organizationId, req.user.id]
            );
            client.release();

            if (memberCheck.rows.length === 0) {
                return res.status(403).json({ error: 'Not a member of this organization' });
            }

            req.orgRole = memberCheck.rows[0].role;
            next();
        } catch (error) {
            console.error('Error in requireOrganization middleware:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };

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
            id, type, description, created_at, contact_id
          FROM contact_activities 
          WHERE organization_id = $1
          ORDER BY created_at DESC
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
                    description: row.description,
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

    return router;
};
