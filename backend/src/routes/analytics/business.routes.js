const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendError, sendBadRequest } = require('../../utils/response');
const { percentage, resolvePeriod, toInteger, toNumber } = require('../../services/analyticsParameters');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * GET /api/analytics/deals/performance
     * Returns deal win/loss rate and performance metrics
     */
    router.get('/deals/performance', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const periodConfig = resolvePeriod('deals', req.query.period, '6months');
            if (!periodConfig) return sendBadRequest(res, 'Unsupported analytics period', 'period');

            const { period, interval } = periodConfig;
            const orgId = req.organizationId;

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
          AND (won_at >= NOW() - $2::interval OR lost_at >= NOW() - $2::interval)
      `, [orgId, interval]);

                const metricsRow = result.rows[0];
                const closedTotal = toInteger(metricsRow.closed_total);
                const wonCount = toInteger(metricsRow.won_count);

                return {
                    period,
                    metrics: {
                        closedTotal,
                        wonCount: wonCount,
                        lostCount: toInteger(metricsRow.lost_count),
                        winRate: percentage(wonCount, closedTotal),
                        avgDealValue: toNumber(metricsRow.avg_deal_value),
                        totalRevenue: toNumber(metricsRow.total_revenue),
                        avgDaysToClose: Math.round(toNumber(metricsRow.avg_days_to_close))
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
          COUNT(*) FILTER (
            WHERE start_time >= NOW() AND status IN ('pending', 'confirmed')
          ) as upcoming
        FROM bookings
        WHERE organization_id = $1
      `, [orgId]);

                const data = result.rows[0];
                const completed = toInteger(data.completed);
                const noShow = toInteger(data.no_show);
                const completionRate = percentage(completed, completed + noShow);

                return {
                    total: toInteger(data.total),
                    confirmed: toInteger(data.confirmed),
                    completed,
                    cancelled: toInteger(data.cancelled),
                    noShow,
                    createdThisMonth: toInteger(data.created_this_month),
                    upcoming: toInteger(data.upcoming),
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
