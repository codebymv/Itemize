/**
 * Social Media Integration Routes
 * Facebook/Instagram messaging and connection management
 */

const express = require('express');
const oauthRoutes = require('./social/oauth.routes');
const webhookRoutes = require('./social/webhook.routes');

module.exports = (pool, authenticateJWT, publicRateLimit, io) => {
    const router = express.Router();
    const { requireOrganization } = require('../middleware/organization')(pool);

    router.use(oauthRoutes(pool, authenticateJWT, requireOrganization));
    router.use(webhookRoutes(pool, io, publicRateLimit));

    return router;
};
