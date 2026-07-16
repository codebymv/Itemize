/**
 * Social Media Integration Routes
 * Facebook/Instagram messaging and connection management
 */

const express = require('express');
const oauthRoutes = require('./social/oauth.routes');
const channelsRoutes = require('./social/channels.routes');
const conversationsRoutes = require('./social/conversations.routes');
const webhookRoutes = require('./social/webhook.routes');
const analyticsRoutes = require('./social/analytics.routes');

module.exports = (pool, authenticateJWT, publicRateLimit, io) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    router.use(oauthRoutes(pool, authenticateJWT, requireOrganization));
    router.use(channelsRoutes(pool, authenticateJWT, requireOrganization));
    router.use(conversationsRoutes(pool, authenticateJWT, requireOrganization, io));
    router.use(webhookRoutes(pool, io, publicRateLimit));
    router.use(analyticsRoutes(pool, authenticateJWT, requireOrganization));

    return router;
};
