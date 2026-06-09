/**
 * Reputation Management Routes
 * Review collection, management, and widgets
 */

const express = require('express');
const platformsRoutes = require('./reputation/platforms.routes');
const reviewsRoutes = require('./reputation/reviews.routes');
const requestsRoutes = require('./reputation/requests.routes');
const widgetsRoutes = require('./reputation/widgets.routes');
const settingsRoutes = require('./reputation/settings.routes');
const analyticsRoutes = require('./reputation/analytics.routes');
const publicRoutes = require('./reputation/public.routes');

module.exports = (pool, authenticateJWT, publicRateLimit) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    function getSentiment(rating) {
        if (rating >= 4) return 'positive';
        if (rating >= 3) return 'neutral';
        return 'negative';
    }

    const protectedContext = { pool, authenticateJWT, requireOrganization, getSentiment };
    const publicContext = { pool, publicRateLimit, getSentiment };

    router.use(platformsRoutes(protectedContext));
    router.use(reviewsRoutes(protectedContext));
    router.use(requestsRoutes(protectedContext));
    router.use(widgetsRoutes(protectedContext));
    router.use(settingsRoutes(protectedContext));
    router.use(analyticsRoutes(protectedContext));
    router.use(publicRoutes(publicContext));

    return router;
};
