const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendError } = require('../../utils/response');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * GET /api/social/analytics - Get social messaging analytics
     */
    router.get('/analytics', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const { period = '30' } = req.query;
            const days = parseInt(period);
            const { channelStats, responseStats, messagesOverTime, statusDist } = await withDbClient(pool, async (client) => {
                // Channel stats
                const channelStats = await client.query(`
                    SELECT
                        ch.channel_type,
                        COUNT(DISTINCT sc.id) as conversation_count,
                        COUNT(sm.id) as message_count,
                        COUNT(sm.id) FILTER (WHERE sm.direction = 'inbound') as inbound_count,
                        COUNT(sm.id) FILTER (WHERE sm.direction = 'outbound') as outbound_count
                    FROM social_channels ch
                    LEFT JOIN social_conversations sc ON ch.id = sc.channel_id
                    LEFT JOIN social_messages sm ON sc.id = sm.conversation_id
                        AND sm.created_at >= NOW() - INTERVAL '${days} days'
                    WHERE ch.organization_id = $1 AND ch.is_connected = TRUE
                    GROUP BY ch.channel_type
                `, [req.organizationId]);

                // Response time
                const responseStats = await client.query(`
                    SELECT
                        AVG(EXTRACT(EPOCH FROM (outbound.message_timestamp - inbound.message_timestamp)) / 60) as avg_response_minutes
                    FROM social_messages inbound
                    JOIN social_messages outbound ON inbound.conversation_id = outbound.conversation_id
                    WHERE inbound.organization_id = $1
                        AND inbound.direction = 'inbound'
                        AND outbound.direction = 'outbound'
                        AND outbound.message_timestamp > inbound.message_timestamp
                        AND inbound.created_at >= NOW() - INTERVAL '${days} days'
                `, [req.organizationId]);

                // Messages over time
                const messagesOverTime = await client.query(`
                    SELECT
                        DATE_TRUNC('day', message_timestamp) as date,
                        COUNT(*) FILTER (WHERE direction = 'inbound') as inbound,
                        COUNT(*) FILTER (WHERE direction = 'outbound') as outbound
                    FROM social_messages
                    WHERE organization_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
                    GROUP BY DATE_TRUNC('day', message_timestamp)
                    ORDER BY date
                `, [req.organizationId]);

                // Conversation status distribution
                const statusDist = await client.query(`
                    SELECT status, COUNT(*) as count
                    FROM social_conversations
                    WHERE organization_id = $1
                    GROUP BY status
                `, [req.organizationId]);

                return { channelStats, responseStats, messagesOverTime, statusDist };
            });

            res.json({
                period: days,
                channels: channelStats.rows,
                avg_response_time_minutes: responseStats.rows[0]?.avg_response_minutes || null,
                messages_over_time: messagesOverTime.rows,
                status_distribution: statusDist.rows
            });
        } catch (error) {
            console.error('Error fetching social analytics:', error);
            return sendError(res, 'Failed to fetch analytics');
        }
    });

    return router;
};
