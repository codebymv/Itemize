const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendError } = require('../../utils/response');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * GET /api/analytics/communication-stats
     * Returns email and SMS statistics
     */
    router.get('/communication-stats', authenticateJWT, requireOrganization, async (req, res) => {
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
                default:
                    interval = '30 days';
            }

            // Run email and SMS queries in parallel
            const stats = await withDbClient(pool, async (client) => {
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

                return {
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

                return {
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
