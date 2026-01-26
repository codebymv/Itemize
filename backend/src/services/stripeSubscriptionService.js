/**
 * @deprecated Use ./stripe.service.js instead (simplified gleamai pattern)
 * This file is kept for backward compatibility with old subscription routes.
 * 
 * Stripe Subscription Service
 * Handles subscription management, checkout sessions, and billing portal
 */

const BaseService = require('./BaseService');
const Stripe = require('stripe');
const { PLAN_NAMES, PRICING, getTierLevel } = require('../config/plans');

class StripeSubscriptionService extends BaseService {
    constructor(pool) {
        super('StripeSubscriptionService', {
            maxRetries: 3,
            baseDelay: 1000,
            timeout: 30000
        });

        this.pool = pool;
        
        // Initialize Stripe with API key
        if (!process.env.STRIPE_SECRET_KEY) {
            this.logWarn('STRIPE_SECRET_KEY not configured - subscription features disabled');
            this.stripe = null;
        } else {
            this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
                apiVersion: '2023-10-16'
            });
        }
    }

    /**
     * Check if Stripe is configured
     */
    isConfigured() {
        return this.stripe !== null;
    }

    /**
     * Create or get Stripe customer for organization
     * @param {number} organizationId - Organization ID
     * @param {Object} orgData - Organization data (name, email)
     * @returns {Object} Stripe customer
     */
    async createOrGetCustomer(organizationId, orgData) {
        if (!this.isConfigured()) {
            throw new Error('Stripe is not configured');
        }

        return this.withRetry(async () => {
            // Check if organization already has a customer
            const existingResult = await this.pool.query(
                'SELECT stripe_customer_id FROM organizations WHERE id = $1',
                [organizationId]
            );

            if (existingResult.rows[0]?.stripe_customer_id) {
                // Return existing customer
                const customer = await this.stripe.customers.retrieve(
                    existingResult.rows[0].stripe_customer_id
                );
                return customer;
            }

            // Create new customer
            const customer = await this.stripe.customers.create({
                name: orgData.name,
                email: orgData.email,
                metadata: {
                    organizationId: organizationId.toString()
                }
            });

            // Save customer ID to organization
            await this.pool.query(
                'UPDATE organizations SET stripe_customer_id = $1 WHERE id = $2',
                [customer.id, organizationId]
            );

            this.logInfo('Created Stripe customer', { organizationId, customerId: customer.id });
            return customer;
        }, { organizationId });
    }

    /**
     * Create checkout session for subscription
     * @param {number} organizationId - Organization ID
     * @param {string} planName - Plan name (starter, unlimited, pro)
     * @param {string} billingPeriod - 'monthly' or 'yearly'
     * @param {string} successUrl - URL to redirect on success
     * @param {string} cancelUrl - URL to redirect on cancel
     * @returns {Object} Checkout session
     */
    async createCheckoutSession(organizationId, planName, billingPeriod, successUrl, cancelUrl) {
        if (!this.isConfigured()) {
            throw new Error('Stripe is not configured');
        }

        return this.withRetry(async () => {
            // Get organization and customer
            const orgResult = await this.pool.query(
                'SELECT name, stripe_customer_id FROM organizations WHERE id = $1',
                [organizationId]
            );
            const org = orgResult.rows[0];
            if (!org) {
                throw new Error('Organization not found');
            }

            // Get plan from database
            const planResult = await this.pool.query(
                `SELECT * FROM subscription_plans WHERE name = $1 AND is_active = true`,
                [planName]
            );
            const plan = planResult.rows[0];
            if (!plan) {
                throw new Error(`Plan '${planName}' not found`);
            }

            // Get price ID
            const priceId = billingPeriod === 'yearly' 
                ? plan.stripe_price_id_yearly 
                : plan.stripe_price_id_monthly;

            if (!priceId) {
                throw new Error(`Stripe price not configured for ${planName} ${billingPeriod}`);
            }

            // Get or create customer
            let customerId = org.stripe_customer_id;
            if (!customerId) {
                const customer = await this.createOrGetCustomer(organizationId, { name: org.name });
                customerId = customer.id;
            }

            // Create checkout session
            const session = await this.stripe.checkout.sessions.create({
                customer: customerId,
                mode: 'subscription',
                payment_method_types: ['card'],
                line_items: [{
                    price: priceId,
                    quantity: 1
                }],
                success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: cancelUrl,
                subscription_data: {
                    metadata: {
                        organizationId: organizationId.toString(),
                        planName
                    },
                    trial_period_days: plan.trial_days || 14
                },
                metadata: {
                    organizationId: organizationId.toString(),
                    planName,
                    billingPeriod
                }
            });

            this.logInfo('Created checkout session', { 
                organizationId, 
                planName, 
                billingPeriod,
                sessionId: session.id 
            });

            return session;
        }, { organizationId, planName });
    }

    /**
     * Create a Stripe checkout session with priceId directly (gleamai.dev pattern)
     * @param {number} organizationId - Organization ID
     * @param {string} priceId - Stripe price ID
     * @param {string} successUrl - URL to redirect on success
     * @param {string} cancelUrl - URL to redirect on cancel
     * @returns {Object} Checkout session
     */
    async createCheckoutSessionWithPriceId(organizationId, priceId, successUrl, cancelUrl) {
        if (!this.isConfigured()) {
            throw new Error('Stripe is not configured');
        }

        return this.withRetry(async () => {
            // Get organization and customer
            const orgResult = await this.pool.query(
                'SELECT name, stripe_customer_id FROM organizations WHERE id = $1',
                [organizationId]
            );
            const org = orgResult.rows[0];
            if (!org) {
                throw new Error('Organization not found');
            }

            // Get or create customer
            let customerId = org.stripe_customer_id;
            if (!customerId) {
                const customer = await this.createOrGetCustomer(organizationId, { name: org.name });
                customerId = customer.id;
            }

            // Create checkout session with priceId directly
            const session = await this.stripe.checkout.sessions.create({
                customer: customerId,
                mode: 'subscription',
                payment_method_types: ['card'],
                line_items: [{
                    price: priceId,
                    quantity: 1
                }],
                success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: cancelUrl,
                metadata: {
                    organizationId: organizationId.toString(),
                    priceId
                }
            });

            this.logInfo('Created checkout session with priceId', { 
                organizationId, 
                priceId,
                sessionId: session.id 
            });

            return session;
        }, { organizationId, priceId });
    }

    /**
     * Create billing portal session for customer self-service
     * @param {number} organizationId - Organization ID
     * @param {string} returnUrl - URL to return to after portal
     * @returns {Object} Portal session
     */
    async createPortalSession(organizationId, returnUrl) {
        if (!this.isConfigured()) {
            throw new Error('Stripe is not configured');
        }

        return this.withRetry(async () => {
            // Get customer ID
            const orgResult = await this.pool.query(
                'SELECT stripe_customer_id FROM organizations WHERE id = $1',
                [organizationId]
            );

            const customerId = orgResult.rows[0]?.stripe_customer_id;
            if (!customerId) {
                throw new Error('No billing account found. Please subscribe first.');
            }

            const session = await this.stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl
            });

            this.logInfo('Created portal session', { organizationId, sessionId: session.id });
            return session;
        }, { organizationId });
    }

    /**
     * Update subscription to a different plan
     * @param {number} organizationId - Organization ID
     * @param {string} newPlanName - New plan name
     * @param {string} billingPeriod - 'monthly' or 'yearly'
     * @returns {Object} Updated subscription
     */
    async updateSubscription(organizationId, newPlanName, billingPeriod) {
        if (!this.isConfigured()) {
            throw new Error('Stripe is not configured');
        }

        return this.withRetry(async () => {
            // Get current subscription
            const subResult = await this.pool.query(
                'SELECT stripe_subscription_id, plan_id FROM subscriptions WHERE organization_id = $1',
                [organizationId]
            );
            
            const currentSub = subResult.rows[0];
            if (!currentSub?.stripe_subscription_id) {
                throw new Error('No active subscription found');
            }

            // Get new plan
            const planResult = await this.pool.query(
                'SELECT * FROM subscription_plans WHERE name = $1 AND is_active = true',
                [newPlanName]
            );
            const newPlan = planResult.rows[0];
            if (!newPlan) {
                throw new Error(`Plan '${newPlanName}' not found`);
            }

            const priceId = billingPeriod === 'yearly'
                ? newPlan.stripe_price_id_yearly
                : newPlan.stripe_price_id_monthly;

            if (!priceId) {
                throw new Error(`Price not configured for ${newPlanName} ${billingPeriod}`);
            }

            // Get Stripe subscription to find the subscription item ID
            const stripeSub = await this.stripe.subscriptions.retrieve(currentSub.stripe_subscription_id);

            // Update subscription
            const updated = await this.stripe.subscriptions.update(
                currentSub.stripe_subscription_id,
                {
                    items: [{
                        id: stripeSub.items.data[0].id,
                        price: priceId
                    }],
                    proration_behavior: 'create_prorations',
                    metadata: {
                        planName: newPlanName,
                        billingPeriod
                    }
                }
            );

            // Log event
            await this.logSubscriptionEvent(organizationId, currentSub.stripe_subscription_id, 'plan_changed', {
                previousPlanId: currentSub.plan_id,
                newPlanId: newPlan.id,
                newPlanName,
                billingPeriod
            });

            this.logInfo('Updated subscription', { 
                organizationId, 
                newPlanName,
                subscriptionId: updated.id 
            });

            return updated;
        }, { organizationId, newPlanName });
    }

    /**
     * Cancel subscription
     * @param {number} organizationId - Organization ID
     * @param {boolean} immediate - Cancel immediately vs at period end
     * @returns {Object} Canceled subscription
     */
    async cancelSubscription(organizationId, immediate = false) {
        if (!this.isConfigured()) {
            throw new Error('Stripe is not configured');
        }

        return this.withRetry(async () => {
            const subResult = await this.pool.query(
                'SELECT stripe_subscription_id FROM subscriptions WHERE organization_id = $1',
                [organizationId]
            );

            const subscriptionId = subResult.rows[0]?.stripe_subscription_id;
            if (!subscriptionId) {
                throw new Error('No active subscription found');
            }

            let result;
            if (immediate) {
                result = await this.stripe.subscriptions.cancel(subscriptionId);
            } else {
                result = await this.stripe.subscriptions.update(subscriptionId, {
                    cancel_at_period_end: true
                });
            }

            await this.logSubscriptionEvent(organizationId, subscriptionId, 
                immediate ? 'canceled_immediately' : 'scheduled_cancellation', 
                { immediate }
            );

            this.logInfo('Canceled subscription', { 
                organizationId, 
                immediate,
                subscriptionId 
            });

            return result;
        }, { organizationId });
    }

    /**
     * Resume a subscription that was set to cancel at period end
     * @param {number} organizationId - Organization ID
     * @returns {Object} Resumed subscription
     */
    async resumeSubscription(organizationId) {
        if (!this.isConfigured()) {
            throw new Error('Stripe is not configured');
        }

        return this.withRetry(async () => {
            const subResult = await this.pool.query(
                'SELECT stripe_subscription_id FROM subscriptions WHERE organization_id = $1',
                [organizationId]
            );

            const subscriptionId = subResult.rows[0]?.stripe_subscription_id;
            if (!subscriptionId) {
                throw new Error('No subscription found');
            }

            const result = await this.stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: false
            });

            await this.logSubscriptionEvent(organizationId, subscriptionId, 'resumed', {});

            this.logInfo('Resumed subscription', { organizationId, subscriptionId });
            return result;
        }, { organizationId });
    }

    /**
     * Sync subscription from Stripe webhook data
     * @param {Object} stripeSubscription - Stripe subscription object
     */
    async syncSubscription(stripeSubscription) {
        const organizationId = parseInt(stripeSubscription.metadata?.organizationId);
        if (!organizationId) {
            this.logError('No organizationId in subscription metadata', { 
                subscriptionId: stripeSubscription.id 
            });
            return;
        }

        try {
            // Get plan from our database
            const planName = stripeSubscription.metadata?.planName;
            const planResult = await this.pool.query(
                'SELECT id FROM subscription_plans WHERE name = $1',
                [planName]
            );
            const planId = planResult.rows[0]?.id;

            // Determine billing period
            const priceId = stripeSubscription.items?.data[0]?.price?.id;
            let billingPeriod = 'monthly';
            if (priceId) {
                const checkYearly = await this.pool.query(
                    'SELECT 1 FROM subscription_plans WHERE stripe_price_id_yearly = $1',
                    [priceId]
                );
                if (checkYearly.rows.length > 0) {
                    billingPeriod = 'yearly';
                }
            }

            // Upsert subscription record
            await this.pool.query(`
                INSERT INTO subscriptions (
                    organization_id, plan_id, status, stripe_customer_id, 
                    stripe_subscription_id, billing_period, current_period_start,
                    current_period_end, trial_start, trial_end, canceled_at,
                    cancel_at_period_end, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
                ON CONFLICT (organization_id) DO UPDATE SET
                    plan_id = $2,
                    status = $3,
                    stripe_customer_id = $4,
                    stripe_subscription_id = $5,
                    billing_period = $6,
                    current_period_start = $7,
                    current_period_end = $8,
                    trial_start = $9,
                    trial_end = $10,
                    canceled_at = $11,
                    cancel_at_period_end = $12,
                    updated_at = NOW()
            `, [
                organizationId,
                planId,
                stripeSubscription.status,
                stripeSubscription.customer,
                stripeSubscription.id,
                billingPeriod,
                stripeSubscription.current_period_start 
                    ? new Date(stripeSubscription.current_period_start * 1000) 
                    : null,
                stripeSubscription.current_period_end 
                    ? new Date(stripeSubscription.current_period_end * 1000) 
                    : null,
                stripeSubscription.trial_start 
                    ? new Date(stripeSubscription.trial_start * 1000) 
                    : null,
                stripeSubscription.trial_end 
                    ? new Date(stripeSubscription.trial_end * 1000) 
                    : null,
                stripeSubscription.canceled_at 
                    ? new Date(stripeSubscription.canceled_at * 1000) 
                    : null,
                stripeSubscription.cancel_at_period_end
            ]);

            // Update organization status
            await this.pool.query(`
                UPDATE organizations SET 
                    subscription_status = $1,
                    current_plan_id = $2,
                    trial_ends_at = $3,
                    updated_at = NOW()
                WHERE id = $4
            `, [
                stripeSubscription.status,
                planId,
                stripeSubscription.trial_end 
                    ? new Date(stripeSubscription.trial_end * 1000) 
                    : null,
                organizationId
            ]);

            this.logInfo('Synced subscription', { 
                organizationId, 
                status: stripeSubscription.status,
                subscriptionId: stripeSubscription.id 
            });

        } catch (error) {
            this.logError('Failed to sync subscription', error);
            throw error;
        }
    }

    /**
     * Handle Stripe webhook event
     * @param {Object} event - Stripe webhook event
     */
    async handleWebhookEvent(event) {
        const eventType = event.type;
        const data = event.data.object;

        this.logInfo('Processing webhook', { eventType, eventId: event.id });

        try {
            switch (eventType) {
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    await this.syncSubscription(data);
                    break;

                case 'customer.subscription.deleted':
                    await this.handleSubscriptionDeleted(data);
                    break;

                case 'invoice.payment_succeeded':
                    await this.handlePaymentSucceeded(data);
                    break;

                case 'invoice.payment_failed':
                    await this.handlePaymentFailed(data);
                    break;

                case 'customer.subscription.trial_will_end':
                    await this.handleTrialEnding(data);
                    break;

                default:
                    this.logInfo('Unhandled webhook event type', { eventType });
            }
        } catch (error) {
            this.logError('Webhook processing failed', { eventType, error: error.message });
            throw error;
        }
    }

    /**
     * Handle subscription deleted event
     */
    async handleSubscriptionDeleted(subscription) {
        const organizationId = parseInt(subscription.metadata?.organizationId);
        if (!organizationId) return;

        await this.pool.query(`
            UPDATE subscriptions SET 
                status = 'canceled',
                canceled_at = NOW(),
                updated_at = NOW()
            WHERE organization_id = $1
        `, [organizationId]);

        await this.pool.query(`
            UPDATE organizations SET 
                subscription_status = 'canceled',
                updated_at = NOW()
            WHERE id = $1
        `, [organizationId]);

        await this.logSubscriptionEvent(organizationId, subscription.id, 'subscription_deleted', {});
    }

    /**
     * Handle successful payment
     */
    async handlePaymentSucceeded(invoice) {
        if (invoice.subscription) {
            const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription);
            const organizationId = parseInt(subscription.metadata?.organizationId);
            if (organizationId) {
                await this.logSubscriptionEvent(organizationId, invoice.subscription, 'payment_succeeded', {
                    amount: invoice.amount_paid,
                    invoiceId: invoice.id
                });
            }
        }
    }

    /**
     * Handle failed payment
     */
    async handlePaymentFailed(invoice) {
        if (invoice.subscription) {
            const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription);
            const organizationId = parseInt(subscription.metadata?.organizationId);
            if (organizationId) {
                // Update status to past_due
                await this.pool.query(`
                    UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
                    WHERE organization_id = $1
                `, [organizationId]);

                await this.pool.query(`
                    UPDATE organizations SET subscription_status = 'past_due', updated_at = NOW()
                    WHERE id = $1
                `, [organizationId]);

                await this.logSubscriptionEvent(organizationId, invoice.subscription, 'payment_failed', {
                    amount: invoice.amount_due,
                    invoiceId: invoice.id,
                    attemptCount: invoice.attempt_count
                });
            }
        }
    }

    /**
     * Handle trial ending soon notification
     */
    async handleTrialEnding(subscription) {
        const organizationId = parseInt(subscription.metadata?.organizationId);
        if (organizationId) {
            await this.logSubscriptionEvent(organizationId, subscription.id, 'trial_ending', {
                trialEnd: subscription.trial_end
            });
            // TODO: Send email notification
        }
    }

    /**
     * Log subscription event for audit trail
     */
    async logSubscriptionEvent(organizationId, subscriptionId, eventType, metadata) {
        try {
            // Get subscription ID from our database
            const subResult = await this.pool.query(
                'SELECT id, plan_id FROM subscriptions WHERE stripe_subscription_id = $1',
                [subscriptionId]
            );
            const dbSubscriptionId = subResult.rows[0]?.id;
            const previousPlanId = subResult.rows[0]?.plan_id;

            await this.pool.query(`
                INSERT INTO subscription_events (
                    subscription_id, organization_id, event_type,
                    previous_plan_id, metadata
                ) VALUES ($1, $2, $3, $4, $5)
            `, [
                dbSubscriptionId,
                organizationId,
                eventType,
                previousPlanId,
                JSON.stringify(metadata)
            ]);
        } catch (error) {
            this.logError('Failed to log subscription event', error);
        }
    }

    /**
     * Get subscription status for organization
     * @param {number} organizationId - Organization ID
     * @returns {Object} Subscription info
     */
    async getSubscriptionStatus(organizationId) {
        const result = await this.pool.query(`
            SELECT 
                s.*,
                sp.name as plan_name,
                sp.display_name,
                sp.tier_level,
                sp.price_monthly,
                sp.price_yearly,
                sp.features,
                sp.limits
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.organization_id = $1
        `, [organizationId]);

        return result.rows[0] || null;
    }

    /**
     * Get all available plans
     * @returns {Array} Active plans
     */
    async getAvailablePlans() {
        const result = await this.pool.query(`
            SELECT * FROM subscription_plans 
            WHERE is_active = true 
            ORDER BY sort_order
        `);
        return result.rows;
    }
}

module.exports = StripeSubscriptionService;
