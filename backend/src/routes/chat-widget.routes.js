/**
 * Chat Widget Routes
 * Handles chat widget configuration and public chat endpoints
 */

const express = require('express');
const publicRoutes = require('./chat-widget/public.routes');

module.exports = (pool, _authenticateJWT, publicRateLimit, io, broadcast) => {
    const router = express.Router();

    router.use(publicRoutes(pool, publicRateLimit, io, broadcast));

    return router;
};
