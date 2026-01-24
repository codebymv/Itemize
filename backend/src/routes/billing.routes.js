/**
 * Billing Routes - Stripe Integration
 * Simplified pattern following gleamai implementation
 */

const express = require('express');
const { logger } = require('../utils/logger');
const StripeService = require('../services/stripe.service');
const {
    getAllPlans,
    PLAN_TO_STRIPE_PRICES,
    PLANS
} = require('../lib/subscription.constants');

module.exports = (pool, authenticateJWT) => {
    const router = express.Router();
    const stripeService = new StripeService(pool);

    // ============================================
    // Public Webhook Route (No Auth)
    // Must be defined BEFORE body parsing middleware
    // ============================================
    
    router.post('/webhook', 
        express.raw({ type: 'application/json' }),
        async (req, res) => {
            const sig = req.headers['stripe-signature'];

            if (!sig) {
                return res.status(400).send('Webhook Error: Missing signature');
            }

            try {
                await stripeService.handleWebhook(sig, req.body);
                res.json({ received: true });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                logger.error(`[Billing] Webhook Error: ${message}`);
                res.status(400).send(`Webhook Error: ${message}`);
            }
        }
    );

    // ============================================
    // Protected Routes (Require Auth)
    // ============================================

    // GET /api/billing - Get current billing status
    router.get('/', authenticateJWT, async (req, res, next) => {
        try {
            const organizationId = req.user.organization_id;
            if (!organizationId) {
                return res.status(400).json({
                    success: false,
                    error: 'No organization associated with user'
                });
            }

            const billingStatus = await stripeService.getBillingStatus(organizationId);

            if (!billingStatus) {
                return res.status(404).json({
                    success: false,
                    error: 'Organization not found'
                });
            }

            res.json({
                success: true,
                data: billingStatus
            });
        } catch (error) {
            logger.error('[Billing] Error getting billing status:', error);
            next(error);
        }
    });

    // GET /api/billing/plans - Get all available plans
    router.get('/plans', async (req, res, next) => {
        try {
            const plans = getAllPlans();
            res.json({
                success: true,
                data: plans
            });
        } catch (error) {
            logger.error('[Billing] Error getting plans:', error);
            next(error);
        }
    });

    // POST /api/billing/checkout - Create Checkout Session
    router.post('/checkout', authenticateJWT, async (req, res, next) => {
        try {
            const { priceId, planId, billingPeriod = 'monthly', mode = 'subscription', successUrl, cancelUrl } = req.body;
            const organizationId = req.user.organization_id;

            if (!organizationId) {
                return res.status(400).json({
                    success: false,
                    error: 'No organization associated with user'
                });
            }

            if (!successUrl || !cancelUrl) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required parameters: successUrl, cancelUrl'
                });
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
                return res.status(400).json({
                    success: false,
                    error: 'Invalid plan or price ID'
                });
            }

            const url = await stripeService.createCheckoutSession(
                organizationId,
                resolvedPriceId,
                mode,
                successUrl,
                cancelUrl
            );

            res.json({
                success: true,
                data: { url }
            });
        } catch (error) {
            logger.error('[Billing] Error creating checkout session:', error);
            next(error);
        }
    });

    // POST /api/billing/portal - Create Customer Portal Session
    router.post('/portal', authenticateJWT, async (req, res, next) => {
        try {
            const { returnUrl } = req.body;
            const organizationId = req.user.organization_id;

            if (!organizationId) {
                return res.status(400).json({
                    success: false,
                    error: 'No organization associated with user'
                });
            }

            if (!returnUrl) {
                return res.status(400).json({
                    success: false,
                    error: 'Return URL is required'
                });
            }

            const url = await stripeService.createPortalSession(
                organizationId,
                returnUrl
            );

            res.json({
                success: true,
                data: { url }
            });
        } catch (error) {
            logger.error('[Billing] Error creating portal session:', error);
            next(error);
        }
    });

    // GET /api/billing/usage - Get current usage stats
    router.get('/usage', authenticateJWT, async (req, res, next) => {
        try {
            const organizationId = req.user.organization_id;
            if (!organizationId) {
                return res.status(400).json({
                    success: false,
                    error: 'No organization associated with user'
                });
            }

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
                return res.status(404).json({
                    success: false,
                    error: 'Organization not found'
                });
            }

            const org = result.rows[0];

            // Count current resource counts
            const [contacts, workflows, forms, landingPages] = await Promise.all([
                pool.query('SELECT COUNT(*) FROM contacts WHERE organization_id = $1', [organizationId]),
                pool.query('SELECT COUNT(*) FROM workflows WHERE organization_id = $1', [organizationId]),
                pool.query('SELECT COUNT(*) FROM forms WHERE organization_id = $1', [organizationId]),
                pool.query('SELECT COUNT(*) FROM pages WHERE organization_id = $1', [organizationId])
            ]);

            res.json({
                success: true,
                data: {
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
                }
            });
        } catch (error) {
            logger.error('[Billing] Error getting usage:', error);
            next(error);
        }
    });

    return router;
};
