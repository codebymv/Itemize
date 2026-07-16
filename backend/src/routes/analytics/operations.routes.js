const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendError, sendBadRequest } = require('../../utils/response');
const {
    createSerializedQueryClient,
    percentage,
    resolvePeriod,
    toInteger,
} = require('../../services/analyticsParameters');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * GET /api/analytics/communication-stats
     * Returns email and SMS statistics
     */
    router.get('/communication-stats', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const periodConfig = resolvePeriod('communications', req.query.period, '30days');
            if (!periodConfig) return sendBadRequest(res, 'Unsupported analytics period', 'period');

            const { period, interval } = periodConfig;
            const orgId = req.organizationId;

            // Run email and SMS queries in parallel
            const stats = await withDbClient(pool, async (rawClient) => {
                const client = createSerializedQueryClient(rawClient);
                const [emailResult, smsResult] = await Promise.all([
                    // Email stats
                    client.query(`
                    SELECT
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'opened', 'clicked')) as sent,
                        COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked')) as delivered,
                        COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')) as opened,
                        COUNT(*) FILTER (WHERE status = 'clicked') as clicked,
                        COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
                        COUNT(*) FILTER (WHERE status = 'failed') as failed
                    FROM email_logs
                    WHERE organization_id = $1
                        AND queued_at >= NOW() - $2::interval
                `, [orgId, interval]),

                    // SMS stats
                    client.query(`
                    SELECT
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE direction = 'outbound') as outbound,
                        COUNT(*) FILTER (WHERE direction = 'inbound') as inbound,
                        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered')) as sent,
                        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
                        COUNT(*) FILTER (WHERE status = 'failed') as failed,
                        COALESCE(SUM(segments), 0) as total_segments
                    FROM sms_logs
                    WHERE organization_id = $1
                        AND queued_at >= NOW() - $2::interval
                `, [orgId, interval])
                ]);

                const email = emailResult.rows[0];
                const sms = smsResult.rows[0];

                // Calculate email rates
                const emailTotal = toInteger(email.total);
                const emailDelivered = toInteger(email.delivered);
                const emailOpened = toInteger(email.opened);
                const deliveryRate = percentage(emailDelivered, emailTotal);
                const openRate = percentage(emailOpened, emailDelivered);
                const clickRate = percentage(toInteger(email.clicked), emailOpened);

                // Calculate SMS rates
                const smsOutbound = toInteger(sms.outbound);
                const smsDeliveryRate = percentage(toInteger(sms.delivered), smsOutbound);

                return {
                    period,
                    email: {
                        total: emailTotal,
                        sent: toInteger(email.sent),
                        delivered: emailDelivered,
                        opened: emailOpened,
                        clicked: toInteger(email.clicked),
                        bounced: toInteger(email.bounced),
                        failed: toInteger(email.failed),
                        rates: {
                            delivery: deliveryRate,
                            open: openRate,
                            click: clickRate
                        }
                    },
                    sms: {
                        total: toInteger(sms.total),
                        outbound: smsOutbound,
                        inbound: toInteger(sms.inbound),
                        sent: toInteger(sms.sent),
                        delivered: toInteger(sms.delivered),
                        failed: toInteger(sms.failed),
                        segments: toInteger(sms.total_segments),
                        rates: {
                            delivery: smsDeliveryRate
                        }
                    }
                };
            });
            return sendSuccess(res, stats);
        } catch (error) {
            console.error('Error fetching communication stats:', error);
            return sendError(res, 'Internal server error');
        }
    });

    /**
     * GET /api/analytics/workflow-performance
     * Returns workflow automation performance metrics
     */
    router.get('/workflow-performance', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const orgId = req.organizationId;

            const performance = await withDbClient(pool, async (client) => {
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

                const workflows = result.rows.map(row => {
                    const total = toInteger(row.total_enrollments);
                    const completed = toInteger(row.completed);
                    return {
                        id: row.id,
                        name: row.name,
                        triggerType: row.trigger_type,
                        isActive: row.is_active,
                        enrollments: {
                            total,
                            completed: completed,
                            active: toInteger(row.active),
                            failed: toInteger(row.failed)
                        },
                        completionRate: percentage(completed, total),
                        stats: row.stats
                    };
                });

                // Summary stats
                const totalEnrollments = workflows.reduce((sum, w) => sum + w.enrollments.total, 0);
                const totalCompleted = workflows.reduce((sum, w) => sum + w.enrollments.completed, 0);
                const totalActive = workflows.reduce((sum, w) => sum + w.enrollments.active, 0);
                const totalFailed = workflows.reduce((sum, w) => sum + w.enrollments.failed, 0);

                return {
                    workflows,
                    summary: {
                        totalWorkflows: workflows.length,
                        activeWorkflows: workflows.filter(w => w.isActive).length,
                        totalEnrollments,
                        completedEnrollments: totalCompleted,
                        activeEnrollments: totalActive,
                        failedEnrollments: totalFailed,
                        overallCompletionRate: percentage(totalCompleted, totalEnrollments)
                    }
                };
            });
            return sendSuccess(res, performance);
        } catch (error) {
            console.error('Error fetching workflow performance:', error);
            return sendError(res, 'Internal server error');
        }
    });

    return router;
};
