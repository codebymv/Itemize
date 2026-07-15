const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { logger } = require('../../utils/logger');
const { withTransaction } = require('../../utils/db');
const { sendSuccess, sendBadRequest, sendError } = require('../../utils/response');
const { processStripeInvoiceWebhook } = require('../../services/stripeInvoiceWebhookService');

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
            const webhookResult = await withTransaction(
                pool,
                client => processStripeInvoiceWebhook(client, event, logger)
            );

            sendSuccess(res, webhookResult);
        } catch (error) {
            console.error('Error processing Stripe webhook:', error);
            return sendError(res, 'Webhook processing failed');
        }
    }));

    return router;
};
