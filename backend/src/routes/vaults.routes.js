/**
 * Vaults Routes
 * Handles encrypted vault CRUD operations and sharing
 */
const express = require('express');
const sharingRoutes = require('./vaults/sharing.routes');
const passwordRoutes = require('./vaults/password.routes');

/**
 * Create vaults routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 * @param {Object} broadcast - Broadcast functions for WebSocket updates
 */
module.exports = (pool, authenticateJWT, _broadcast, publicRateLimit) => {
    const router = express.Router();

    router.use(sharingRoutes(pool, authenticateJWT, publicRateLimit));
    router.use(passwordRoutes(pool, authenticateJWT));

    return router;
};
