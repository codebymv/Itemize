/**
 * @deprecated Use ./billing.routes.js instead (simplified gleamai pattern)
 * This file is kept for backward compatibility.
 * 
 * Subscription Routes
 * Handles subscription management, billing, and plan changes
 */

const express = require('express');
const { body, query } = require('express-validator');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const StripeSubscriptionService = require('../services/stripeSubscriptionService');
const UsageTrackingService = require('../services/usageTrackingService');

module.exports = (pool) => {
    const router = express.Router();
    
    // Initialize services
    const stripeService = new StripeSubscriptionService(pool);
    const usageService = new UsageTrackingService(pool);
    
    // Import auth middleware
    const { authenticateJWT } = require('../auth');
    const { requireOrganization } = require('../middleware/organization')(pool);

    // Validators
    const checkoutValidator = [
        body('planName').isIn(['starter', 'unlimited', 'pro']).withMessage('Invalid plan name'),
        body('billingPeriod').isIn(['monthly', 'yearly']).withMessage('Invalid billing period'),
        body('successUrl').isURL().withMessage('Valid success URL required'),
        body('cancelUrl').isURL().withMessage('Valid cancel URL required')
    ];

    const updatePlanValidator = [
        body('planName').isIn(['starter', 'unlimited', 'pro']).withMessage('Invalid plan name'),
        body('billingPeriod').isIn(['monthly', 'yearly']).withMessage('Invalid billing period')
    ];

    /**
     * GET /api/subscriptions/plans
     * Get all available subscription plans
     */
    router.get('/plans', asyncHandler(async (req, res) => {
        const plans = await stripeService.getAvailablePlans();
        
        res.json({
            success: true,
            data: plans.map(plan => ({
                id: plan.id,
                name: plan.name,
                displayName: plan.display_name,
                description: plan.description,
                tierLevel: plan.tier_level,
                pricing: {
                    monthly: parseFloat(plan.price_monthly),
                    yearly: parseFloat(plan.price_yearly),
                    yearlyMonthly: Math.round((parseFloat(plan.price_yearly) / 12) * 100) / 100
                },
                features: plan.features,
                limits: plan.limits,
                trialDays: plan.trial_days,
                isDefault: plan.is_default
            }))
        });
    }));

    /**
     * GET /api/subscriptions/current
     * Get current organization's subscription status
     */
    router.get('/current', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const subscription = await stripeService.getSubscriptionStatus(req.organizationId);
        
        if (!subscription) {
            return res.json({
                success: true,
                data: {
                    hasSubscription: false,
                    status: 'none'
                }
            });
        }

        res.json({
            success: true,
            data: {
                hasSubscription: true,
                status: subscription.status,
                planName: subscription.plan_name,
                displayName: subscription.display_name,
                tierLevel: subscription.tier_level,
                billingPeriod: subscription.billing_period,
                currentPeriod: {
                    start: subscription.current_period_start,
                    end: subscription.current_period_end
                },
                trial: subscription.trial_end ? {
                    endsAt: subscription.trial_end,
                    isActive: subscription.status === 'trialing'
                } : null,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
                features: subscription.features,
                limits: subscription.limits
            }
        });
    }));

    /**
     * GET /api/subscriptions/usage
     * Get current usage stats
     */
    router.get('/usage', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const usage = await usageService.getUsageStats(req.organizationId);
        
        res.json({
            success: true,
            data: usage
        });
    }));

    /**
     * GET /api/subscriptions/usage/history
     * Get usage history for analytics
     */
    router.get('/usage/history', 
        authenticateJWT, 
        requireOrganization,
        query('resourceType').optional().isString(),
        query('months').optional().isInt({ min: 1, max: 12 }).toInt(),
        asyncHandler(async (req, res) => {
            const resourceType = req.query.resourceType || 'emails_per_month';
            const months = req.query.months || 6;
            
            const history = await usageService.getUsageHistory(
                req.organizationId, 
                resourceType, 
                months
            );
            
            res.json({
                success: true,
                data: history
            });
        })
    );

    /**
     * POST /api/subscriptions/checkout
     * Create Stripe checkout session for subscription
     */
    router.post('/checkout', 
        authenticateJWT, 
        requireOrganization,
        checkoutValidator,
        asyncHandler(async (req, res) => {
            const { planName, billingPeriod, successUrl, cancelUrl } = req.body;

            // Check if Stripe is configured
            if (!stripeService.isConfigured()) {
                return res.status(503).json({
                    success: false,
                    error: {
                        message: 'Billing is not configured. Please contact support.',
                        code: 'BILLING_NOT_CONFIGURED'
                    }
                });
            }

            const session = await stripeService.createCheckoutSession(
                req.organizationId,
                planName,
                billingPeriod,
                successUrl,
                cancelUrl
            );

            logger.info('Checkout session created', { 
                organizationId: req.organizationId,
                planName,
                sessionId: session.id 
            });

            res.json({
                success: true,
                data: {
                    sessionId: session.id,
                    url: session.url
                }
            });
        })
    );

    /**
     * POST /api/subscriptions/portal
     * Create Stripe billing portal session
     */
    router.post('/portal',
        authenticateJWT,
        requireOrganization,
        body('returnUrl').isURL().withMessage('Valid return URL required'),
        asyncHandler(async (req, res) => {
            if (!stripeService.isConfigured()) {
                return res.status(503).json({
                    success: false,
                    error: {
                        message: 'Billing is not configured',
                        code: 'BILLING_NOT_CONFIGURED'
                    }
                });
            }

            const session = await stripeService.createPortalSession(
                req.organizationId,
                req.body.returnUrl
            );

            res.json({
                success: true,
                data: {
                    url: session.url
                }
            });
        })
    );

    /**
     * PUT /api/subscriptions/plan
     * Change subscription plan
     */
    router.put('/plan',
        authenticateJWT,
        requireOrganization,
        updatePlanValidator,
        asyncHandler(async (req, res) => {
            const { planName, billingPeriod } = req.body;

            if (!stripeService.isConfigured()) {
                return res.status(503).json({
                    success: false,
                    error: {
                        message: 'Billing is not configured',
                        code: 'BILLING_NOT_CONFIGURED'
                    }
                });
            }

            const subscription = await stripeService.updateSubscription(
                req.organizationId,
                planName,
                billingPeriod
            );

            logger.info('Subscription updated', { 
                organizationId: req.organizationId,
                newPlan: planName 
            });

            res.json({
                success: true,
                data: {
                    status: subscription.status,
                    planName
                }
            });
        })
    );

    /**
     * POST /api/subscriptions/cancel
     * Cancel subscription
     */
    router.post('/cancel',
        authenticateJWT,
        requireOrganization,
        body('immediate').optional().isBoolean(),
        asyncHandler(async (req, res) => {
            const immediate = req.body.immediate || false;

            if (!stripeService.isConfigured()) {
                return res.status(503).json({
                    success: false,
                    error: {
                        message: 'Billing is not configured',
                        code: 'BILLING_NOT_CONFIGURED'
                    }
                });
            }

            const result = await stripeService.cancelSubscription(
                req.organizationId,
                immediate
            );

            logger.info('Subscription canceled', { 
                organizationId: req.organizationId,
                immediate 
            });

            res.json({
                success: true,
                data: {
                    status: result.status,
                    cancelAtPeriodEnd: result.cancel_at_period_end,
                    canceledAt: result.canceled_at
                }
            });
        })
    );

    /**
     * POST /api/subscriptions/resume
     * Resume a subscription set to cancel at period end
     */
    router.post('/resume',
        authenticateJWT,
        requireOrganization,
        asyncHandler(async (req, res) => {
            if (!stripeService.isConfigured()) {
                return res.status(503).json({
                    success: false,
                    error: {
                        message: 'Billing is not configured',
                        code: 'BILLING_NOT_CONFIGURED'
                    }
                });
            }

            const result = await stripeService.resumeSubscription(req.organizationId);

            logger.info('Subscription resumed', { organizationId: req.organizationId });

            res.json({
                success: true,
                data: {
                    status: result.status,
                    cancelAtPeriodEnd: result.cancel_at_period_end
                }
            });
        })
    );

    /**
     * POST /api/subscriptions/webhook
     * Handle Stripe webhook events
     * Note: This endpoint should be mounted without JSON body parser
     */
    router.post('/webhook', 
        express.raw({ type: 'application/json' }),
        asyncHandler(async (req, res) => {
            if (!stripeService.isConfigured()) {
                return res.status(503).send('Webhook not configured');
            }

            const sig = req.headers['stripe-signature'];
            const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

            if (!webhookSecret) {
                logger.error('STRIPE_WEBHOOK_SECRET not configured');
                return res.status(500).send('Webhook secret not configured');
            }

            let event;
            try {
                const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
                event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
            } catch (err) {
                logger.error('Webhook signature verification failed', { error: err.message });
                return res.status(400).send(`Webhook Error: ${err.message}`);
            }

            // Process the event
            await stripeService.handleWebhookEvent(event);

            res.json({ received: true });
        })
    );

    /**
     * GET /api/subscriptions/features
     * Get available features for current plan
     */
    router.get('/features', authenticateJWT, requireOrganization, asyncHandler(async (req, res) => {
        const subscription = await stripeService.getSubscriptionStatus(req.organizationId);
        
        if (!subscription) {
            // Return free tier features
            return res.json({
                success: true,
                data: {
                    tierLevel: 0,
                    features: {},
                    limits: {}
                }
            });
        }

        res.json({
            success: true,
            data: {
                tierLevel: subscription.tier_level,
                planName: subscription.plan_name,
                features: subscription.features,
                limits: subscription.limits
            }
        });
    }));

    return router;
};
