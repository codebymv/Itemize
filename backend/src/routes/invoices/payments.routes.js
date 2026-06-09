const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendError } = require('../../utils/response');
const { PAYMENT_COLUMNS, selectColumns } = require('./columns');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

    // ======================
    // Payments History
    // ======================

    /**
     * GET /api/invoices/payments - List all payments
     */
    router.get('/payments', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const { status, payment_method, page = 1, limit = 50 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE p.organization_id = $1';
            const params = [req.organizationId];
            let paramIndex = 2;

            if (status && status !== 'all') {
                whereClause += ` AND p.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }

            if (payment_method && payment_method !== 'all') {
                whereClause += ` AND p.payment_method = $${paramIndex}`;
                params.push(payment_method);
                paramIndex++;
            }

            const paymentsData = await withDbClient(pool, async (client) => {
                const countResult = await client.query(
                    `SELECT COUNT(*) FROM payments p ${whereClause}`,
                    params
                );

                const result = await client.query(`
                    SELECT ${selectColumns(PAYMENT_COLUMNS, 'p')},
                        i.invoice_number,
                        c.first_name as contact_first_name, 
                        c.last_name as contact_last_name,
                        COALESCE(c.first_name || ' ' || c.last_name, i.customer_name) as contact_name
                    FROM payments p
                    LEFT JOIN invoices i ON p.invoice_id = i.id
                    LEFT JOIN contacts c ON p.contact_id = c.id
                    ${whereClause}
                    ORDER BY p.created_at DESC
                    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
                `, [...params, parseInt(limit), offset]);

                return {
                    payments: result.rows,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: parseInt(countResult.rows[0].count),
                        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
                    }
                };
            });

            sendSuccess(res, paymentsData);
        } catch (error) {
            console.error('Error fetching payments:', error);
            return sendError(res, 'Failed to fetch payments');
        }
    }));

    return router;
};
