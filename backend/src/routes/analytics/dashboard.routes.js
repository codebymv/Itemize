const express = require('express');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendError } = require('../../utils/response');

module.exports = (pool, authenticateJWT, requireOrganization) => {
    const router = express.Router();

    /**
     * GET /api/analytics/dashboard
     * Returns summary statistics for the dashboard
     */
    router.get('/dashboard', authenticateJWT, requireOrganization, async (req, res) => {
        try {
            const orgId = req.organizationId;
            const analytics = await withDbClient(pool, async (client) => {

            // Run all queries in parallel for performance
            const [
                contactsResult,
                contactGrowthResult,
                dealsResult,
                dealsByStageResult,
                bookingsResult,
                tasksResult,
                pipelinesResult,
                recentActivityResult,
                paymentsResult,
                invoiceMetricsQuery,
                recentInvoicesQuery,
                signatureMetricsQuery,
                recentSignaturesQuery,
                workspaceMetricsQuery,
                recentWorkspaceQuery
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
        `, [orgId]),

                // Invoice payments revenue (succeeded payments)
                client.query(`
          SELECT
            COALESCE(SUM(amount), 0) as total_payments_revenue,
            COALESCE(SUM(amount) FILTER (WHERE paid_at >= NOW() - INTERVAL '30 days'), 0) as payments_this_month
          FROM payments
          WHERE organization_id = $1
            AND status = 'succeeded'
        `, [orgId]),

                // Invoice metrics for dashboard
                client.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'pending') as pending,
            COUNT(*) FILTER (WHERE status = 'overdue') as overdue,
            COALESCE(SUM(total) FILTER (WHERE paid_at IS NOT NULL
                   AND date_trunc('month', paid_at) = date_trunc('month', CURRENT_DATE)), 0) as paid_this_month,
            COUNT(*) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)) as invoice_count_this_month
          FROM invoices
          WHERE organization_id = $1
        `, [orgId]),

                // Recent invoices
                client.query(`
          SELECT id, invoice_number, total, status, created_at, due_date
          FROM invoices
          WHERE organization_id = $1
          ORDER BY created_at DESC
          LIMIT 5
        `, [orgId]),

                // Signature metrics for dashboard
                client.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'awaiting' OR status = 'sent') as awaiting_signatures,
            COUNT(*) FILTER (WHERE status = 'completed' AND date_trunc('week', completed_at) = date_trunc('week', CURRENT_DATE)) as signed_this_week,
            COUNT(*) FILTER (WHERE id IS NOT NULL) as total_signatures
          FROM signature_documents
          WHERE organization_id = $1
        `, [orgId]),

                // Recent signatures
                client.query(`
          SELECT id, title, status, created_at
          FROM signature_documents
          WHERE organization_id = $1
          ORDER BY created_at DESC
          LIMIT 5
        `, [orgId]),

                // Workspace metrics for dashboard
                client.query(`
          SELECT
            0 as active_items,
            COALESCE((SELECT COUNT(*) FROM lists WHERE organization_id = $1), 0) as lists_count,
            COALESCE((SELECT COUNT(*) FROM notes WHERE organization_id = $1), 0) as notes_count
        `, [orgId]),

                // Recent workspace items
                client.query(`
          SELECT type, title, created_at
          FROM (
            SELECT 'list' as type, title, created_at FROM lists
            WHERE organization_id = $1
            UNION ALL
            SELECT 'note' as type, title, created_at FROM notes
            WHERE organization_id = $1
          ) merged
          ORDER BY created_at DESC
          LIMIT 5
        `, [orgId])
            ]);

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

            // Combine deals revenue + invoice payments revenue
            const dealsRevenue = parseFloat(dealsResult.rows[0].won_value) || 0;
            const dealsRevenueThisMonth = parseFloat(dealsResult.rows[0].won_this_month) || 0;
            const paymentsRevenue = parseFloat(paymentsResult.rows[0].total_payments_revenue) || 0;
            const paymentsRevenueThisMonth = parseFloat(paymentsResult.rows[0].payments_this_month) || 0;

            const totalRevenueWon = dealsRevenue + paymentsRevenue;
            const totalRevenueThisMonth = dealsRevenueThisMonth + paymentsRevenueThisMonth;

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
                    wonValue: totalRevenueWon, // Combined: deals + invoice payments
                    wonThisMonth: totalRevenueThisMonth, // Combined: deals + invoice payments this month
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
                })),
                invoiceMetrics: {
                    pending: invoiceMetricsQuery.rows[0]?.pending || 0,
                    overdue: invoiceMetricsQuery.rows[0]?.overdue || 0,
                    paidThisMonth: invoiceMetricsQuery.rows[0]?.paid_this_month || 0,
                    countThisMonth: invoiceMetricsQuery.rows[0]?.invoice_count_this_month || 0,
                    recentInvoices: recentInvoicesQuery.rows.map(inv => ({
                        id: inv.id,
                        number: inv.invoice_number || `INV-${inv.id}`,
                        amount: inv.total || 0,
                        status: inv.status || 'draft'
                    }))
                },
                signatureMetrics: {
                    awaiting: signatureMetricsQuery.rows[0]?.awaiting_signatures || 0,
                    signedThisWeek: signatureMetricsQuery.rows[0]?.signed_this_week || 0,
                    total: signatureMetricsQuery.rows[0]?.total_signatures || 0,
                    recentDocuments: recentSignaturesQuery.rows.map(sig => ({
                        id: sig.id,
                        title: sig.title || 'Document',
                        status: sig.status || 'draft',
                        date: sig.created_at
                    }))
                },
                workspaceMetrics: {
                    activeItems: workspaceMetricsQuery.rows[0]?.active_items || 0,
                    lists: workspaceMetricsQuery.rows[0]?.lists_count || 0,
                    notes: workspaceMetricsQuery.rows[0]?.notes_count || 0,
                    recentItems: recentWorkspaceQuery.rows.map(item => ({
                        type: item.type,
                        title: item.title || 'Item',
                        date: item.created_at
                    }))
                }
            };

            return analytics;
            });
            return sendSuccess(res, analytics);
        } catch (error) {
            console.error('Error fetching dashboard analytics:', error);
            return sendError(res, 'Internal server error');
        }
    });

    return router;
};
