/**
 * Billing Routes - Stripe Integration
 * Simplified pattern following gleamai implementation
 */

const express = require('express');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendSuccess, sendBadRequest, sendNotFound } = require('../utils/response');
const StripeService = require('../services/stripe.service');
const { withTransaction } = require('../utils/db');
const {
    processStripeSubscriptionEvent,
    verifyStripeSubscriptionWebhook,
} = require('../services/subscriptionWebhookService');
const {
    getAllPlans,
    PLAN_TO_STRIPE_PRICES
} = require('../lib/subscription.constants');

module.exports = (pool, authenticateJWT, options = {}) => {
    const router = express.Router();
    const stripeService = new StripeService(pool);
    const processWebhookEvent = options.processWebhookEvent || processStripeSubscriptionEvent;
    const verifyWebhook = options.verifyWebhook || verifyStripeSubscriptionWebhook;
    const { requireOrganization } = require('../middleware/organization')(pool);

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

    // ============================================
    // Protected Routes (Require Auth)
    // ============================================

    // GET /api/billing - Get current billing status
    router.get('/', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const organizationId = req.organizationId;
        const billingStatus = await stripeService.getBillingStatus(organizationId);

        if (!billingStatus) {
            return sendNotFound(res, 'Organization');
        }

        return sendSuccess(res, billingStatus);
    }));

    // GET /api/billing/plans - Get all available plans
    router.get('/plans', asyncHandler(async (req, res) => {
        const plans = getAllPlans();
        return sendSuccess(res, plans);
    }));

    // POST /api/billing/checkout - Create Checkout Session
    router.post('/checkout', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const { priceId, planId, billingPeriod = 'monthly', mode = 'subscription', successUrl, cancelUrl } = req.body;
        const organizationId = req.organizationId;

        if (!successUrl || !cancelUrl) {
            return sendBadRequest(res, 'Missing required parameters: successUrl, cancelUrl');
        }

        // Resolve price ID from plan if not provided directly
        let resolvedPriceId = priceId;
        if (!resolvedPriceId && planId) {
            const planPrices = PLAN_TO_STRIPE_PRICES[planId];
            if (planPrices) {
                resolvedPriceId = planPrices[billingPeriod];
            }
        }

        if (!resolvedPriceId) {
            return sendBadRequest(res, 'Invalid plan or price ID');
        }

        const url = await stripeService.createCheckoutSession(
            organizationId,
            resolvedPriceId,
            mode,
            successUrl,
            cancelUrl
        );

        return sendSuccess(res, { url });
    }));

    // POST /api/billing/portal - Create Customer Portal Session
    router.post('/portal', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const { returnUrl } = req.body;
        const organizationId = req.organizationId;

        if (!returnUrl) {
            return sendBadRequest(res, 'Return URL is required');
        }

        const url = await stripeService.createPortalSession(
            organizationId,
            returnUrl
        );

        return sendSuccess(res, { url });
    }));

    // POST /api/billing/acknowledge-trial-end - Mark trial end as acknowledged
    router.post('/acknowledge-trial-end', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const organizationId = req.organizationId;
        await pool.query(
            'UPDATE organizations SET trial_end_acknowledged_at = NOW() WHERE id = $1',
            [organizationId]
        );

        return sendSuccess(res, { acknowledged: true });
    }));

    // GET /api/billing/usage - Get current usage stats
    router.get('/usage', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const organizationId = req.organizationId;
        // Get usage from organization record
        const result = await pool.query(`
            SELECT 
                emails_used,
                emails_limit,
                sms_used,
                sms_limit,
                api_calls_used,
                api_calls_limit,
                billing_period_start,
                billing_period_end
            FROM organizations
            WHERE id = $1
        `, [organizationId]);

        if (!result.rows[0]) {
            return sendNotFound(res, 'Organization');
        }

        const org = result.rows[0];

        // Count current resource counts
        const [contacts, workflows, forms, landingPages] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM contacts WHERE organization_id = $1', [organizationId]),
            pool.query('SELECT COUNT(*) FROM workflows WHERE organization_id = $1', [organizationId]),
            pool.query('SELECT COUNT(*) FROM forms WHERE organization_id = $1', [organizationId]),
            pool.query('SELECT COUNT(*) FROM pages WHERE organization_id = $1', [organizationId])
        ]);

        return sendSuccess(res, {
            period: {
                start: org.billing_period_start,
                end: org.billing_period_end
            },
            usage: {
                emails: {
                    used: org.emails_used || 0,
                    limit: org.emails_limit === -1 ? 'unlimited' : org.emails_limit,
                    percentage: org.emails_limit === -1 ? 0 : Math.round((org.emails_used / org.emails_limit) * 100)
                },
                sms: {
                    used: org.sms_used || 0,
                    limit: org.sms_limit === -1 ? 'unlimited' : org.sms_limit,
                    percentage: org.sms_limit === -1 ? 0 : Math.round((org.sms_used / org.sms_limit) * 100)
                },
                apiCalls: {
                    used: org.api_calls_used || 0,
                    limit: org.api_calls_limit === -1 ? 'unlimited' : org.api_calls_limit,
                    percentage: org.api_calls_limit === -1 ? 0 : Math.round((org.api_calls_used / org.api_calls_limit) * 100)
                }
            },
            resources: {
                contacts: parseInt(contacts.rows[0].count),
                workflows: parseInt(workflows.rows[0].count),
                forms: parseInt(forms.rows[0].count),
                landingPages: parseInt(landingPages.rows[0].count)
            }
        });
    }));

    return router;
};
