/**
 * Invoices route module composer.
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

const createProductsRoutes = require('./invoices/products.routes');
const createEmailPreviewRoutes = require('./invoices/email-preview.routes');
const createPaymentsRoutes = require('./invoices/payments.routes');
const createBusinessesRoutes = require('./invoices/businesses.routes');
const createSettingsRoutes = require('./invoices/settings.routes');
const createStripeWebhookRoutes = require('./invoices/stripe-webhook.routes');
const createCrudRoutes = require('./invoices/crud.routes');
const createActionRoutes = require('./invoices/actions.routes');

// Stripe initialization (will be null if not configured)
let stripe = null;
try {
    if (process.env.STRIPE_SECRET_KEY) {
        stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    }
} catch (e) {
    logger.info('Stripe not configured - payment features limited');
}

module.exports = (pool, authenticateJWT, _publicRateLimit) => {
    // Use shared organization middleware (Phase 5.3)
    const { requireOrganization } = require('../middleware/organization')(pool);

    router.use(createProductsRoutes({ pool, authenticateJWT, requireOrganization }));
    router.use(createEmailPreviewRoutes({ pool, authenticateJWT, requireOrganization }));
    router.use(createPaymentsRoutes({ pool, authenticateJWT, requireOrganization }));
    router.use(createBusinessesRoutes({ pool, authenticateJWT, requireOrganization }));
    router.use(createSettingsRoutes({ pool, authenticateJWT, requireOrganization }));
    router.use(createStripeWebhookRoutes({ pool, stripe }));
    router.use(createCrudRoutes({ pool, authenticateJWT, requireOrganization }));
    router.use(createActionRoutes({ pool, authenticateJWT, requireOrganization, stripe }));

    return router;
};
