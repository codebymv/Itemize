const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendError } = require('../../utils/response');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

// Analytics
    // ======================

    /**
     * GET /api/reputation/analytics - Get reputation analytics
     */
    router.get('/analytics', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '30' } = req.query;
            const days = parseInt(period);
            
            const {
                overallStats,
                periodStats,
                ratingDist,
                platformDist,
                reviewsOverTime,
                requestStats
            } = await withDbClient(pool, async (client) => {
                // Overall stats
                const overallStats = await client.query(`
                    SELECT 
                        COUNT(*) as total_reviews,
                        COALESCE(AVG(rating), 0) as average_rating,
                        COUNT(*) FILTER (WHERE rating >= 4) as positive_reviews,
                        COUNT(*) FILTER (WHERE rating <= 2) as negative_reviews,
                        COUNT(*) FILTER (WHERE status = 'new') as new_reviews,
                        COUNT(*) FILTER (WHERE status = 'responded') as responded_reviews
                    FROM reviews
                    WHERE organization_id = $1
                `, [req.organizationId]);

                // Period stats
                const periodStats = await client.query(`
                    SELECT 
                        COUNT(*) as reviews_count,
                        COALESCE(AVG(rating), 0) as average_rating
                    FROM reviews
                    WHERE organization_id = $1 AND review_date >= NOW() - INTERVAL '${days} days'
                `, [req.organizationId]);

                // Rating distribution
                const ratingDist = await client.query(`
                    SELECT rating, COUNT(*) as count
                    FROM reviews
                    WHERE organization_id = $1
                    GROUP BY rating
                    ORDER BY rating DESC
                `, [req.organizationId]);

                // Platform distribution
                const platformDist = await client.query(`
                    SELECT platform, COUNT(*) as count, COALESCE(AVG(rating), 0) as avg_rating
                    FROM reviews
                    WHERE organization_id = $1
                    GROUP BY platform
                    ORDER BY count DESC
                `, [req.organizationId]);

                // Reviews over time (last 30 days)
                const reviewsOverTime = await client.query(`
                    SELECT 
                        DATE_TRUNC('day', review_date) as date,
                        COUNT(*) as count,
                        AVG(rating) as avg_rating
                    FROM reviews
                    WHERE organization_id = $1 AND review_date >= NOW() - INTERVAL '30 days'
                    GROUP BY DATE_TRUNC('day', review_date)
                    ORDER BY date
                `, [req.organizationId]);

                // Request stats
                const requestStats = await client.query(`
                    SELECT 
                        COUNT(*) as total_sent,
                        COUNT(*) FILTER (WHERE clicked = TRUE) as clicked,
                        COUNT(*) FILTER (WHERE review_submitted = TRUE) as converted
                    FROM review_requests
                    WHERE organization_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
                `, [req.organizationId]);

                return {
                    overallStats,
                    periodStats,
                    ratingDist,
                    platformDist,
                    reviewsOverTime,
                    requestStats
                };
            });

            res.json({
                overall: overallStats.rows[0],
                period: {
                    days,
                    ...periodStats.rows[0]
                },
                rating_distribution: ratingDist.rows,
                platform_distribution: platformDist.rows,
                reviews_over_time: reviewsOverTime.rows,
                request_stats: requestStats.rows[0]
            });
        } catch (error) {
            console.error('Error fetching analytics:', error);
            return sendError(res, 'Failed to fetch analytics');
        }
    });

    // ======================

    return router;
};
