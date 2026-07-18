/**
 * Chat Widget Routes
 * Handles chat widget configuration and public chat endpoints
 */

const express = require('express');
const managementRoutes = require('./chat-widget/management.routes');
const sessionsRoutes = require('./chat-widget/sessions.routes');
const publicRoutes = require('./chat-widget/public.routes');

module.exports = (pool, authenticateJWT, publicRateLimit, io, broadcast) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    router.use(managementRoutes(pool, authenticateJWT, requireOrganization));
    router.use(sessionsRoutes(pool, authenticateJWT, requireOrganization, io));
    router.use(publicRoutes(pool, publicRateLimit, io, broadcast));

    return router;
};
