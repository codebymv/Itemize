/**
 * Vaults Routes
 * Handles encrypted vault CRUD operations and sharing
 */
const express = require('express');
const crudRoutes = require('./vaults/crud.routes');
const itemsRoutes = require('./vaults/items.routes');
const sharingRoutes = require('./vaults/sharing.routes');
const passwordRoutes = require('./vaults/password.routes');

/**
 * Create vaults routes with injected dependencies
 * @param {Object} pool - Database connection pool
 * @param {Function} authenticateJWT - JWT authentication middleware
 * @param {Object} broadcast - Broadcast functions for WebSocket updates
 */
module.exports = (pool, authenticateJWT, _broadcast) => {
    const router = express.Router();

    router.use(crudRoutes(pool, authenticateJWT));
    router.use(itemsRoutes(pool, authenticateJWT));
    router.use(sharingRoutes(pool, authenticateJWT));
    router.use(passwordRoutes(pool, authenticateJWT));

    return router;
};
