const express = require('express');
const { logger } = require('../../utils/logger');
const { withDbClient } = require('../../utils/db');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

// Analytics
    // ======================

    /**
     * GET /api/pages/:id/analytics - Get page analytics
     */
    router.get('/:id/analytics', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { id } = req.params;
            const { period = '30' } = req.query;
            const days = parseInt(period);

            const result = await withDbClient(pool, async (client) => {
                const pageCheck = await client.query(
                    'SELECT id, view_count, unique_visitors FROM pages WHERE id = $1 AND organization_id = $2',
                    [id, req.organizationId]
                );

                if (pageCheck.rows.length === 0) {
                    return { status: 'not_found' };
                }

                const overallStats = await client.query(`
                    SELECT 
                        COUNT(*) as total_views,
                        COUNT(DISTINCT visitor_id) as unique_visitors,
                        AVG(time_on_page) as avg_time_on_page,
                        AVG(scroll_depth) as avg_scroll_depth,
                        COUNT(*) FILTER (WHERE converted = TRUE) as conversions
                    FROM page_analytics
                    WHERE page_id = $1 AND viewed_at >= NOW() - INTERVAL '${days} days'
                `, [id]);

                const viewsOverTime = await client.query(`
                    SELECT 
                        DATE_TRUNC('day', viewed_at) as date,
                        COUNT(*) as views,
                        COUNT(DISTINCT visitor_id) as unique_visitors
                    FROM page_analytics
                    WHERE page_id = $1 AND viewed_at >= NOW() - INTERVAL '${days} days'
                    GROUP BY DATE_TRUNC('day', viewed_at)
                    ORDER BY date
                `, [id]);

                const deviceStats = await client.query(`
                    SELECT device_type, COUNT(*) as count
                    FROM page_analytics
                    WHERE page_id = $1 AND viewed_at >= NOW() - INTERVAL '${days} days'
                    GROUP BY device_type
                `, [id]);

                const referrerStats = await client.query(`
                    SELECT 
                        COALESCE(referrer, 'Direct') as referrer,
                        COUNT(*) as count
                    FROM page_analytics
                    WHERE page_id = $1 AND viewed_at >= NOW() - INTERVAL '${days} days'
                    GROUP BY referrer
                    ORDER BY count DESC
                    LIMIT 10
                `, [id]);

                const utmStats = await client.query(`
                    SELECT 
                        utm_source, utm_medium, utm_campaign,
                        COUNT(*) as count
                    FROM page_analytics
                    WHERE page_id = $1 AND viewed_at >= NOW() - INTERVAL '${days} days'
                        AND utm_source IS NOT NULL
                    GROUP BY utm_source, utm_medium, utm_campaign
                    ORDER BY count DESC
                    LIMIT 10
                `, [id]);

                return {
                    status: 'ok',
                    overall: overallStats.rows[0],
                    views_over_time: viewsOverTime.rows,
                    devices: deviceStats.rows,
                    referrers: referrerStats.rows,
                    utm_sources: utmStats.rows
                };
            });

            if (result.status === 'not_found') {
                return res.status(404).json({ error: 'Page not found' });
            }

            res.json({
                period: days,
                overall: result.overall,
                views_over_time: result.views_over_time,
                devices: result.devices,
                referrers: result.referrers,
                utm_sources: result.utm_sources
            });
        } catch (error) {
            logger.error('Error fetching analytics', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch analytics' });
        }
    });

    // ======================

    return router;
};
