/**
 * Reputation Management Routes
 * Anonymous reputation capability routes.
 *
 * Authenticated reputation management is permanently served by NestJS GraphQL.
 */

const express = require('express');
const publicRoutes = require('./reputation/public.routes');

module.exports = (pool, _authenticateJWT, publicRateLimit) => {
    const router = express.Router();

    function getSentiment(rating) {
        if (rating >= 4) return 'positive';
        if (rating >= 3) return 'neutral';
        return 'negative';
    }

    const publicContext = { pool, publicRateLimit, getSentiment };

    router.use(publicRoutes(publicContext));

    return router;
};
