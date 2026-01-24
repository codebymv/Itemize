/**
 * Stripe Service - Payment Processing
 * Simplified pattern following gleamai implementation
 */

const Stripe = require('stripe');
const { logger } = require('../utils/logger');
const {
    PLANS,
    PLAN_PRICING,
    STRIPE_PRICE_TO_PLAN,
    PLAN_TO_STRIPE_PRICES,
    PLAN_TIER_ORDER,
    EMAIL_LIMITS,
    SMS_LIMITS,
    API_LIMITS,
    CONTACTS_LIMITS,
    USERS_LIMITS,
    WORKFLOW_LIMITS,
    LANDING_PAGE_LIMITS,
    FORM_LIMITS,
    CALENDAR_LIMITS,
    getPlanFromStripePrice
} = require('../lib/subscription.constants');

class StripeService {
    constructor(pool) {
        this.pool = pool;
        
        // Initialize Stripe with secret key
        const apiKey = process.env.STRIPE_SECRET_KEY;
        if (!apiKey) {
            logger.warn('[Stripe] No STRIPE_SECRET_KEY configured - Stripe features will not work');
        }
        this.stripe = new Stripe(apiKey || 'sk_test_placeholder', {
            apiVersion: '2023-10-16'
        });
    }

    /**
     * Check if Stripe is configured
     */
    isConfigured() {
        return !!process.env.STRIPE_SECRET_KEY;
    }

    /**
     * Get or create a Stripe Customer for an organization
     */
    async getOrCreateCustomer(organizationId, orgData) {
        // Check if org already has a customer
        const result = await this.pool.query(
            'SELECT stripe_customer_id, name FROM organizations WHERE id = $1',
            [organizationId]
        );
        
        const org = result.rows[0];
        if (!org) {
            throw new Error('Organization not found');
        }

        if (org.stripe_customer_id) {
            return org.stripe_customer_id;
        }

        try {
            // Create new customer in Stripe
            const customer = await this.stripe.customers.create({
                email: orgData.email,
                name: org.name || orgData.name,
                metadata: {
                    organizationId: organizationId.toString()
                }
            });

            // Save customer ID to database
            await this.pool.query(
                'UPDATE organizations SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
                [customer.id, organizationId]
            );

            logger.info('[Stripe] Created new customer', { organizationId, customerId: customer.id });
            return customer.id;
        } catch (error) {
            logger.error('[Stripe] Failed to create customer:', error);
            throw error;
        }
    }

    /**
     * Create a Checkout Session for subscription or one-time payment
     */
    async createCheckoutSession(organizationId, priceId, mode, successUrl, cancelUrl) {
        if (!this.isConfigured()) {
            throw new Error('Stripe is not configured');
        }

        // Get organization data
        const orgResult = await this.pool.query(
            'SELECT name, stripe_customer_id FROM organizations WHERE id = $1',
            [organizationId]
        );
        const org = orgResult.rows[0];
        if (!org) {
            throw new Error('Organization not found');
        }

        // Get or create customer
        const customerId = await this.getOrCreateCustomer(organizationId, { 
            name: org.name,
            email: `org-${organizationId}@itemize.cloud` // fallback email
        });

        try {
            const session = await this.stripe.checkout.sessions.create({
                customer: customerId,
                mode,
                payment_method_types: ['card'],
                line_items: [{
                    price: priceId,
                    quantity: 1
                }],
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: {
                    organizationId: organizationId.toString(),
                    type: mode === 'payment' ? 'one_time_purchase' : 'subscription_upgrade'
                }
            });

            if (!session.url) {
                throw new Error('Failed to generate session URL');
            }

            logger.info('[Stripe] Created checkout session', { organizationId, sessionId: session.id });
            return session.url;
        } catch (error) {
            logger.error('[Stripe] Failed to create checkout session:', error);
            throw error;
        }
    }

    /**
     * Create a Customer Portal session for managing subscriptions
     */
    async createPortalSession(organizationId, returnUrl) {
        if (!this.isConfigured()) {
            throw new Error('Stripe is not configured');
        }

        const result = await this.pool.query(
            'SELECT stripe_customer_id FROM organizations WHERE id = $1',
            [organizationId]
        );

        const customerId = result.rows[0]?.stripe_customer_id;
        if (!customerId) {
            throw new Error('No billing account found. Please subscribe first.');
        }

        try {
            const session = await this.stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl
            });

            logger.info('[Stripe] Created portal session', { organizationId, sessionId: session.id });
            return session.url;
        } catch (error) {
            logger.error('[Stripe] Failed to create portal session:', error);
            throw error;
        }
    }

    /**
     * Handle Webhook Events
     * This should be called from the webhook route handler
     */
    async handleWebhook(signature, payload) {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            logger.error('[Stripe] Webhook secret not configured');
            throw new Error('Webhook secret not configured');
        }

        let event;

        try {
            event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`[Stripe] Webhook signature verification failed: ${message}`);
            throw new Error(`Webhook Error: ${message}`);
        }

        logger.info(`[Stripe] Received webhook event: ${event.type}`);

        try {
            switch (event.type) {
                case 'checkout.session.completed':
                    await this.handleCheckoutCompleted(event.data.object);
                    break;
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    await this.handleSubscriptionUpdated(event.data.object);
                    break;
                case 'customer.subscription.deleted':
                    await this.handleSubscriptionDeleted(event.data.object);
                    break;
                case 'invoice.payment_failed':
                    await this.handlePaymentFailed(event.data.object);
                    break;
                default:
                    logger.debug(`[Stripe] Unhandled event type: ${event.type}`);
            }
        } catch (error) {
            logger.error('[Stripe] Error handling webhook event:', error);
            throw error;
        }
    }

    /**
     * Handle checkout session completed
     */
    async handleCheckoutCompleted(session) {
        const organizationId = parseInt(session.metadata?.organizationId);
        const type = session.metadata?.type;

        if (!organizationId) {
            logger.warn('[Stripe] Webhook missing organizationId in metadata');
            return;
        }

        if (type === 'one_time_purchase') {
            // Handle one-time purchases (e.g., credit purchases) if needed
            logger.info(`[Stripe] One-time purchase completed for org ${organizationId}`);
        }
        // Subscription upgrades are handled by subscription.updated webhook
    }

    /**
     * Handle subscription created/updated
     * Updates organization with new plan and limits
     */
    async handleSubscriptionUpdated(subscription) {
        const customerId = subscription.customer;
        const status = subscription.status;

        // Find organization by Stripe customer ID
        const orgResult = await this.pool.query(
            'SELECT id, plan, billing_period_start FROM organizations WHERE stripe_customer_id = $1',
            [customerId]
        );

        const org = orgResult.rows[0];
        if (!org) {
            logger.warn(`[Stripe] No organization found for customer ${customerId}`);
            return;
        }

        let plan = PLANS.STARTER; // Default to starter

        if (status === 'active' || status === 'trialing') {
            const priceId = subscription.items?.data[0]?.price?.id;
            if (priceId) {
                const mappedPlan = getPlanFromStripePrice(priceId);
                if (mappedPlan) {
                    plan = mappedPlan;
                } else {
                    logger.warn(`[Stripe] Unmapped price ID ${priceId} for org ${org.id}, keeping existing plan`);
                    plan = org.plan || PLANS.STARTER;
                }
            }
        }

        // Get plan limits from constants
        const emailsLimit = EMAIL_LIMITS[plan] === Infinity ? -1 : EMAIL_LIMITS[plan];
        const smsLimit = SMS_LIMITS[plan] === Infinity ? -1 : SMS_LIMITS[plan];
        const apiLimit = API_LIMITS[plan] === Infinity ? -1 : API_LIMITS[plan];
        const contactsLimit = CONTACTS_LIMITS[plan] === Infinity ? -1 : CONTACTS_LIMITS[plan];
        const usersLimit = USERS_LIMITS[plan] === Infinity ? -1 : USERS_LIMITS[plan];
        const workflowsLimit = WORKFLOW_LIMITS[plan] === Infinity ? -1 : WORKFLOW_LIMITS[plan];
        const landingPagesLimit = LANDING_PAGE_LIMITS[plan] === Infinity ? -1 : LANDING_PAGE_LIMITS[plan];
        const formsLimit = FORM_LIMITS[plan] === Infinity ? -1 : FORM_LIMITS[plan];
        const calendarsLimit = CALENDAR_LIMITS[plan] === Infinity ? -1 : CALENDAR_LIMITS[plan];

        // Check if billing period changed (new billing cycle)
        const currentPeriodStart = subscription.current_period_start 
            ? new Date(subscription.current_period_start * 1000) 
            : null;
        const currentPeriodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : null;

        let resetUsage = false;
        if (currentPeriodStart) {
            if (!org.billing_period_start) {
                resetUsage = true;
            } else {
                const previousPeriodStart = new Date(org.billing_period_start);
                if (currentPeriodStart.getTime() > previousPeriodStart.getTime()) {
                    resetUsage = true;
                }
            }
        }

        // Determine billing period (monthly or yearly)
        let billingPeriod = 'monthly';
        const priceId = subscription.items?.data[0]?.price?.id;
        if (priceId && priceId.includes('yearly')) {
            billingPeriod = 'yearly';
        }

        // Update organization with subscription data
        await this.pool.query(`
            UPDATE organizations SET
                plan = $1,
                subscription_status = $2,
                stripe_subscription_id = $3,
                billing_period = $4,
                billing_period_start = $5,
                billing_period_end = $6,
                emails_limit = $7,
                sms_limit = $8,
                api_calls_limit = $9,
                contacts_limit = $10,
                users_limit = $11,
                workflows_limit = $12,
                landing_pages_limit = $13,
                forms_limit = $14,
                calendars_limit = $15,
                cancel_at_period_end = $16,
                trial_ends_at = $17,
                ${resetUsage ? 'emails_used = 0, sms_used = 0, api_calls_used = 0,' : ''}
                updated_at = NOW()
            WHERE id = $18
        `, [
            plan,
            status,
            subscription.id,
            billingPeriod,
            currentPeriodStart,
            currentPeriodEnd,
            emailsLimit,
            smsLimit,
            apiLimit,
            contactsLimit,
            usersLimit,
            workflowsLimit,
            landingPagesLimit,
            formsLimit,
            calendarsLimit,
            subscription.cancel_at_period_end || false,
            subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
            org.id
        ]);

        logger.info(`[Stripe] Updated org ${org.id} subscription: plan=${plan}, status=${status}, reset=${resetUsage}`);

        // Check for upgrade and send email if needed
        const previousPlan = org.plan;
        const planRank = PLAN_TIER_ORDER;
        
        if (planRank[plan] > planRank[previousPlan]) {
            logger.info(`[Stripe] Organization ${org.id} upgraded from ${previousPlan} to ${plan}`);
            // TODO: Send upgrade email
        }
    }

    /**
     * Handle subscription deleted (canceled)
     */
    async handleSubscriptionDeleted(subscription) {
        const customerId = subscription.customer;

        const orgResult = await this.pool.query(
            'SELECT id FROM organizations WHERE stripe_customer_id = $1',
            [customerId]
        );

        const org = orgResult.rows[0];
        if (!org) {
            logger.warn(`[Stripe] No organization found for customer ${customerId} (subscription deleted)`);
            return;
        }

        // Downgrade to starter (or handle as you see fit)
        await this.pool.query(`
            UPDATE organizations SET
                subscription_status = 'canceled',
                canceled_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
        `, [org.id]);

        logger.info(`[Stripe] Subscription deleted for org ${org.id}`);
    }

    /**
     * Handle failed payment
     */
    async handlePaymentFailed(invoice) {
        if (!invoice.subscription) return;

        const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription);
        const customerId = subscription.customer;

        const orgResult = await this.pool.query(
            'SELECT id FROM organizations WHERE stripe_customer_id = $1',
            [customerId]
        );

        const org = orgResult.rows[0];
        if (!org) return;

        await this.pool.query(`
            UPDATE organizations SET
                subscription_status = 'past_due',
                updated_at = NOW()
            WHERE id = $1
        `, [org.id]);

        logger.info(`[Stripe] Payment failed for org ${org.id}, status set to past_due`);
    }

    /**
     * Get billing status for an organization
     */
    async getBillingStatus(organizationId) {
        const result = await this.pool.query(`
            SELECT 
                plan,
                subscription_status,
                billing_period,
                billing_period_start,
                billing_period_end,
                stripe_customer_id,
                stripe_subscription_id,
                emails_used,
                emails_limit,
                sms_used,
                sms_limit,
                api_calls_used,
                api_calls_limit,
                contacts_limit,
                users_limit,
                workflows_limit,
                landing_pages_limit,
                forms_limit,
                calendars_limit,
                trial_ends_at,
                cancel_at_period_end,
                canceled_at
            FROM organizations
            WHERE id = $1
        `, [organizationId]);

        return result.rows[0] || null;
    }
}

module.exports = StripeService;
