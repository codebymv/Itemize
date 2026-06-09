const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { logger } = require('../../utils/logger');
const { withDbClient } = require('../../utils/db');
const { sendSuccess, sendBadRequest, sendError } = require('../../utils/response');

module.exports = ({ pool, stripe }) => {
    const router = express.Router();

    // ======================
    // Stripe Webhooks
    // ======================

    /**
     * POST /api/invoices/webhook/stripe - Stripe webhook handler
     */
    router.post('/webhook/stripe', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
        if (!stripe) {
            return sendBadRequest(res, 'Stripe not configured');
        }

        const sig = req.headers['stripe-signature'];
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
        const isProd = process.env.NODE_ENV === 'production';
        const devSkipVerify =
            !isProd &&
            process.env.STRIPE_WEBHOOK_SKIP_VERIFY === 'true';

        let event;

        try {
            if (isProd) {
                if (!endpointSecret || !sig) {
                    logger.warn('[Stripe webhook] Production requires STRIPE_WEBHOOK_SECRET and Stripe-Signature');
                    return sendBadRequest(res, 'Webhook verification required');
                }
                event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
            } else if (endpointSecret && sig) {
                event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
            } else if (devSkipVerify) {
                const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
                event = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } else if (!endpointSecret) {
                const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
                event = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } else {
                return sendBadRequest(res, 'Missing stripe-signature header');
            }
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return sendBadRequest(res, `Webhook Error: ${err.message}`);
        }

        try {
            const webhookResult = await withDbClient(pool, async (client) => {
                logger.info(`Processing Stripe webhook event: ${event.type}`);

                switch (event.type) {
                    // Checkout Session completed - customer finished the hosted checkout
                    case 'checkout.session.completed':
                        const session = event.data.object;
                        const invoiceId = session.metadata?.invoice_id;

                        logger.info(`Checkout session completed for invoice ${invoiceId}`, {
                            sessionId: session.id,
                            paymentStatus: session.payment_status,
                            amountTotal: session.amount_total
                        });

                        // Only process if payment was successful
                        if (invoiceId && session.payment_status === 'paid') {
                            // Record payment
                            await client.query(`
                                INSERT INTO payments (
                                    organization_id, invoice_id, amount, currency, payment_method, status,
                                    stripe_payment_intent_id, paid_at
                                ) VALUES (
                                    $1, $2, $3, $4, 'stripe', 'succeeded', $5, CURRENT_TIMESTAMP
                                )
                            `, [
                                session.metadata.organization_id,
                                invoiceId,
                                session.amount_total / 100,
                                (session.currency || 'usd').toUpperCase(),
                                session.payment_intent || session.id
                            ]);

                            // Update invoice
                            const invoiceResult = await client.query(
                                'SELECT total, amount_paid FROM invoices WHERE id = $1',
                                [invoiceId]
                            );

                            if (invoiceResult.rows.length > 0) {
                                const invoice = invoiceResult.rows[0];
                                const newAmountPaid = parseFloat(invoice.amount_paid) + (session.amount_total / 100);
                                const newAmountDue = parseFloat(invoice.total) - newAmountPaid;
                                const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

                                await client.query(`
                                    UPDATE invoices SET
                                        amount_paid = $1,
                                        amount_due = $2,
                                        status = $3::VARCHAR(20),
                                        paid_at = CASE WHEN $3::VARCHAR(20) = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END,
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE id = $4
                                `, [newAmountPaid, Math.max(0, newAmountDue), newStatus, invoiceId]);

                                logger.info(`Invoice ${invoiceId} updated: status=${newStatus}, amountPaid=${newAmountPaid}`);
                            }
                        }
                        break;

                    // Checkout session expired - customer abandoned checkout (optional handling)
                    case 'checkout.session.expired':
                        const expiredSession = event.data.object;
                        logger.info(`Checkout session expired`, {
                            sessionId: expiredSession.id,
                            invoiceId: expiredSession.metadata?.invoice_id
                        });
                        // No action needed - invoice remains unpaid
                        break;

                    default:
                        logger.debug(`Unhandled Stripe event type: ${event.type}`);
                }

                return { received: true };
            });

            sendSuccess(res, webhookResult);
        } catch (error) {
            console.error('Error processing Stripe webhook:', error);
            return sendError(res, 'Webhook processing failed');
        }
    }));

    return router;
};
