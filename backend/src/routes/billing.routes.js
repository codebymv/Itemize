/**
 * Billing Routes - Stripe Integration
 * Stripe's signed subscription webhook remains HTTP by protocol.
 * Authenticated billing application operations are owned by BillingModule.
 */

const express = require('express');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const StripeService = require('../services/stripe.service');
const { withTransaction } = require('../utils/db');
const {
    processStripeSubscriptionEvent,
    verifyStripeSubscriptionWebhook,
} = require('../services/subscriptionWebhookService');

module.exports = (pool, _authenticateJWT, options = {}) => {
    const router = express.Router();
    const stripeService = new StripeService(pool);
    const processWebhookEvent = options.processWebhookEvent || processStripeSubscriptionEvent;
    const verifyWebhook = options.verifyWebhook || verifyStripeSubscriptionWebhook;

    // ============================================
    // Public Webhook Route (No Auth)
    // Must be defined BEFORE body parsing middleware
    // ============================================
    
    router.post('/webhook', 
        express.raw({ type: 'application/json' }),
        asyncHandler(async (req, res) => {
            const sig = req.headers['stripe-signature'];

            if (!sig) {
                return res.status(400).send('Webhook Error: Missing signature');
            }

            let event;
            try {
                event = verifyWebhook({
                    payload: req.body,
                    signature: sig,
                    stripe: stripeService.stripe,
                });
            } catch (error) {
                if (error.code === 'WEBHOOK_NOT_CONFIGURED') {
                    logger.error('[Billing] Stripe webhook secret is not configured');
                    return res.status(503).json({ error: 'Webhook verification unavailable' });
                }
                logger.warn('[Billing] Stripe webhook verification failed', { reason: error.message });
                return res.status(400).json({ error: 'Invalid webhook' });
            }

            let result;
            try {
                result = await withTransaction(
                    pool,
                    client => processWebhookEvent(client, event)
                );
            } catch (error) {
                if (error.message.startsWith('Invalid Stripe ')) {
                    return res.status(400).json({ error: 'Invalid webhook event' });
                }
                logger.error('[Billing] Stripe webhook processing failed', { error: error.message });
                return res.status(500).json({ error: 'Webhook processing failed' });
            }

            return res.json({ received: true, ...result });
        })
    );

    return router;
};
