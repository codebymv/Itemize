const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendError } = require('../../utils/response');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * GET /api/analytics/deals/performance
     * Returns deal win/loss rate and performance metrics
     */
    router.get('/deals/performance', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '6months' } = req.query;
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

            const data = await withDbClient(pool, async (client) => {
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

                const metricsRow = result.rows[0];
                const closedTotal = parseInt(metricsRow.closed_total) || 1; // Prevent division by zero
                const wonCount = parseInt(metricsRow.won_count);

                return {
                    period,
                    metrics: {
                        closedTotal: parseInt(metricsRow.closed_total),
                        wonCount: wonCount,
                        lostCount: parseInt(metricsRow.lost_count),
                        winRate: Math.round((wonCount / closedTotal) * 100),
                        avgDealValue: parseFloat(metricsRow.avg_deal_value).toFixed(2),
                        totalRevenue: parseFloat(metricsRow.total_revenue).toFixed(2),
                        avgDaysToClose: Math.round(parseFloat(metricsRow.avg_days_to_close))
                    }
                };
            });
            return sendSuccess(res, data);
        } catch (error) {
            console.error('Error fetching deal performance:', error);
            return sendError(res, 'Internal server error');
        }
    });

    /**
     * GET /api/analytics/bookings/summary
     * Returns booking statistics
     */
    router.get('/bookings/summary', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const orgId = req.organizationId;

            const summary = await withDbClient(pool, async (client) => {
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

                const data = result.rows[0];
                const totalCompleted = parseInt(data.completed) + parseInt(data.no_show);
                const completionRate = totalCompleted > 0
                    ? Math.round((parseInt(data.completed) / totalCompleted) * 100)
                    : 0;

                return {
                    total: parseInt(data.total),
                    confirmed: parseInt(data.confirmed),
                    completed: parseInt(data.completed),
                    cancelled: parseInt(data.cancelled),
                    noShow: parseInt(data.no_show),
                    createdThisMonth: parseInt(data.created_this_month),
                    upcoming: parseInt(data.upcoming),
                    completionRate
                };
            });

            return sendSuccess(res, summary);
        } catch (error) {
            console.error('Error fetching booking summary:', error);
            return sendError(res, 'Internal server error');
        }
    });

    return router;
};
