/**
 * Landing Pages Routes
 * Public landing-page serving and analytics collection.
 */

const express = require('express');
const publicRoutes = require('./pages/public.routes');

module.exports = (pool, _authenticateJWT, publicRateLimit) => {
    const router = express.Router();

    router.use(publicRoutes({ pool, publicRateLimit }));

    return router;
};
