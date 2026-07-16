const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { withDbClient, withTransaction } = require('../../utils/db');
const { sendSuccess, sendCreated, sendBadRequest, sendNotFound, sendError } = require('../../utils/response');
const { WORKFLOW_TRIGGERS } = require('../../domain/workflowRegistry');
const {
    enqueueWorkflowTrigger,
    workflowTriggerEventKey,
} = require('../../services/workflowTriggerQueue');
const { PAYMENT_COLUMNS, selectColumns } = require('./columns');

module.exports = ({ pool, authenticateJWT, requireOrganization }) => {
    const router = express.Router();

    // ======================
    // Payments History
    // ======================

    /**
     * POST /api/invoices/payments - Record a manual organization payment
     */
    router.post('/payments', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        try {
            const {
                invoice_id,
                contact_id,
                amount,
                currency = 'USD',
                payment_method = 'other',
                status = 'succeeded',
                payment_date,
                notes,
            } = req.body || {};
            const parsedAmount = Number(amount);
            const allowedMethods = ['card', 'bank_transfer', 'cash', 'check', 'other'];
            const allowedStatuses = ['pending', 'processing', 'succeeded', 'failed'];

            if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                return sendBadRequest(res, 'Valid amount is required', 'amount');
            }
            if (!allowedMethods.includes(payment_method)) {
                return sendBadRequest(res, 'Invalid payment method', 'payment_method');
            }
            if (!allowedStatuses.includes(status)) {
                return sendBadRequest(res, 'Invalid payment status', 'status');
            }
            if (!/^[A-Za-z]{3}$/.test(currency)) {
                return sendBadRequest(res, 'Currency must be a three-letter code', 'currency');
            }

            const paymentResult = await withTransaction(pool, async (client) => {
                let invoice = null;
                if (invoice_id != null) {
                    const invoiceResult = await client.query(
                        `SELECT id, contact_id, total, amount_paid, status
                         FROM invoices
                         WHERE id = $1 AND organization_id = $2
                         FOR UPDATE`,
                        [invoice_id, req.organizationId]
                    );
                    if (invoiceResult.rows.length === 0) return { notFound: 'Invoice' };
                    invoice = invoiceResult.rows[0];
                }

                const effectiveContactId = contact_id ?? invoice?.contact_id ?? null;
                if (effectiveContactId != null) {
                    const contactResult = await client.query(
                        'SELECT id FROM contacts WHERE id = $1 AND organization_id = $2',
                        [effectiveContactId, req.organizationId]
                    );
                    if (contactResult.rows.length === 0) return { notFound: 'Contact' };
                }

                const paymentInsert = await client.query(`
                    INSERT INTO payments (
                        organization_id, invoice_id, contact_id, amount, currency,
                        payment_method, status, paid_at, notes
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7,
                        CASE WHEN $7 = 'succeeded' THEN COALESCE($8::timestamptz, CURRENT_TIMESTAMP) ELSE NULL END,
                        $9
                    )
                    RETURNING ${selectColumns(PAYMENT_COLUMNS)}
                `, [
                    req.organizationId,
                    invoice?.id || null,
                    effectiveContactId,
                    parsedAmount,
                    currency.toUpperCase(),
                    payment_method,
                    status,
                    payment_date || null,
                    notes || null,
                ]);

                let invoiceUpdate = null;
                if (invoice && status === 'succeeded') {
                    const newAmountPaid = Number(invoice.amount_paid || 0) + parsedAmount;
                    const newAmountDue = Math.max(0, Number(invoice.total) - newAmountPaid);
                    const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';
                    await client.query(`
                        UPDATE invoices SET
                            amount_paid = $1,
                            amount_due = $2,
                            status = $3::VARCHAR(20),
                            paid_at = CASE WHEN $3::VARCHAR(20) = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $4
                    `, [newAmountPaid, newAmountDue, newStatus, invoice.id]);
                    invoiceUpdate = { amount_paid: newAmountPaid, amount_due: newAmountDue, status: newStatus };

                    if (newStatus === 'paid' && invoice.status !== 'paid') {
                        await enqueueWorkflowTrigger(client, {
                            contactId: effectiveContactId,
                            entityId: invoice.id,
                            entityType: 'invoice',
                            eventKey: workflowTriggerEventKey(
                                'domain',
                                `invoice_paid:${invoice.id}`
                            ),
                            organizationId: req.organizationId,
                            payload: {
                                amount_paid: newAmountPaid,
                                invoice_id: invoice.id,
                                payment_id: paymentInsert.rows[0].id,
                                payment_method,
                                total: Number(invoice.total),
                            },
                            triggerType: WORKFLOW_TRIGGERS.INVOICE_PAID,
                        });
                    }
                }

                return { payment: paymentInsert.rows[0], invoice: invoiceUpdate };
            });

            if (paymentResult.notFound) return sendNotFound(res, paymentResult.notFound);
            return sendCreated(res, paymentResult);
        } catch (error) {
            console.error('Error recording payment:', error);
            return sendError(res, 'Failed to record payment');
        }
    }));

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
